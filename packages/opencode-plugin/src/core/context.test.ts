import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SqliteMemoryManager } from "../features/memory/index.js";
import { createHooks } from "../hooks/index.js";
import { getDbPath, getGoopspecDir, getMemoryDbPath } from "../shared/paths.js";
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

  it("produces a context that createTools accepts (33 tools)", async () => {
    const input = createMockPluginInput(testDir);
    const ctx = await createPluginContext(input);
    const tools = createTools(ctx);

    const toolNames = Object.keys(tools);
    expect(toolNames).toHaveLength(33);
    expect(toolNames).toContain("goop_status");
    expect(toolNames).toContain("goop_state");
    expect(toolNames).toContain("goop_compact");
    expect(toolNames).toContain("goop_get_global_config");
    expect(toolNames).toContain("goop_read_db");
    expect(toolNames).toContain("goop_write_db");
    expect(toolNames).toContain("goop_save_note");
    expect(toolNames).toContain("goop_search_notes");
    expect(toolNames).toContain("goop_boot");
    expect(toolNames).toContain("goop_write_section");
    expect(toolNames).toContain("goop_read_section");
    expect(toolNames).toContain("goop_write_wave");
    expect(toolNames).toContain("goop_query_decisions");
    expect(toolNames).toContain("goop_blocker");
    expect(toolNames).toContain("goop_search_docs");
    expect(toolNames).toContain("goop_timeline");
    expect(toolNames).toContain("goop_dashboard");
    expect(toolNames).toContain("memory_save");
    expect(toolNames).toContain("memory_search");
    expect(toolNames).toContain("memory_forget");
    expect(toolNames).toContain("slashcommand");
    expect(toolNames).toContain("ast_grep");
  });

  it("produces a context that createHooks accepts", async () => {
    const input = createMockPluginInput(testDir);
    const ctx = await createPluginContext(input);
    const hooks = createHooks(ctx);

    expect(typeof hooks).toBe("object");
  });
});

describe("createPluginContext() in a fresh directory", () => {
  let rawTempDir: string;

  beforeEach(() => {
    rawTempDir = mkdtempSync(join(tmpdir(), "goopspec-fresh-"));
  });

  afterEach(() => {
    rmSync(rawTempDir, { recursive: true, force: true });
  });

  it("creates .goopspec directory and returns usable context when directory has no .goopspec", async () => {
    // Sanity check: the directory must truly have no .goopspec before the test.
    expect(existsSync(getGoopspecDir(rawTempDir))).toBe(false);

    const input = createMockPluginInput(rawTempDir);
    const ctx = await createPluginContext(input);

    expect(ctx.db).toBeTruthy();
    expect(ctx.stateManager).toBeTruthy();
    expect(ctx.memory).toBeTruthy();

    // The directory guard should have created .goopspec/ and both databases.
    expect(existsSync(getGoopspecDir(rawTempDir))).toBe(true);
    expect(existsSync(getDbPath(rawTempDir))).toBe(true);
    expect(existsSync(getMemoryDbPath(rawTempDir))).toBe(true);

    // Memory must be the real SqliteMemoryManager, not the no-op fallback (MH3).
    expect(ctx.memory).toBeInstanceOf(SqliteMemoryManager);
  });
});
