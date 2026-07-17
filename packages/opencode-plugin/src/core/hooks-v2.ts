/**
 * V2 runtime-hook adapter.
 *
 * Hook behavior remains owned by the V1 factories. This module creates their
 * merged Hooks object once, then adapts the runtime events supplied by V2.
 */

import { DEFAULT_HOOK_FACTORIES, createHooks } from "../hooks/index.js";
import type { Hooks } from "../hooks/types.js";
import { log, logError } from "../shared/logger.js";
import type { PluginContext } from "./types.js";
import type {
  V2RuntimeContext,
  V2SessionRequestEvent,
  V2ToolExecuteAfterEvent,
  V2ToolExecuteBeforeEvent,
} from "./v2-compat.js";

type V1ToolInput = {
  tool: string;
  sessionID: string;
  callID: string;
  args: Record<string, unknown>;
};

type V1ToolBeforeOutput = {
  args: Record<string, unknown>;
};

type V1ToolAfterOutput = {
  title: string;
  output: string;
  metadata: Record<string, unknown>;
};

interface PendingToolCall {
  readonly input: V1ToolInput;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asSystemMessages(event: V2SessionRequestEvent): string[] | null {
  if (
    !Array.isArray(event.system) ||
    !event.system.every((message) => typeof message === "string")
  ) {
    log("V2 session request skipped: system is not a mutable string array");
    return null;
  }

  return event.system as string[];
}

function createToolCallQueue(): {
  before(
    event: V2ToolExecuteBeforeEvent,
    handler: NonNullable<Hooks["tool.execute.before"]>,
  ): Promise<void>;
  after(
    event: V2ToolExecuteAfterEvent,
    handler: NonNullable<Hooks["tool.execute.after"]>,
  ): Promise<void>;
} {
  const pendingByTool = new Map<string, PendingToolCall[]>();
  let nextCallId = 0;

  return {
    async before(event, handler): Promise<void> {
      if (!isRecord(event.input)) {
        log("V2 tool before hook skipped: tool input is not an object", { tool: event.tool });
        return;
      }

      const input: V1ToolInput = {
        tool: event.tool,
        sessionID: "",
        callID: `v2-${++nextCallId}`,
        args: event.input,
      };
      const pending = pendingByTool.get(event.tool) ?? [];
      pending.push({ input });
      pendingByTool.set(event.tool, pending);

      const output: V1ToolBeforeOutput = { args: event.input };
      await handler(input, output);
      event.input = output.args;
    },

    async after(event, handler): Promise<void> {
      const pending = pendingByTool.get(event.tool);
      const call = pending?.shift();
      if (pending?.length === 0) pendingByTool.delete(event.tool);

      if (!call) {
        log("V2 tool after hook skipped: no matching before event", { tool: event.tool });
        return;
      }

      if (!isRecord(event.output) || typeof event.output.output !== "string") {
        log("V2 tool after hook skipped: output cannot be adapted", { tool: event.tool });
        return;
      }

      const output = event.output as V1ToolAfterOutput;
      if (!isRecord(output.metadata)) output.metadata = {};
      if (typeof output.title !== "string") output.title = "";

      await handler(call.input, output);
      event.output = output;
    },
  };
}

/**
 * Register V1 GoopSpec hook behavior with documented V2 runtime hooks.
 *
 * V2 does not expose equivalents for config, chat-message, command,
 * permission, event, or compaction hooks, so those handlers remain V1-only.
 * V2's documented tool events omit a call identifier; pending calls are paired
 * best-effort in per-tool FIFO order.
 */
export async function registerHooksV2(
  runtimeCtx: V2RuntimeContext,
  ctx: PluginContext,
): Promise<void> {
  const hooks = createHooks(ctx, [...DEFAULT_HOOK_FACTORIES]);
  const sessionCapability = runtimeCtx.session;
  const toolCapability = runtimeCtx.tool;

  if (hooks["experimental.chat.system.transform"]) {
    if (!sessionCapability || typeof sessionCapability.hook !== "function") {
      logError("V2 system hook registration skipped: runtime session capability is unavailable");
    } else {
      const handler = hooks["experimental.chat.system.transform"];
      try {
        await sessionCapability.hook("request", async (event) => {
          const system = asSystemMessages(event);
          if (!system) return;
          await handler({ model: {} as never }, { system });
        });
      } catch (error) {
        logError("V2 system hook registration failed", error);
      }
    }
  }

  const before = hooks["tool.execute.before"];
  const after = hooks["tool.execute.after"];
  if (!before && !after) return;

  if (!toolCapability || typeof toolCapability.hook !== "function") {
    logError("V2 tool hook registration skipped: runtime tool capability is unavailable");
    return;
  }

  const queue = createToolCallQueue();
  if (before) {
    try {
      await toolCapability.hook("execute.before", (event) => queue.before(event, before));
    } catch (error) {
      logError("V2 tool before hook registration failed", error);
    }
  }

  if (after) {
    try {
      await toolCapability.hook("execute.after", (event) => queue.after(event, after));
    } catch (error) {
      logError("V2 tool after hook registration failed", error);
    }
  }

  log("Registered GoopSpec runtime hooks with V2", {
    system: Boolean(hooks["experimental.chat.system.transform"]),
    before: Boolean(before),
    after: Boolean(after),
    skipped: [
      "config",
      "chat.message",
      "command.execute.before",
      "permission.ask",
      "event",
      "experimental.session.compacting",
    ],
  });
}
