import { afterEach, describe, expect, it, spyOn } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { DEFAULT_HOOK_FACTORIES, createHooks } from "../hooks/index.js";
import { clearMemoryCache } from "../hooks/system-transform.js";
import {
  type PluginContext,
  createMockPluginContext,
  setupTestEnvironment,
} from "../test-utils.js";
import { registerHooksV2 } from "./hooks-v2.js";
import type {
  V2AgentDraft,
  V2AgentInfo,
  V2CatalogDraft,
  V2RuntimeContext,
  V2SessionRequestEvent,
  V2ToolExecuteAfterEvent,
  V2ToolExecuteBeforeEvent,
} from "./v2-compat.js";

interface Registrations {
  request?: (event: V2SessionRequestEvent) => void | Promise<void>;
  before?: (event: V2ToolExecuteBeforeEvent) => void | Promise<void>;
  after?: (event: V2ToolExecuteAfterEvent) => void | Promise<void>;
  agentTransform?: (draft: V2AgentDraft) => void | Promise<void>;
  catalogTransform?: (draft: V2CatalogDraft) => void | Promise<void>;
  agentTransforms: number;
  catalogTransforms: number;
  agentReloads: number;
  catalogReloads: number;
}

function createRuntimeContext(
  registrations: Registrations,
  drafts: { agent?: V2AgentDraft; catalog?: V2CatalogDraft } = {},
): V2RuntimeContext {
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
    agent: {
      transform: async (callback: (draft: V2AgentDraft) => void | Promise<void>) => {
        registrations.agentTransforms++;
        registrations.agentTransform = callback;
        if (drafts.agent) await callback(drafts.agent);
      },
      reload: async () => {
        registrations.agentReloads++;
      },
    },
    catalog: {
      transform: async (callback: (draft: V2CatalogDraft) => void | Promise<void>) => {
        registrations.catalogTransforms++;
        registrations.catalogTransform = callback;
        if (drafts.catalog) await callback(drafts.catalog);
      },
      reload: async () => {
        registrations.catalogReloads++;
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
    const registrations: Registrations = {
      agentTransforms: 0,
      catalogTransforms: 0,
      agentReloads: 0,
      catalogReloads: 0,
    };
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
    const registrations: Registrations = {
      agentTransforms: 0,
      catalogTransforms: 0,
      agentReloads: 0,
      catalogReloads: 0,
    };
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

  it("preserves V2 session IDs for compaction-halt across request turns", async () => {
    const ctx = createMockPluginContext();
    contexts.push(ctx);
    Object.defineProperty(ctx, "sessionManager", { configurable: true, value: {} });
    const sessionID = "v2-compaction-session";
    ctx.pendingCompactions.set(sessionID, {
      model: { providerID: "openai", modelID: "gpt-5" },
      status: "queued",
      queuedAtMs: 1_000,
    });
    const pendingGet = spyOn(ctx.pendingCompactions, "get");
    const registrations: Registrations = {
      agentTransforms: 0,
      catalogTransforms: 0,
      agentReloads: 0,
      catalogReloads: 0,
    };

    await registerHooksV2(createRuntimeContext(registrations), ctx);

    await registrations.request?.({ sessionID, system: [], messages: [], tools: {} });
    const sameTurnOutput = { title: "result", output: "same turn", metadata: {} };
    await registrations.before?.({ tool: "bash", sessionID, input: { command: "pwd" } });
    await registrations.after?.({
      tool: "bash",
      sessionID,
      result: undefined,
      output: sameTurnOutput,
      outputPaths: [],
    });

    expect(pendingGet).toHaveBeenLastCalledWith(sessionID);
    expect(sameTurnOutput.output).toBe("same turn");

    await registrations.request?.({ sessionID, system: [], messages: [], tools: {} });
    const laterTurnOutput = { title: "result", output: "later turn", metadata: {} };
    await registrations.before?.({ tool: "bash", sessionID, input: { command: "pwd" } });
    await registrations.after?.({
      tool: "bash",
      sessionID,
      result: undefined,
      output: laterTurnOutput,
      outputPaths: [],
    });

    expect(pendingGet).toHaveBeenLastCalledWith(sessionID);
    expect(laterTurnOutput.output).toContain("COMPACTION PENDING — END YOUR TURN");
  });

  it("does not throw when runtime hook capabilities are absent", async () => {
    const ctx = createMockPluginContext();
    contexts.push(ctx);

    await expect(registerHooksV2({} as V2RuntimeContext, ctx)).resolves.toEqual({
      reloadThinkingLevels: expect.any(Function),
      dispose: expect.any(Function),
    });
  });

  it("re-runs transforms with changed config before reloading capabilities", async () => {
    const env = setupTestEnvironment("v2-thinking-live-reload");
    const ctx = createMockPluginContext({ testDir: env.testDir, db: env.db });
    contexts.push(ctx);
    writeFileSync(
      join(ctx.sdk.directory, "goopspec.json"),
      JSON.stringify({ agentThinkingLevels: { "executor-high": "medium" } }),
    );
    const agent: V2AgentInfo = {
      id: "goop-executor-high",
      model: { providerID: "openai", id: "gpt-test" },
      request: { headers: {}, body: {} },
    };
    const catalog: V2CatalogDraft = {
      provider: {
        list: () => [
          {
            provider: { id: "openai" },
            models: new Map([
              [
                "gpt-test",
                {
                  variants: [
                    { id: "medium", headers: {}, body: { reasoning_effort: "medium" } },
                    { id: "high", headers: {}, body: { reasoning_effort: "high" } },
                  ],
                },
              ],
            ]),
          },
        ],
      },
    };
    const agents: V2AgentDraft = {
      list: () => [agent],
      update: (_id, update) => update(agent),
    };
    const registrations: Registrations = {
      agentTransforms: 0,
      catalogTransforms: 0,
      agentReloads: 0,
      catalogReloads: 0,
    };

    const hooks = await registerHooksV2(
      createRuntimeContext(registrations, { agent: agents, catalog }),
      ctx,
    );
    expect(agent.model?.variant).toBe("medium");
    writeFileSync(
      join(ctx.sdk.directory, "goopspec.json"),
      JSON.stringify({ agentThinkingLevels: { "executor-high": "high" } }),
    );
    await hooks.reloadThinkingLevels();

    expect(registrations.catalogTransforms).toBe(2);
    expect(registrations.agentTransforms).toBe(2);
    expect(agent.model?.variant).toBe("high");
    expect(agent.request.body.reasoning_effort).toBe("high");
    expect(registrations.catalogReloads).toBe(1);
    expect(registrations.agentReloads).toBe(1);
    env.cleanup();
  });

  it("degrades without throwing when reloading absent capabilities", async () => {
    const ctx = createMockPluginContext();
    contexts.push(ctx);

    const hooks = await registerHooksV2({} as V2RuntimeContext, ctx);
    await expect(hooks.reloadThinkingLevels()).resolves.toBeUndefined();
  });

  it("applies the selected catalog variant body and headers to GoopSpec agents", async () => {
    const env = setupTestEnvironment("v2-thinking-transform");
    const ctx = createMockPluginContext({ testDir: env.testDir, db: env.db });
    writeFileSync(
      join(ctx.sdk.directory, "goopspec.json"),
      JSON.stringify({ agentThinkingLevels: { "executor-high": "medium" } }),
    );
    const registrations: Registrations = {
      agentTransforms: 0,
      catalogTransforms: 0,
      agentReloads: 0,
      catalogReloads: 0,
    };

    await registerHooksV2(createRuntimeContext(registrations), ctx);
    const agent: V2AgentInfo = {
      id: "goop-executor-high",
      model: { providerID: "openai", id: "gpt-test" },
      request: { headers: { "x-existing": "keep" }, body: { existing: true } },
    };
    const catalog: V2CatalogDraft = {
      provider: {
        list: () => [
          {
            provider: { id: "openai" },
            models: new Map([
              [
                "gpt-test",
                {
                  variants: [
                    {
                      id: "medium",
                      headers: { "x-reasoning": "medium" },
                      body: { reasoning_effort: "medium" },
                    },
                  ],
                },
              ],
            ]),
          },
        ],
      },
    };
    const agents: V2AgentDraft = {
      list: () => [agent],
      update: (_id, update) => update(agent),
    };

    await registrations.catalogTransform?.(catalog);
    await registrations.agentTransform?.(agents);

    expect(agent.model?.variant).toBe("medium");
    expect(agent.request.headers).toEqual({ "x-existing": "keep", "x-reasoning": "medium" });
    expect(agent.request.body).toEqual({ existing: true, reasoning_effort: "medium" });
    env.cleanup();
  });
});
