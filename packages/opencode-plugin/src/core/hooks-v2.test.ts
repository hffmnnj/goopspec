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
import { __resetV2LazyAutopilotLimitationLog, registerHooksV2 } from "./hooks-v2.js";
import type {
  V2AgentDraft,
  V2AgentInfo,
  V2CatalogDraft,
  V2CatalogModel,
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

/**
 * Casts host catalog test data through a single, explicit boundary. Real V2
 * hosts publish fields (`reasoning`, `reasoning_options`) that the minimal
 * `V2CatalogModel` type does not declare (see fn_20260803_pia9pfxi); this
 * keeps that documented gap from forcing excess-property errors on realistic
 * fixtures while still routing every fixture through the real type.
 */
function catalogModel(fields: Record<string, unknown>): V2CatalogModel {
  return fields as V2CatalogModel;
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
    __resetV2LazyAutopilotLimitationLog();
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

  it("keeps V1 and V2 system transforms byte-identical for populated composition", async () => {
    const env = setupTestEnvironment("v1-v2-system-parity");
    const ctx = createMockPluginContext({
      testDir: env.testDir,
      memories: [
        {
          id: 1,
          type: "decision",
          title: "execute workflow decision",
          content: "Use the canonical state block and preserve phase gates.",
          importance: 8,
          createdAt: Date.now(),
        },
      ],
      state: {
        activeWorkflowId: "parity-workflow",
        workflows: {
          "parity-workflow": {
            phase: "execute",
            mode: "standard",
            depth: "standard",
            specLocked: true,
            interviewComplete: true,
            acceptanceConfirmed: false,
            currentWave: 2,
            totalWaves: 5,
            autopilot: true,
            lazyAutopilot: true,
            checkpoint: "wave-1-complete",
          },
        },
      },
    });
    ctx.db.saveNote({
      id: "fn_parity_high",
      title: "execute workflow Field Note",
      body: "Keep high-value prompt evidence available to both contracts.",
      tags: '["prompt"]',
      source_agent: "goop-researcher",
      importance: 8,
      workflow_id: "parity-workflow",
      project_id: "goopspec",
    });
    const contextsToClose = ctx;
    contexts.push(ctx);

    try {
      const registrations: Registrations = {
        agentTransforms: 0,
        catalogTransforms: 0,
        agentReloads: 0,
        catalogReloads: 0,
      };
      await registerHooksV2(createRuntimeContext(registrations), ctx);

      const v1System: string[] = [];
      const v2System: string[] = [];
      await createHooks(ctx, [...DEFAULT_HOOK_FACTORIES])["experimental.chat.system.transform"]?.(
        { sessionID: "parity", model: {} as never },
        { system: v1System },
      );
      await registrations.request?.({ system: v2System, messages: [], tools: {} });

      expect(v2System).toEqual(v1System);
      expect(v1System[0]).toContain("<goopspec_memory>");
      expect(v1System[0]).toContain("<goopspec_field_notes>");
    } finally {
      contextsToClose.db.close();
      const index = contexts.indexOf(contextsToClose);
      if (index >= 0) contexts.splice(index, 1);
      env.cleanup();
    }
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
      queuedAtMs: Date.now(),
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

  it("applies the high thinking variant to goop-wave-verifier through the shared V2 agent transform", async () => {
    const env = setupTestEnvironment("v2-wave-verifier-thinking");
    const ctx = createMockPluginContext({ testDir: env.testDir, db: env.db });
    // No agentThinkingLevels override — wave-verifier must resolve to its
    // DEFAULT_THINKING_LEVELS value of "high" (it is not a medium role).
    const registrations: Registrations = {
      agentTransforms: 0,
      catalogTransforms: 0,
      agentReloads: 0,
      catalogReloads: 0,
    };

    await registerHooksV2(createRuntimeContext(registrations), ctx);

    const agent: V2AgentInfo = {
      id: "goop-wave-verifier",
      model: { providerID: "anthropic", id: "claude-sonnet-4-6" },
      request: { headers: {}, body: {} },
    };
    const catalog: V2CatalogDraft = {
      provider: {
        list: () => [
          {
            provider: { id: "anthropic" },
            models: new Map([
              [
                "claude-sonnet-4-6",
                {
                  variants: [
                    { id: "low", headers: {}, body: { reasoning_effort: "low" } },
                    {
                      id: "high",
                      headers: { "x-reasoning": "high" },
                      body: { reasoning_effort: "high" },
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

    // getGoopRole recognised "wave-verifier" via the shared AGENT_ROLES
    // registry (otherwise applyThinkingLevelsToAgents would have skipped it)
    // and the resolved level is the default "high".
    expect(agent.model?.variant).toBe("high");
    expect(agent.request.headers).toEqual({ "x-reasoning": "high" });
    expect(agent.request.body).toEqual({ reasoning_effort: "high" });
    env.cleanup();
  });

  it("keeps experimental.session.compacting in the V2 skipped list and registers no compaction capability (AD8, NFR4)", async () => {
    const ctx = createMockPluginContext();
    contexts.push(ctx);
    const registrations: Registrations = {
      agentTransforms: 0,
      catalogTransforms: 0,
      agentReloads: 0,
      catalogReloads: 0,
    };
    const runtimeCtx = createRuntimeContext(registrations);
    const session = runtimeCtx.session;
    const tool = runtimeCtx.tool;
    if (!session || !tool) throw new Error("test setup: session and tool must be present");
    const sessionHookSpy = spyOn(session, "hook");
    const toolHookSpy = spyOn(tool, "hook");

    await registerHooksV2(runtimeCtx, ctx);

    // AD8/NFR4: experimental.session.compacting is V1-only. The V2 adapter
    // must never register a compaction handler with either runtime capability.
    const sessionEvents = sessionHookSpy.mock.calls.map((call) => call[0]);
    expect(sessionEvents).not.toContain("experimental.session.compacting");
    expect(sessionEvents).toEqual(["request"]);

    const toolEvents = toolHookSpy.mock.calls.map((call) => call[0]);
    expect(toolEvents).not.toContain("experimental.session.compacting");
    expect(toolEvents).toEqual(expect.arrayContaining(["execute.before", "execute.after"]));
  });

  it("logs the V2 lazy-autopilot limitation without claiming a fallback", async () => {
    const ctx = createMockPluginContext();
    contexts.push(ctx);
    const errorSpy = spyOn(console, "error").mockImplementation(() => {});

    await registerHooksV2({} as V2RuntimeContext, ctx);

    const logged = errorSpy.mock.calls.map((c) => String(c[0] ?? ""));
    const diag = logged.find((m) => m.includes("Lazy autopilot nudge is unavailable in V2"));
    expect(diag).toBeDefined();
    expect(diag).toContain("unavailable");
    expect(diag).not.toContain("fallback");
    errorSpy.mockRestore();
  });

  it("includes 'event' in the V2 skipped hooks list so the nudge remains inert under V2", async () => {
    // The nudge dispatch lives in the V1 `event` hook (event-handler.ts
    // session.idle → dispatchLazyAutopilotNudge). V2 does not expose an
    // `event` capability, so the hook is never registered and the nudge
    // cannot fire. The skipped list is the structural record that documents
    // this limitation and prevents a future V2 adapter from silently wiring
    // the event hook without an explicit capability check.
    const ctx = createMockPluginContext();
    contexts.push(ctx);
    const registrations: Registrations = {
      agentTransforms: 0,
      catalogTransforms: 0,
      agentReloads: 0,
      catalogReloads: 0,
    };

    const originalDebug = process.env.GOOPSPEC_DEBUG;
    process.env.GOOPSPEC_DEBUG = "true";
    const logSpy = spyOn(console, "log").mockImplementation(() => {});

    try {
      await registerHooksV2(createRuntimeContext(registrations), ctx);

      const registrationLog = logSpy.mock.calls.find(
        (call) =>
          typeof call[0] === "string" &&
          call[0].includes("Registered GoopSpec runtime hooks with V2"),
      );
      expect(registrationLog).toBeDefined();

      const data = registrationLog?.[1] as { skipped?: string[] } | undefined;
      expect(data?.skipped).toBeDefined();
      expect(data?.skipped).toContain("event");
    } finally {
      logSpy.mockRestore();
      if (originalDebug === undefined) process.env.GOOPSPEC_DEBUG = undefined;
      else process.env.GOOPSPEC_DEBUG = originalDebug;
    }
  });

  it("sets agent.model.variant from an id-only reasoning_options catalog model without fabricating headers or body", async () => {
    const env = setupTestEnvironment("v2-thinking-id-only-apply");
    const ctx = createMockPluginContext({ testDir: env.testDir, db: env.db });
    contexts.push(ctx);
    writeFileSync(
      join(ctx.sdk.directory, "goopspec.json"),
      JSON.stringify({ agentThinkingLevels: { "executor-high": "medium" } }),
    );
    const agent: V2AgentInfo = {
      id: "goop-executor-high",
      model: { providerID: "openai", id: "gpt-5.6-sol" },
      request: { headers: { "x-existing": "keep" }, body: { existing: true } },
    };
    // Real host shape (fn_20260803_pia9pfxi): reasoning:true + reasoning_options,
    // no `variants` field at all — the host publishes no request encoding.
    const catalog: V2CatalogDraft = {
      provider: {
        list: () => [
          {
            provider: { id: "openai" },
            models: new Map([
              [
                "gpt-5.6-sol",
                catalogModel({
                  reasoning: true,
                  reasoning_options: [
                    { type: "effort", values: ["none", "low", "medium", "high", "xhigh", "max"] },
                  ],
                }),
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

    await registerHooksV2(createRuntimeContext(registrations, { agent: agents, catalog }), ctx);

    expect(agent.model?.variant).toBe("medium");
    expect(agent.request.headers).toEqual({ "x-existing": "keep" });
    expect(agent.request.body).toEqual({ existing: true });
    env.cleanup();
  });

  it("applies a configured goop-* thinking level end-to-end via a real-shape reasoning_options catalog and changes the variant when the config changes (wiring Pattern 4)", async () => {
    // End-to-end wiring proof for the live host capability shape that caused
    // the original defect (fn_20260803_pia9pfxi): the catalog publishes
    // `reasoning:true` + `reasoning_options:[{type:"effort",values:[...]}]`
    // with no `variants` field. A configured `agentThinkingLevels` value for a
    // `goop-*` role must reach the V2 consumer and set `agent.model.variant`
    // WITHOUT a preserve-default warning, and changing the configured level
    // must change the applied variant. No headers/body are fabricated.
    const env = setupTestEnvironment("v2-thinking-wiring-real-shape");
    const ctx = createMockPluginContext({ testDir: env.testDir, db: env.db });
    contexts.push(ctx);
    writeFileSync(
      join(ctx.sdk.directory, "goopspec.json"),
      JSON.stringify({ agentThinkingLevels: { "executor-medium": "medium" } }),
    );
    const agent: V2AgentInfo = {
      id: "goop-executor-medium",
      model: { providerID: "openai", id: "gpt-5.6-sol" },
      request: { headers: { "x-existing": "keep" }, body: { existing: true } },
    };
    const catalog: V2CatalogDraft = {
      provider: {
        list: () => [
          {
            provider: { id: "openai" },
            models: new Map([
              [
                "gpt-5.6-sol",
                catalogModel({
                  reasoning: true,
                  reasoning_options: [
                    { type: "effort", values: ["none", "low", "medium", "high", "xhigh", "max"] },
                  ],
                }),
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
    const errorSpy = spyOn(console, "error").mockImplementation(() => {});

    const hooks = await registerHooksV2(
      createRuntimeContext(registrations, { agent: agents, catalog }),
      ctx,
    );

    // (a) The configured "medium" reaches the consumer and sets the variant,
    // with no preserve-default warning and no fabricated headers/body.
    expect(agent.model?.variant).toBe("medium");
    expect(agent.request.headers).toEqual({ "x-existing": "keep" });
    expect(agent.request.body).toEqual({ existing: true });
    expect(
      errorSpy.mock.calls
        .map((c) => String(c[0] ?? ""))
        .some((m) => m.includes("preserving the provider default")),
    ).toBe(false);

    // (b) Changing the configured level to "high" changes the applied variant
    // (both levels are in the supported set), still with no warning and no
    // fabricated headers/body.
    writeFileSync(
      join(ctx.sdk.directory, "goopspec.json"),
      JSON.stringify({ agentThinkingLevels: { "executor-medium": "high" } }),
    );
    await hooks.reloadThinkingLevels();

    expect(agent.model?.variant).toBe("high");
    expect(registrations.catalogTransforms).toBe(2);
    expect(registrations.agentTransforms).toBe(2);
    expect(agent.request.headers).toEqual({ "x-existing": "keep" });
    expect(agent.request.body).toEqual({ existing: true });
    expect(
      errorSpy.mock.calls
        .map((c) => String(c[0] ?? ""))
        .some((m) => m.includes("preserving the provider default")),
    ).toBe(false);

    errorSpy.mockRestore();
    env.cleanup();
  });

  it("emits the preserve-default warning and leaves the agent unchanged for an unsupported level", async () => {
    const env = setupTestEnvironment("v2-thinking-unsupported");
    const ctx = createMockPluginContext({ testDir: env.testDir, db: env.db });
    contexts.push(ctx);
    writeFileSync(
      join(ctx.sdk.directory, "goopspec.json"),
      JSON.stringify({ agentThinkingLevels: { "executor-high": "xhigh" } }),
    );
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
                catalogModel({
                  variants: [{ id: "medium", headers: {}, body: { reasoning_effort: "medium" } }],
                }),
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
    const errorSpy = spyOn(console, "error").mockImplementation(() => {});

    await registerHooksV2(createRuntimeContext(registrations, { agent: agents, catalog }), ctx);

    expect(agent.model?.variant).toBeUndefined();
    expect(agent.request.headers).toEqual({ "x-existing": "keep" });
    expect(agent.request.body).toEqual({ existing: true });
    const logged = errorSpy.mock.calls.map((c) => String(c[0] ?? ""));
    expect(
      logged.some(
        (m) => m.includes("goop-executor-high") && m.includes("preserving the provider default"),
      ),
    ).toBe(true);

    errorSpy.mockRestore();
    env.cleanup();
  });

  it("does not expose a transiently emptied capabilities map to a reentrant agent transform racing catalog capture", async () => {
    const env = setupTestEnvironment("v2-thinking-reentrancy");
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
    const reentrantAgent: V2AgentInfo = {
      id: "goop-executor-high",
      model: { providerID: "openai", id: "gpt-test" },
      request: { headers: {}, body: {} },
    };
    const catalogRecords = [
      {
        provider: { id: "openai" },
        models: new Map([
          [
            "gpt-test",
            catalogModel({
              variants: [{ id: "medium", headers: {}, body: { reasoning_effort: "medium" } }],
            }),
          ],
        ]),
      },
    ];
    const registrations: Registrations = {
      agentTransforms: 0,
      catalogTransforms: 0,
      agentReloads: 0,
      catalogReloads: 0,
    };

    // A host that reenters the already-registered agent transform WHILE this
    // catalog capture is still enumerating providers — before this refresh's
    // new capability snapshot has been captured. Guards against firing on the
    // very first registration, when no agent transform is registered yet.
    let reentered = false;
    const catalog: V2CatalogDraft = {
      provider: {
        list: () => {
          if (!reentered && registrations.agentTransform) {
            reentered = true;
            void registrations.agentTransform({
              list: () => [reentrantAgent],
              update: (_id, update) => update(reentrantAgent),
            });
          }
          return catalogRecords;
        },
      },
    };
    const agents: V2AgentDraft = {
      list: () => [agent],
      update: (_id, update) => update(agent),
    };

    const hooks = await registerHooksV2(
      createRuntimeContext(registrations, { agent: agents, catalog }),
      ctx,
    );
    expect(agent.model?.variant).toBe("medium");

    // The second refresh is where the reentrant call fires: by now
    // `registrations.agentTransform` is already set from the first pass.
    await hooks.reloadThinkingLevels();

    expect(reentered).toBe(true);
    // The reentrant call must resolve against the last-known-good, fully
    // populated snapshot — never a transiently emptied map from an in-place
    // clear() that runs before the new snapshot is captured.
    expect(reentrantAgent.model?.variant).toBe("medium");
    expect(reentrantAgent.request.body.reasoning_effort).toBe("medium");
    env.cleanup();
  });
});
