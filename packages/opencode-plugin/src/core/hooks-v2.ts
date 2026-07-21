/**
 * V2 runtime-hook adapter.
 *
 * Hook behavior remains owned by the V1 factories. This module creates their
 * merged Hooks object once, then adapts the runtime events supplied by V2.
 */

import { getEffectiveThinkingLevels } from "../features/setup/index.js";
import { type CapabilityResult, resolveCapabilities } from "../features/thinking/capability.js";
import { resolveThinkingValue } from "../features/thinking/resolve.js";
import { DEFAULT_HOOK_FACTORIES, createHooks } from "../hooks/index.js";
import type { Hooks } from "../hooks/types.js";
import { log, logError } from "../shared/logger.js";
import { AGENT_ROLES, type AgentRole } from "./constants.js";
import type { PluginContext } from "./types.js";
import type {
  V2AgentDraft,
  V2CatalogDraft,
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

export interface V2HooksRegistration {
  reloadThinkingLevels(): Promise<void>;
  dispose(): Promise<void>;
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

function getV2SessionID(event: {
  readonly sessionID?: string;
  readonly context?: unknown;
}): string {
  if (typeof event.sessionID === "string") return event.sessionID;
  if (!isRecord(event.context) || typeof event.context.sessionID !== "string") return "";
  return event.context.sessionID;
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
        sessionID: getV2SessionID(event),
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

function getGoopRole(agentID: string): AgentRole | undefined {
  if (!agentID.startsWith("goop-")) return undefined;
  const role = agentID.slice("goop-".length);
  return (AGENT_ROLES as readonly string[]).includes(role) ? (role as AgentRole) : undefined;
}

function catalogKey(providerID: string, modelID: string): string {
  return `${providerID}\u0000${modelID}`;
}

function captureCatalogCapabilities(
  draft: V2CatalogDraft,
  capabilitiesByModel: Map<string, CapabilityResult>,
): void {
  capabilitiesByModel.clear();
  for (const record of draft.provider.list()) {
    for (const [modelID, model] of record.models) {
      capabilitiesByModel.set(catalogKey(record.provider.id, modelID), resolveCapabilities(model));
    }
  }
}

function applyThinkingLevelsToAgents(
  draft: V2AgentDraft,
  ctx: PluginContext,
  capabilitiesByModel: ReadonlyMap<string, CapabilityResult>,
): void {
  const levels = getEffectiveThinkingLevels(ctx.sdk.directory);

  for (const candidate of draft.list()) {
    const role = getGoopRole(candidate.id);
    const model = candidate.model;
    if (!role || !model) continue;

    const capabilities = capabilitiesByModel.get(catalogKey(model.providerID, model.id));
    const resolution = resolveThinkingValue(
      levels[role],
      capabilities ?? resolveCapabilities(undefined),
    );
    if (resolution.apply === null) {
      logError(
        `GoopSpec ${candidate.id}: ${resolution.warning ?? "preserving the provider default."}`,
      );
      continue;
    }

    if (typeof resolution.apply === "string") continue;
    const variant = resolution.apply;
    draft.update(candidate.id, (agent) => {
      agent.request.headers = { ...agent.request.headers, ...variant.headers };
      agent.request.body = { ...agent.request.body, ...variant.body };
      if (agent.model) agent.model.variant = variant.id;
    });
  }
}

async function registerThinkingLevelAgentTransform(
  runtimeCtx: V2RuntimeContext,
  ctx: PluginContext,
): Promise<() => Promise<void>> {
  const agentCapability = runtimeCtx.agent;
  const catalogCapability = runtimeCtx.catalog;
  if (
    !agentCapability ||
    typeof agentCapability.transform !== "function" ||
    !catalogCapability ||
    typeof catalogCapability.transform !== "function"
  ) {
    log("V2 thinking-level transform skipped: agent or catalog capability is unavailable");
    return async () => {};
  }

  const capabilitiesByModel = new Map<string, CapabilityResult>();
  try {
    await catalogCapability.transform((draft) => {
      captureCatalogCapabilities(draft, capabilitiesByModel);
    });
    await agentCapability.transform((draft) => {
      applyThinkingLevelsToAgents(draft, ctx, capabilitiesByModel);
    });
  } catch (error) {
    logError("V2 thinking-level agent transform registration failed", error);
  }

  return async (): Promise<void> => {
    try {
      await catalogCapability.transform((draft) => {
        captureCatalogCapabilities(draft, capabilitiesByModel);
      });
      await agentCapability.transform((draft) => {
        applyThinkingLevelsToAgents(draft, ctx, capabilitiesByModel);
      });
      if (typeof catalogCapability.reload === "function") await catalogCapability.reload();
      if (typeof agentCapability.reload === "function") await agentCapability.reload();
    } catch (error) {
      logError("V2 thinking-level live reload failed", error);
    }
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
): Promise<V2HooksRegistration> {
  const hooks = createHooks(ctx, [...DEFAULT_HOOK_FACTORIES]);
  const sessionCapability = runtimeCtx.session;
  const toolCapability = runtimeCtx.tool;

  const reloadThinkingLevels = await registerThinkingLevelAgentTransform(runtimeCtx, ctx);

  if (hooks["experimental.chat.system.transform"]) {
    if (!sessionCapability || typeof sessionCapability.hook !== "function") {
      logError("V2 system hook registration skipped: runtime session capability is unavailable");
    } else {
      const handler = hooks["experimental.chat.system.transform"];
      try {
        await sessionCapability.hook("request", async (event) => {
          const system = asSystemMessages(event);
          if (!system) return;
          await handler({ sessionID: getV2SessionID(event), model: {} as never }, { system });
        });
      } catch (error) {
        logError("V2 system hook registration failed", error);
      }
    }
  }

  const before = hooks["tool.execute.before"];
  const after = hooks["tool.execute.after"];
  if (!before && !after) {
    return { reloadThinkingLevels, dispose: async () => {} };
  }

  if (!toolCapability || typeof toolCapability.hook !== "function") {
    logError("V2 tool hook registration skipped: runtime tool capability is unavailable");
    return { reloadThinkingLevels, dispose: async () => {} };
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

  return { reloadThinkingLevels, dispose: async () => {} };
}
