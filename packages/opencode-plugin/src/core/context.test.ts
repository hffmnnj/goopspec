import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import { createHooks } from "../hooks/index.js";
import { setupTestEnvironment } from "../test-utils.js";
import { createTools } from "../tools/index.js";
import { createPluginContext } from "./context.js";
import type { PluginInput } from "./sdk-compat.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createPluginContext()", () => {
  let testDir: string;
  let cleanup: () => void;

  beforeEach(() => {
    const env = setupTestEnvironment("context-test");
    testDir = env.testDir;
    cleanup = env.cleanup;
  });

  afterEach(() => cleanup());

  it("returns a context with all six required fields", async () => {
    const input = createMockPluginInput(testDir);
    const ctx = await createPluginContext(input);

    expect(ctx.sdk).toBeDefined();
    expect(ctx.stateManager).toBeDefined();
    expect(ctx.memory).toBeDefined();
    expect(ctx.resolver).toBeDefined();
    expect(ctx.session).toBeDefined();
    expect(ctx.sessionManager).toBeDefined();
  });

  it("populates sdk essentials from PluginInput", async () => {
    const input = createMockPluginInput(testDir);
    const ctx = await createPluginContext(input);

    expect(ctx.sdk.directory).toBe(testDir);
    expect(ctx.sdk.worktree).toBe(testDir);
    expect(ctx.sdk.client).toBe(input.client);
    expect(ctx.sdk.$).toBe(input.$);
  });

  it("creates a working state manager bound to the test directory", async () => {
    const input = createMockPluginInput(testDir);
    const ctx = await createPluginContext(input);

    const state = ctx.stateManager.getState();
    expect(state.version).toBe(2);
    expect(state.activeWorkflowId).toBeDefined();
    expect(typeof state.workflows).toBe("object");
  });

  it("creates a working memory manager", async () => {
    const input = createMockPluginInput(testDir);
    const ctx = await createPluginContext(input);

    // Verify save + search round-trip
    const saved = await ctx.memory.save({
      type: "note",
      title: "test note",
      content: "hello from context test",
    });
    expect(saved.id).toBeGreaterThan(0);

    const results = await ctx.memory.search({ query: "context test" });
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it("creates a session with a valid startedAt timestamp", async () => {
    const input = createMockPluginInput(testDir);
    const ctx = await createPluginContext(input);

    expect(ctx.session.startedAt).toBeTruthy();
    // Should be a valid ISO date string
    expect(Number.isNaN(Date.parse(ctx.session.startedAt))).toBe(false);
  });

  it("produces a context that createTools accepts (15 tools)", async () => {
    const input = createMockPluginInput(testDir);
    const ctx = await createPluginContext(input);
    const tools = createTools(ctx);

    const toolNames = Object.keys(tools);
    expect(toolNames).toHaveLength(15);
    expect(toolNames).toContain("goop_status");
    expect(toolNames).toContain("goop_state");
    expect(toolNames).toContain("goop_read_db");
    expect(toolNames).toContain("goop_write_db");
    expect(toolNames).toContain("goop_save_note");
    expect(toolNames).toContain("goop_search_notes");
    expect(toolNames).toContain("memory_save");
    expect(toolNames).toContain("memory_search");
    expect(toolNames).toContain("memory_forget");
    expect(toolNames).toContain("slashcommand");
  });

  it("produces a context that createHooks accepts", async () => {
    const input = createMockPluginInput(testDir);
    const ctx = await createPluginContext(input);
    const hooks = createHooks(ctx);

    expect(typeof hooks).toBe("object");
  });
});
