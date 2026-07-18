/**
 * Entrypoint contract tests — dual-shape V1/V2 default export.
 *
 * Verifies the default export is simultaneously a callable V1 async plugin
 * function and a V2 plugin definition (`{ id, setup }`), and that the V1 path
 * preserves the full legacy tool registry (MH4 parity).
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

import type { PluginInput } from "./core/sdk-compat.js";

import plugin, { server } from "./index.js";
import {
  type PluginContext,
  createMockPluginContext,
  createMockToolContext,
  setupTestEnvironment,
} from "./test-utils.js";

const EXPECTED_TOOL_KEYS = [
  "goop_status",
  "goop_state",
  "goop_spec",
  "goop_adl",
  "goop_checkpoint",
  "goop_setup",
  "goop_get_global_config",
  "goop_reference",
  "goop_read_db",
  "goop_write_db",
  "goop_save_note",
  "goop_search_notes",
  "goop_append_chronicle",
  "goop_boot",
  "goop_create_pr",
  "goop_write_section",
  "goop_read_section",
  "goop_write_wave",
  "goop_query_decisions",
  "goop_blocker",
  "goop_search_docs",
  "goop_timeline",
  "goop_dashboard",
  "goop_infer_intent",
  "memory_save",
  "memory_search",
  "memory_forget",
  "slashcommand",
] as const;

function createMockPluginInput(directory: string): PluginInput {
  return {
    client: {} as PluginInput["client"],
    project: {} as PluginInput["project"],
    directory,
    worktree: directory,
    serverUrl: new URL("http://localhost:0"),
    experimental_workspace: {
      register: () => {},
    },
    $: (async () => ({
      stdout: Buffer.from(""),
      stderr: Buffer.from(""),
      exitCode: 0,
    })) as unknown as PluginInput["$"],
  };
}

describe("plugin entrypoint", () => {
  let testDir: string;
  let cleanup: () => void;

  beforeEach(() => {
    const env = setupTestEnvironment("entrypoint");
    testDir = env.testDir;
    cleanup = env.cleanup;
  });

  afterEach(() => cleanup());

  it("default export is the same object as the named server export", () => {
    expect(Object.is(plugin, server)).toBe(true);
  });

  it("exposes V2 plugin shape on the default export", () => {
    expect(plugin.id).toBe("goopspec");
    expect(typeof plugin.setup).toBe("function");
  });

  it("remains V1-callable as an async function", () => {
    expect(typeof plugin).toBe("function");
    expect(typeof plugin).toBe("function");
  });

  it("V1 invocation returns a Hooks-shaped object with a tool map", async () => {
    const input = createMockPluginInput(testDir);
    const result = await plugin(input);

    expect(result).toBeDefined();
    expect(typeof result).toBe("object");
    expect(result.tool).toBeDefined();
    expect(typeof result.tool).toBe("object");
    expect(typeof result.dispose).toBe("function");
    await result.dispose?.();
  });

  it("warns that V1 agent-menu changes require restart after a config reload", async () => {
    const errors: string[] = [];
    const originalError = console.error;
    try {
      console.error = (...args: unknown[]) => errors.push(args.map(String).join(" "));
      const result = await plugin(createMockPluginInput(testDir));

      writeFileSync(
        join(testDir, "goopspec.json"),
        JSON.stringify({ agentThinkingLevels: { orchestrator: "high" } }),
        "utf-8",
      );
      await Bun.sleep(200);

      expect(
        errors.some((message) => message.includes("restart OpenCode to refresh the agent menu")),
      ).toBe(true);
      await result.dispose?.();
    } finally {
      console.error = originalError;
    }
  });

  it("V1 path registers exactly 29 tools with the canonical key set", async () => {
    const input = createMockPluginInput(testDir);
    const result = await plugin(input);
    const toolKeys = Object.keys(result.tool ?? {});

    expect(toolKeys).toHaveLength(29);
    for (const key of EXPECTED_TOOL_KEYS) {
      expect(toolKeys).toContain(key);
    }
  });

  it("V1 tool registry matches the createTools inventory (parity)", async () => {
    const { createTools } = await import("./tools/index.js");
    const ctx: PluginContext = createMockPluginContext({ testDir });
    const directTools = Object.keys(createTools(ctx)).sort();
    const input = createMockPluginInput(testDir);
    const result = await plugin(input);
    const entrypointTools = Object.keys(result.tool ?? {}).sort();

    expect(entrypointTools).toEqual(directTools);
  });

  it("V1 returned tools are executable", async () => {
    const input = createMockPluginInput(testDir);
    const result = await plugin(input);
    const tools = result.tool ?? {};
    const toolCtx = createMockToolContext({ directory: testDir, worktree: testDir });

    for (const [key, def] of Object.entries(tools)) {
      expect(typeof def.execute, `${key}.execute`).toBe("function");
    }

    // Sanity-execute goop_status through the V1 path to prove real wiring.
    const statusResult = await tools.goop_status?.execute({ verbose: false }, toolCtx);
    expect(typeof statusResult).toBe("string");
    expect(statusResult).toContain("GoopSpec");
  });

  it("V2 setup registers exactly 29 tools and goop_status matches V1 output", async () => {
    interface V2ToolLike {
      name: string;
      execute: (input: unknown, context: unknown) => Promise<unknown>;
    }

    const v2Tools: Record<string, V2ToolLike> = {};
    const v2Ctx = {
      options: { directory: testDir },
      tool: {
        transform: async (callback: (draft: { add: (tool: V2ToolLike) => void }) => void) => {
          const draft = {
            add(tool: V2ToolLike) {
              v2Tools[tool.name] = tool;
            },
          };
          callback(draft);
        },
      },
    } as unknown as Parameters<typeof plugin.setup>[0];

    await plugin.setup(v2Ctx);

    expect(Object.keys(v2Tools)).toHaveLength(29);
    for (const key of EXPECTED_TOOL_KEYS) {
      expect(v2Tools).toHaveProperty(key);
    }

    const v1Input = createMockPluginInput(testDir);
    const v1Result = await plugin(v1Input);
    const v1Status = v1Result.tool?.goop_status;
    expect(v1Status).toBeDefined();
    const v1ToolCtx = createMockToolContext({ directory: testDir, worktree: testDir });
    const v1StatusOutput = await v1Status?.execute({ verbose: false }, v1ToolCtx);

    const v2StatusOutput = await v2Tools.goop_status.execute(
      { verbose: false },
      {
        sessionID: "test-session",
        assistantMessageID: "test-message",
      },
    );

    const v2Text = (v2StatusOutput as { content: { text: string }[] }).content[0]?.text;
    expect(typeof v2Text).toBe("string");
    expect(v2Text).toContain("GoopSpec");
    expect(v2Text).toContain("**Project:**");
    expect(v2Text).toContain("**Workflow:**");

    const v1Text = v1StatusOutput as string;
    expect(typeof v1Text).toBe("string");
    expect(v1Text).toContain("GoopSpec");
    expect(v1Text).toContain("**Project:**");
    expect(v1Text).toContain("**Workflow:**");
    expect(v1Text).toEqual(v2Text);
  });

  it("V2 setup registers hooks and system-transform output matches V1", async () => {
    interface V2ToolLike {
      name: string;
      execute: (input: unknown, context: unknown) => Promise<unknown>;
    }

    const v2Tools: Record<string, V2ToolLike> = {};
    let v2SystemHook: ((event: { system: string[] }) => void | Promise<void>) | undefined;
    const v2Ctx = {
      options: { directory: testDir },
      tool: {
        transform: async (callback: (draft: { add: (tool: V2ToolLike) => void }) => void) => {
          const draft = {
            add(tool: V2ToolLike) {
              v2Tools[tool.name] = tool;
            },
          };
          callback(draft);
        },
      },
      session: {
        hook: async (
          _event: "request",
          callback: (event: { system: string[] }) => void | Promise<void>,
        ) => {
          v2SystemHook = callback;
        },
      },
    } as unknown as Parameters<typeof plugin.setup>[0];

    await plugin.setup(v2Ctx);

    expect(v2SystemHook).toBeDefined();
    expect(typeof v2SystemHook).toBe("function");

    const v1Input = createMockPluginInput(testDir);
    const v1Result = await plugin(v1Input);
    const v1System: string[] = [];
    await v1Result["experimental.chat.system.transform"]?.(
      { model: {} as never },
      { system: v1System },
    );

    const v2System: string[] = [];
    await v2SystemHook?.({ system: v2System });

    expect(v2System).toHaveLength(1);
    expect(v2System).toEqual(v1System);
    expect(v2System[0]).toContain("<goopspec_state>");
    expect(v2System[0]).toContain("workflow: default");
  });

  it("V2 reloads agents and catalog after config edits and disposes its watcher on teardown", async () => {
    let agentReloads = 0;
    let catalogReloads = 0;
    let teardown: (() => void | Promise<void>) | undefined;
    const v2Ctx = {
      options: { directory: testDir },
      tool: { transform: async () => {}, hook: async () => {} },
      agent: {
        transform: async () => ({ dispose: async () => {} }),
        reload: async () => {
          agentReloads++;
        },
      },
      catalog: {
        transform: async () => ({ dispose: async () => {} }),
        reload: async () => {
          catalogReloads++;
        },
      },
      teardown: {
        register: (callback: () => void | Promise<void>) => {
          teardown = callback;
        },
      },
    } as unknown as Parameters<typeof plugin.setup>[0];

    await plugin.setup(v2Ctx);
    writeFileSync(
      join(testDir, "goopspec.json"),
      JSON.stringify({ agentThinkingLevels: { orchestrator: "high" } }),
      "utf-8",
    );
    await Bun.sleep(200);

    expect(catalogReloads).toBe(1);
    expect(agentReloads).toBe(1);
    expect(teardown).toBeDefined();
    await teardown?.();

    writeFileSync(
      join(testDir, "goopspec.json"),
      JSON.stringify({ agentThinkingLevels: { orchestrator: "medium" } }),
      "utf-8",
    );
    await Bun.sleep(200);
    expect(catalogReloads).toBe(1);
    expect(agentReloads).toBe(1);
  });

  it("does not start an unowned V2 config watcher without teardown capability", async () => {
    let agentReloads = 0;
    let catalogReloads = 0;
    const v2Ctx = {
      options: { directory: testDir },
      tool: { transform: async () => {}, hook: async () => {} },
      agent: {
        transform: async () => ({ dispose: async () => {} }),
        reload: async () => {
          agentReloads++;
        },
      },
      catalog: {
        transform: async () => ({ dispose: async () => {} }),
        reload: async () => {
          catalogReloads++;
        },
      },
    } as unknown as Parameters<typeof plugin.setup>[0];

    await plugin.setup(v2Ctx);
    writeFileSync(
      join(testDir, "goopspec.json"),
      JSON.stringify({ agentThinkingLevels: { orchestrator: "high" } }),
      "utf-8",
    );
    await Bun.sleep(200);

    expect(catalogReloads).toBe(0);
    expect(agentReloads).toBe(0);
  });
});
