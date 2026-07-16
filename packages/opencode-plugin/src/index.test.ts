/**
 * Entrypoint contract tests — dual-shape V1/V2 default export.
 *
 * Verifies the default export is simultaneously a callable V1 async plugin
 * function and a V2 plugin definition (`{ id, setup }`), and that the V1 path
 * preserves the full legacy tool registry (MH4 parity).
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
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
  "goop_write_section",
  "goop_read_section",
  "goop_write_wave",
  "goop_read_waves",
  "goop_query_decisions",
  "goop_record_verification",
  "goop_read_verifications",
  "goop_blocker",
  "goop_write_traceability",
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
  });

  it("V1 path registers exactly 30 tools with the canonical key set", async () => {
    const input = createMockPluginInput(testDir);
    const result = await plugin(input);
    const toolKeys = Object.keys(result.tool ?? {});

    expect(toolKeys).toHaveLength(30);
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
});
