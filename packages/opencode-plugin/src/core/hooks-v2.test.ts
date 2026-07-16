import { afterEach, describe, expect, it } from "bun:test";

import { DEFAULT_HOOK_FACTORIES, createHooks } from "../hooks/index.js";
import { clearMemoryCache } from "../hooks/system-transform.js";
import { type PluginContext, createMockPluginContext } from "../test-utils.js";
import { registerHooksV2 } from "./hooks-v2.js";
import type {
  V2RuntimeContext,
  V2SessionRequestEvent,
  V2ToolExecuteAfterEvent,
  V2ToolExecuteBeforeEvent,
} from "./v2-compat.js";

interface Registrations {
  request?: (event: V2SessionRequestEvent) => void | Promise<void>;
  before?: (event: V2ToolExecuteBeforeEvent) => void | Promise<void>;
  after?: (event: V2ToolExecuteAfterEvent) => void | Promise<void>;
}

function createRuntimeContext(registrations: Registrations): V2RuntimeContext {
  return {
    session: {
      create: async () => ({}),
      get: async () => ({}),
      prompt: async () => ({}),
      command: async () => ({}),
      synthetic: async () => ({}),
      interrupt: async () => ({}),
      hook: async (
        _event: "request",
        callback: (event: V2SessionRequestEvent) => void | Promise<void>,
      ) => {
        registrations.request = callback;
      },
    },
    tool: {
      transform: async () => {},
      hook: async (
        event: "execute.before" | "execute.after",
        callback:
          | ((event: V2ToolExecuteBeforeEvent) => void | Promise<void>)
          | ((event: V2ToolExecuteAfterEvent) => void | Promise<void>),
      ) => {
        if (event === "execute.before") {
          registrations.before = callback as (
            event: V2ToolExecuteBeforeEvent,
          ) => void | Promise<void>;
        } else {
          registrations.after = callback as (
            event: V2ToolExecuteAfterEvent,
          ) => void | Promise<void>;
        }
      },
    },
  } as unknown as V2RuntimeContext;
}

describe("registerHooksV2()", () => {
  const contexts: PluginContext[] = [];

  afterEach(() => {
    clearMemoryCache();
    for (const context of contexts.splice(0)) context.db.close();
  });

  it("registers the system transform and reuses its canonical V1 handler", async () => {
    const ctx = createMockPluginContext();
    contexts.push(ctx);
    const registrations: Registrations = {};
    const v1System: string[] = [];
    const v2System: string[] = [];

    await registerHooksV2(createRuntimeContext(registrations), ctx);
    await createHooks(ctx, [...DEFAULT_HOOK_FACTORIES])["experimental.chat.system.transform"]?.(
      { model: {} as never },
      { system: v1System },
    );
    await registrations.request?.({ system: v2System, messages: [], tools: {} });

    expect(registrations.request).toBeDefined();
    expect(v2System).toEqual(v1System);
    expect(v2System[0]).toContain("<goopspec_state>");
  });

  it("registers lifecycle hooks and adapts their V1 mutations", async () => {
    const ctx = createMockPluginContext();
    contexts.push(ctx);
    const registrations: Registrations = {};
    const v1Hooks = createHooks(ctx, [...DEFAULT_HOOK_FACTORIES]);

    await registerHooksV2(createRuntimeContext(registrations), ctx);

    const input = {
      filePath: "example.ts",
      content: "// Import dependencies\nconst value = 1;",
    };
    const v1Output: { title: string; output: string; metadata: Record<string, unknown> } = {
      title: "state",
      output: "ok",
      metadata: {},
    };
    const v1Before = v1Hooks["tool.execute.before"];
    const v1After = v1Hooks["tool.execute.after"];
    await v1Before?.({ tool: "write", sessionID: "", callID: "v1-call" }, { args: input });
    await v1After?.({ tool: "write", sessionID: "", callID: "v1-call", args: input }, v1Output);

    const output: { title: string; output: string; metadata: Record<string, unknown> } = {
      title: "state",
      output: "ok",
      metadata: {},
    };
    await registrations.before?.({ tool: "write", input });
    await registrations.after?.({
      tool: "write",
      result: undefined,
      output,
      outputPaths: [],
    });

    expect(registrations.before).toBeDefined();
    expect(registrations.after).toBeDefined();
    expect(v1Output.output).toContain("Comment Quality Notice");
    expect(output.output).toEqual(v1Output.output);
    expect(output.metadata.durationMs).toEqual(expect.any(Number));
  });

  it("does not throw when runtime hook capabilities are absent", async () => {
    const ctx = createMockPluginContext();
    contexts.push(ctx);

    await expect(registerHooksV2({} as V2RuntimeContext, ctx)).resolves.toBeUndefined();
  });
});
