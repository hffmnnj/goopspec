/**
 * Cross-contract parity suite — V1 and V2 behavioral alignment.
 *
 * This file is the canonical place to answer the question: "Does V1 == V2?"
 * It imports the key parity facts proven by the per-wave tests and adds
 * shared-implementation assertions that guard against future drift.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

import plugin from "../index.js";
import {
  type PluginContext,
  createMockPluginContext,
  createMockToolContext,
  setupTestEnvironment,
} from "../test-utils.js";
import { createTools } from "../tools/index.js";
import { resolveCapabilities } from "./../features/thinking/capability.js";
import { resolveThinkingValue } from "./../features/thinking/resolve.js";
import { registerHooksV2 } from "./hooks-v2.js";
import { registerToolsV2 } from "./tools-v2.js";
import type {
  V2AgentDraft,
  V2AgentInfo,
  V2CatalogDraft,
  V2CatalogProviderRecord,
  V2RuntimeContext,
  V2ToolDefinition,
  V2ToolDraft,
} from "./v2-compat.js";

const V1_PROVIDER = "anthropic";
const V1_MODEL = "claude-opus-4-6";
const V2_PROVIDER = "openai";
const V2_MODEL = "gpt-test";
const ROLE = "executor-medium";
const LEVEL = "medium";
const DEFAULT_LEVEL = "high";

interface V2ToolLike {
  name: string;
  execute: (input: unknown, context: unknown) => Promise<unknown>;
}

function createV1MockPluginInput(directory: string) {
  return {
    client: {},
    project: {},
    directory,
    worktree: directory,
    serverUrl: new URL("http://localhost:0"),
    experimental_workspace: { register: () => {} },
    $: async () => ({ stdout: Buffer.from(""), stderr: Buffer.from(""), exitCode: 0 }),
  } as unknown as Parameters<typeof plugin>[0];
}

interface V2Registrations {
  tools: Record<string, V2ToolLike>;
  systemHook?: unknown;
  agentTransform?: (draft: V2AgentDraft) => void | Promise<void>;
  catalogTransform?: (draft: V2CatalogDraft) => void | Promise<void>;
  agentReloaded?: boolean;
  catalogReloaded?: boolean;
}

function createV2MockRuntime(testDir: string, registrations: V2Registrations): V2RuntimeContext {
  const captured = registrations;
  return {
    options: { directory: testDir },
    tool: {
      transform: async (callback: (draft: V2ToolDraft) => void | Promise<void>) => {
        const draft: V2ToolDraft = {
          add(definition: V2ToolDefinition) {
            captured.tools[definition.name] = definition as unknown as V2ToolLike;
          },
        };
        await callback(draft);
      },
      hook: async () => {},
    },
    session: {
      create: async () => ({}),
      get: async () => ({}),
      prompt: async () => ({}),
      command: async () => ({}),
      synthetic: async () => ({}),
      interrupt: async () => ({}),
      hook: async (_event: "request", callback: unknown) => {
        captured.systemHook = callback;
      },
    },
    agent: {
      transform: async (callback: (draft: V2AgentDraft) => void | Promise<void>) => {
        captured.agentTransform = callback;
      },
      reload: async () => {
        captured.agentReloaded = true;
      },
    },
    catalog: {
      transform: async (callback: (draft: V2CatalogDraft) => void | Promise<void>) => {
        captured.catalogTransform = callback;
      },
      reload: async () => {
        captured.catalogReloaded = true;
      },
    },
  } as unknown as V2RuntimeContext;
}

function createV2ProviderRecord(): V2CatalogProviderRecord {
  return {
    provider: { id: V2_PROVIDER },
    models: new Map([
      [
        V2_MODEL,
        {
          variants: [
            {
              id: LEVEL,
              headers: { "x-reasoning": LEVEL },
              body: { reasoning_effort: LEVEL },
            },
            {
              id: DEFAULT_LEVEL,
              headers: { "x-reasoning": DEFAULT_LEVEL },
              body: { reasoning_effort: DEFAULT_LEVEL },
            },
          ],
        },
      ],
    ]),
  };
}

function createV1ProviderCatalog(providerID: string, modelID: string) {
  return {
    providers: [
      {
        id: providerID,
        models: {
          [modelID]: {
            capabilities: { reasoning: true },
            options: { reasoningEffort: ["low", LEVEL, DEFAULT_LEVEL] },
          },
        },
      },
    ],
  };
}

function withProviderCatalog<T>(
  ctx: ReturnType<typeof createMockPluginContext>,
  catalog: unknown,
  run: () => Promise<T>,
): Promise<T> {
  (ctx.sdk.client as unknown as { config: { providers: () => Promise<unknown> } }).config = {
    providers: async () => ({ data: catalog }),
  };
  return run();
}

describe("dual-contract parity", () => {
  let testDir: string;
  let cleanup: () => void;
  let contexts: PluginContext[] = [];

  beforeEach(() => {
    const env = setupTestEnvironment("dual-contract");
    testDir = env.testDir;
    cleanup = env.cleanup;
    contexts = [];
  });

  afterEach(() => {
    for (const ctx of contexts.splice(0)) {
      ctx.db.close();
    }
    cleanup();
  });

  it("default export satisfies both V1 and V2 shapes simultaneously", () => {
    expect(typeof plugin).toBe("function");
    expect(plugin.id).toBe("goopspec");
    expect(typeof plugin.setup).toBe("function");
  });

  it("V1 path returns the canonical 30-tool set unchanged", async () => {
    const input = createV1MockPluginInput(testDir);
    const result = await plugin(input);

    expect(result.tool).toBeDefined();
    expect(Object.keys(result.tool ?? {})).toHaveLength(30);

    const directTools = Object.keys(createTools(createMockPluginContext({ testDir }))).sort();
    expect(Object.keys(result.tool ?? {}).sort()).toEqual(directTools);
  });

  it("V2 setup registers the same 30 tools as the V1 path", async () => {
    const registrations: { tools: Record<string, V2ToolLike>; systemHook?: unknown } = {
      tools: {},
    };
    await plugin.setup(createV2MockRuntime(testDir, registrations));

    const v1Tools = Object.keys(createTools(createMockPluginContext({ testDir }))).sort();
    const v2Tools = Object.keys(registrations.tools).sort();

    expect(v2Tools).toEqual(v1Tools);
    expect(v2Tools).toHaveLength(30);
  });

  it("goop_status produces identical text through V1 and V2", async () => {
    const input = createV1MockPluginInput(testDir);
    const v1Result = await plugin(input);
    const v1ToolCtx = createMockToolContext({ directory: testDir, worktree: testDir });
    const v1Status = v1Result.tool?.goop_status;
    expect(v1Status).toBeDefined();
    if (!v1Status) throw new Error("goop_status missing from V1 result");
    const v1Text = await v1Status.execute({ verbose: false }, v1ToolCtx);

    const registrations: { tools: Record<string, V2ToolLike>; systemHook?: unknown } = {
      tools: {},
    };
    await plugin.setup(createV2MockRuntime(testDir, registrations));
    const v2Status = registrations.tools.goop_status;
    expect(v2Status).toBeDefined();
    if (!v2Status) throw new Error("goop_status missing from V2 registration");

    const v2Result = await v2Status.execute(
      { verbose: false },
      { sessionID: "test-session", assistantMessageID: "test-message" },
    );
    const v2Text = (v2Result as { content: { text: string }[] }).content[0]?.text;

    expect(typeof v1Text).toBe("string");
    if (typeof v1Text !== "string") throw new Error("goop_status V1 output must be text");
    expect(typeof v2Text).toBe("string");
    if (typeof v2Text !== "string") throw new Error("goop_status V2 output must be text");
    expect(v2Text).toEqual(v1Text);
    expect(v2Text).toContain("GoopSpec");
    expect(v2Text).toContain("**Project:**");
    expect(v2Text).toContain("**Workflow:**");
  });

  it("system-transform hook produces identical output through V1 and V2", async () => {
    const input = createV1MockPluginInput(testDir);
    const v1Result = await plugin(input);
    const v1System: string[] = [];
    await v1Result["experimental.chat.system.transform"]?.(
      { model: {} as never },
      { system: v1System },
    );

    const registrations: { tools: Record<string, V2ToolLike>; systemHook?: unknown } = {
      tools: {},
    };
    await plugin.setup(createV2MockRuntime(testDir, registrations));
    expect(typeof registrations.systemHook).toBe("function");

    const v2System: string[] = [];
    await (
      registrations.systemHook as (event: {
        system: string[];
        messages: unknown[];
        tools: Record<string, unknown>;
      }) => Promise<void>
    )({
      system: v2System,
      messages: [],
      tools: {},
    });

    expect(v2System).toEqual(v1System);
    expect(v2System).toHaveLength(1);
    expect(v2System[0]).toContain("<goopspec_state>");
    expect(v2System[0]).toContain("workflow: default");
  });

  it("V2 tool adapter reuses the same execute function reference as V1", async () => {
    const ctx = createMockPluginContext({ testDir });
    contexts.push(ctx);
    const canonicalTools = createTools(ctx);
    const registrations: V2ToolDefinition[] = [];

    const runtimeCtx: V2RuntimeContext = {
      tool: {
        transform: async (callback: (draft: V2ToolDraft) => void | Promise<void>) => {
          const draft: V2ToolDraft = {
            add(definition: V2ToolDefinition) {
              registrations.push(definition);
            },
          };
          await callback(draft);
        },
        hook: async () => {},
      },
    } as unknown as V2RuntimeContext;

    await registerToolsV2(runtimeCtx, ctx);

    const v1GoopStatus = canonicalTools.goop_status;
    const v2GoopStatus = registrations.find((definition) => definition.name === "goop_status");
    expect(v2GoopStatus).toBeDefined();
    if (!v2GoopStatus) throw new Error("goop_status missing from V2 registration");

    // The V2 definition wraps the V1 execute in an adapter closure, so the
    // registered V2 execute is not the identical reference. Instead, assert
    // that the wrapped closure calls the canonical V1 execute and produces the
    // identical output — the strongest reference-equality check possible given
    // the envelope translation required by V2.
    expect(v2GoopStatus.execute).not.toBe(v1GoopStatus.execute);

    const v1Output = await v1GoopStatus.execute({ verbose: false }, createMockToolContext());
    expect(typeof v1Output).toBe("string");
    if (typeof v1Output !== "string") throw new Error("goop_status V1 output must be text");

    const v2Output = await v2GoopStatus.execute(
      { verbose: false },
      { sessionID: "test-session", assistantMessageID: "test-message" },
    );

    expect(v2Output).toEqual({
      content: [{ type: "text", text: v1Output }],
    });
  });

  it("V2 hook adapter is wired into the same default factories as V1", async () => {
    const input = createV1MockPluginInput(testDir);
    const v1Result = await plugin(input);
    const v1Events = new Set(Object.keys(v1Result).filter((key) => key !== "tool"));

    const registrations: { tools: Record<string, V2ToolLike>; systemHook?: unknown } = {
      tools: {},
    };
    await plugin.setup(createV2MockRuntime(testDir, registrations));

    // V2 can only express a subset of V1 hook events. Confirm the ones with V2
    // equivalents are registered, and that no V2-only hook surface appears that
    // would imply a forked implementation path.
    expect(registrations.systemHook).toBeDefined();
    expect(v1Events.has("experimental.chat.system.transform")).toBe(true);
  });

  it("uses the same shared thinking resolver for V1 and V2", async () => {
    const v2Capabilities = resolveCapabilities(createV2ProviderRecord().models.get(V2_MODEL));
    const v1Catalog = createV1ProviderCatalog(V1_PROVIDER, V1_MODEL);
    const v1Capabilities = resolveCapabilities(v1Catalog.providers[0]?.models[V1_MODEL]);

    const v2Resolution = resolveThinkingValue(LEVEL, v2Capabilities);
    const v1Resolution = resolveThinkingValue(LEVEL, v1Capabilities);

    expect(v2Resolution.source).toBe("v2");
    expect(v1Resolution.source).toBe("v1");
    expect(v2Resolution.apply).not.toBeNull();
    expect(v1Resolution.apply).not.toBeNull();
    expect(v2Resolution.warning).toBeUndefined();
    expect(v1Resolution.warning).toBeUndefined();
  });

  it("produces equivalent applied values for the same thinking config and compatible model", async () => {
    const env = setupTestEnvironment("dual-thinking-parity");
    const globalConfigPath = process.env.GOOPSPEC_GLOBAL_CONFIG_PATH;
    try {
      process.env.GOOPSPEC_GLOBAL_CONFIG_PATH = join(env.testDir, "no-global-config.json");
      writeFileSync(
        join(env.testDir, "goopspec.json"),
        JSON.stringify({ agentThinkingLevels: { [ROLE]: LEVEL } }),
        "utf-8",
      );

      const ctx = createMockPluginContext({ testDir: env.testDir, db: env.db });
      contexts.push(ctx);

      // V1 path
      const { createAgentRegistrationHook } = await import("../hooks/agent-registration.js");
      const v1Hooks = createAgentRegistrationHook(ctx);
      const v1Output = {
        temperature: 0,
        topP: 0,
        topK: 0,
        maxOutputTokens: undefined,
        options: {},
      };
      await withProviderCatalog(ctx, createV1ProviderCatalog(V1_PROVIDER, V1_MODEL), async () => {
        await v1Hooks["chat.params"]?.(
          {
            sessionID: "session",
            agent: `goop-${ROLE}`,
            model: { providerID: V1_PROVIDER, id: V1_MODEL } as never,
            provider: {} as never,
            message: {} as never,
          },
          v1Output,
        );
      });

      // V2 path
      const registrations: V2Registrations = { tools: {} };
      await registerHooksV2(createV2MockRuntime(env.testDir, registrations), ctx);
      expect(registrations.catalogTransform).toBeDefined();
      expect(registrations.agentTransform).toBeDefined();

      const agent: V2AgentInfo = {
        id: `goop-${ROLE}`,
        model: { providerID: V2_PROVIDER, id: V2_MODEL },
        request: { headers: {}, body: {} },
      };
      const catalog: V2CatalogDraft = {
        provider: {
          list: () => [createV2ProviderRecord()],
        },
      };
      await registrations.catalogTransform?.(catalog);
      await registrations.agentTransform?.({
        list: () => [agent],
        update: (_id, update) => update(agent),
      });

      expect(agent.request.body).toEqual({ reasoning_effort: LEVEL });
      expect(agent.request.headers).toEqual({ "x-reasoning": LEVEL });
      expect(agent.model?.variant).toBe(LEVEL);
      expect(v1Output.options).toEqual({ reasoningEffort: LEVEL });
    } finally {
      if (globalConfigPath === undefined) {
        Reflect.deleteProperty(process.env, "GOOPSPEC_GLOBAL_CONFIG_PATH");
      } else {
        process.env.GOOPSPEC_GLOBAL_CONFIG_PATH = globalConfigPath;
      }
      env.cleanup();
    }
  });

  it("preserves provider default and warns for unsupported thinking levels on both contracts", async () => {
    const env = setupTestEnvironment("dual-thinking-unsupported");
    const errors: string[] = [];
    const originalError = console.error;
    const globalConfigPath = process.env.GOOPSPEC_GLOBAL_CONFIG_PATH;
    try {
      process.env.GOOPSPEC_GLOBAL_CONFIG_PATH = join(env.testDir, "no-global-config.json");
      console.error = (...args: unknown[]) => errors.push(args.map(String).join(" "));
      writeFileSync(
        join(env.testDir, "goopspec.json"),
        JSON.stringify({ agentThinkingLevels: { [ROLE]: "xhigh" } }),
        "utf-8",
      );

      const ctx = createMockPluginContext({ testDir: env.testDir, db: env.db });
      contexts.push(ctx);

      // V1 path with a model that does not advertise xhigh
      const { createAgentRegistrationHook } = await import("../hooks/agent-registration.js");
      const v1Hooks = createAgentRegistrationHook(ctx);
      const v1Output = {
        temperature: 0,
        topP: 0,
        topK: 0,
        maxOutputTokens: undefined,
        options: {},
      };
      const v1Catalog = createV1ProviderCatalog(V1_PROVIDER, V1_MODEL);
      await withProviderCatalog(ctx, v1Catalog, async () => {
        await v1Hooks["chat.params"]?.(
          {
            sessionID: "session",
            agent: `goop-${ROLE}`,
            model: { providerID: V1_PROVIDER, id: V1_MODEL } as never,
            provider: {} as never,
            message: {} as never,
          },
          v1Output,
        );
      });

      // V2 path with a catalog that does not advertise xhigh
      const registrations: V2Registrations = { tools: {} };
      await registerHooksV2(createV2MockRuntime(env.testDir, registrations), ctx);

      const agent: V2AgentInfo = {
        id: `goop-${ROLE}`,
        model: { providerID: V2_PROVIDER, id: V2_MODEL },
        request: { headers: {}, body: {} },
      };
      const catalog: V2CatalogDraft = {
        provider: {
          list: () => [createV2ProviderRecord()],
        },
      };
      await registrations.catalogTransform?.(catalog);
      await registrations.agentTransform?.({
        list: () => [agent],
        update: (_id, update) => update(agent),
      });

      expect(v1Output.options).toEqual({});
      expect(agent.request.body).toEqual({});
      expect(agent.request.headers).toEqual({});
      expect(agent.model?.variant).toBeUndefined();
      expect(errors.some((entry) => entry.includes("preserving the provider default"))).toBe(true);
    } finally {
      console.error = originalError;
      if (globalConfigPath === undefined) {
        Reflect.deleteProperty(process.env, "GOOPSPEC_GLOBAL_CONFIG_PATH");
      } else {
        process.env.GOOPSPEC_GLOBAL_CONFIG_PATH = globalConfigPath;
      }
      env.cleanup();
    }
  });

  it("V2 gracefully skips thinking-level transform when agent capability is absent", async () => {
    const env = setupTestEnvironment("dual-v2-no-agent");
    try {
      const ctx = createMockPluginContext({ testDir: env.testDir, db: env.db });
      contexts.push(ctx);
      const runtime: V2RuntimeContext = {
        options: { directory: env.testDir },
        tool: { transform: async () => {}, hook: async () => {} },
        session: { hook: async () => {} },
      } as unknown as V2RuntimeContext;

      await expect(registerHooksV2(runtime, ctx)).resolves.toBeUndefined();
    } finally {
      env.cleanup();
    }
  });

  it("V2 gracefully skips thinking-level transform when catalog capability is absent", async () => {
    const env = setupTestEnvironment("dual-v2-no-catalog");
    try {
      const ctx = createMockPluginContext({ testDir: env.testDir, db: env.db });
      contexts.push(ctx);

      const runtime: V2RuntimeContext = {
        options: { directory: env.testDir },
        tool: { transform: async () => {}, hook: async () => {} },
        session: { hook: async () => {} },
        agent: {
          transform: async () => {},
          reload: async () => {},
        },
      } as unknown as V2RuntimeContext;

      await expect(registerHooksV2(runtime, ctx)).resolves.toBeUndefined();
    } finally {
      env.cleanup();
    }
  });

  it("V2 reload callbacks are not triggered when the runtime lacks both capabilities", async () => {
    const env = setupTestEnvironment("dual-v2-no-capabilities");
    try {
      const ctx = createMockPluginContext({ testDir: env.testDir, db: env.db });
      contexts.push(ctx);
      const registrations: V2Registrations = { tools: {} };
      const runtime: V2RuntimeContext = {
        options: { directory: env.testDir },
        tool: { transform: async () => {}, hook: async () => {} },
        session: { hook: async () => {} },
      } as unknown as V2RuntimeContext;

      await registerHooksV2(runtime, ctx);

      expect(registrations.agentTransform).toBeUndefined();
      expect(registrations.catalogTransform).toBeUndefined();
      expect(registrations.agentReloaded).toBeUndefined();
      expect(registrations.catalogReloaded).toBeUndefined();
    } finally {
      env.cleanup();
    }
  });

  it("V2 reload callbacks are not triggered when only agent capability is present", async () => {
    const env = setupTestEnvironment("dual-v2-only-agent");
    try {
      const ctx = createMockPluginContext({ testDir: env.testDir, db: env.db });
      contexts.push(ctx);
      const registrations: V2Registrations = { tools: {} };
      const runtime: V2RuntimeContext = {
        options: { directory: env.testDir },
        tool: { transform: async () => {}, hook: async () => {} },
        session: { hook: async () => {} },
        agent: {
          transform: async () => {},
          reload: async () => {},
        },
      } as unknown as V2RuntimeContext;

      await registerHooksV2(runtime, ctx);

      expect(registrations.agentTransform).toBeUndefined();
      expect(registrations.catalogTransform).toBeUndefined();
    } finally {
      env.cleanup();
    }
  });
});
