import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import type { MemoryEntry, PluginContext, ToolContext } from "../../test-utils.js";
import {
  createMockPluginContext,
  createMockToolContext,
  setupTestEnvironment,
} from "../../test-utils.js";
import { createMemoryForgetTool } from "./index.js";

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------

function seedMemories(): MemoryEntry[] {
  return [
    {
      id: 1,
      type: "observation",
      title: "Old pattern",
      content: "Outdated observation about the codebase.",
      importance: 5,
      createdAt: Date.now() - 86_400_000,
    },
    {
      id: 2,
      type: "note",
      title: "Temporary note about auth",
      content: "Auth endpoint is temporarily broken.",
      importance: 3,
      createdAt: Date.now(),
    },
    {
      id: 3,
      type: "decision",
      title: "Use auth tokens",
      content: "Decided to use JWT auth tokens for the API.",
      importance: 8,
      createdAt: Date.now(),
    },
  ];
}

describe("memory_forget tool", () => {
  let ctx: PluginContext;
  let toolCtx: ToolContext;
  let cleanup: () => void;

  beforeEach(() => {
    const env = setupTestEnvironment("memory-forget");
    cleanup = env.cleanup;
    ctx = createMockPluginContext({ testDir: env.testDir, memories: seedMemories() });
    toolCtx = createMockToolContext();
  });

  afterEach(() => cleanup());

  // -------------------------------------------------------------------------
  // Delete by ID
  // -------------------------------------------------------------------------

  it("deletes a memory by ID", async () => {
    const tool = createMemoryForgetTool(ctx);
    const result = await tool.execute({ id: 1 }, toolCtx);

    expect(result).toBe("Memory 1 deleted successfully.");

    // Verify it's gone
    const entry = await ctx.memory.getById(1);
    expect(entry).toBeNull();
  });

  it("reports when ID is not found", async () => {
    const tool = createMemoryForgetTool(ctx);
    const result = await tool.execute({ id: 999 }, toolCtx);

    expect(result).toBe("Memory 999 not found.");
  });

  // -------------------------------------------------------------------------
  // Delete by query — preview (no confirm)
  // -------------------------------------------------------------------------

  it("shows preview of matching memories without confirm", async () => {
    const tool = createMemoryForgetTool(ctx);
    const result = await tool.execute({ query: "auth" }, toolCtx);

    expect(result).toContain("Will delete:");
    expect(result).toContain("Temporary note about auth");
    expect(result).toContain("Use auth tokens");
    expect(result).toContain("confirm=true");
  });

  it("reports no matches for query with no results", async () => {
    const tool = createMemoryForgetTool(ctx);
    const result = await tool.execute({ query: "xyznonexistent" }, toolCtx);

    expect(result).toContain('No memories found matching: "xyznonexistent"');
  });

  // -------------------------------------------------------------------------
  // Delete by query — confirmed
  // -------------------------------------------------------------------------

  it("deletes matching memories when confirmed", async () => {
    const tool = createMemoryForgetTool(ctx);
    const result = await tool.execute({ query: "auth", confirm: true }, toolCtx);

    expect(result).toContain("Deleted");
    expect(result).toContain("memories");

    // Verify auth-related memories are gone
    const remaining = await ctx.memory.search({ query: "auth" });
    expect(remaining.length).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Validation
  // -------------------------------------------------------------------------

  it("requires either id or query", async () => {
    const tool = createMemoryForgetTool(ctx);
    const result = await tool.execute({}, toolCtx);

    expect(result).toBe(
      'Error in memory_forget: neither `id` nor `query` was supplied. Retry with `{ id: 42 }` to delete one memory, or `{ query: "topic", confirm: true }` to delete query matches.',
    );
  });

  // -------------------------------------------------------------------------
  // Confirm gate and mode precedence — the destructive contract pinned.
  // These tests exist because memory_forget is irreversible: a caller must
  // be able to read the description alone and know which invocation deletes
  // one record, which can delete many, and what confirm gates. The assertions
  // below fix that contract so a future refactor cannot silently change it.
  // -------------------------------------------------------------------------

  it("id mode deletes immediately without confirm and ignores confirm:false", async () => {
    const tool = createMemoryForgetTool(ctx);
    // confirm:false must NOT protect an id-mode deletion.
    const result = await tool.execute({ id: 1, confirm: false }, toolCtx);

    expect(result).toBe("Memory 1 deleted successfully.");
    expect(await ctx.memory.getById(1)).toBeNull();
  });

  it("id mode takes precedence over query + confirm (no bulk deletion occurs)", async () => {
    const tool = createMemoryForgetTool(ctx);
    // Supplying both id and a confirmed query must delete only the id record.
    // forgetByQuery must NOT run, so the other auth-related memory survives.
    const result = await tool.execute({ id: 2, query: "auth", confirm: true }, toolCtx);

    expect(result).toBe("Memory 2 deleted successfully.");
    // Memory 3 ("Use auth tokens") matches the query but must survive because
    // id mode short-circuits before the query path runs.
    const surviving = await ctx.memory.search({ query: "auth" });
    expect(surviving.some((r) => r.memory.id === 3)).toBe(true);
  });

  it("query mode without confirm returns a read-only preview and deletes nothing", async () => {
    const tool = createMemoryForgetTool(ctx);
    const result = await tool.execute({ query: "auth" }, toolCtx);

    expect(result).toContain("Will delete:");
    expect(result).toContain("confirm=true");
    // Nothing was actually deleted.
    const stillPresent = await ctx.memory.search({ query: "auth" });
    expect(stillPresent.length).toBeGreaterThan(0);
  });

  it("query-mode preview searches with a limit of 20", async () => {
    // The preview path passes limit:20 to memory.search. This pins the
    // documented "preview caps at 20 rows" contract; the confirmed-delete
    // path (limit 100) is pinned at the manager level in features/memory.
    const realSearch = ctx.memory.search;
    let capturedLimit: number | undefined;
    ctx.memory.search = async (options) => {
      capturedLimit = options.limit;
      return realSearch(options);
    };

    const tool = createMemoryForgetTool(ctx);
    await tool.execute({ query: "auth" }, toolCtx);

    expect(capturedLimit).toBe(20);
  });

  it("query mode with confirm:true commits the deletion via forgetByQuery", async () => {
    const tool = createMemoryForgetTool(ctx);
    const result = await tool.execute({ query: "auth", confirm: true }, toolCtx);

    expect(result).toContain("Deleted");
    const remaining = await ctx.memory.search({ query: "auth" });
    expect(remaining.length).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------

  it("returns error message on failure (never throws)", async () => {
    const brokenCtx = createMockPluginContext({ testDir: "/tmp/broken" });
    brokenCtx.memory.forget = async () => {
      throw new Error("Disk full");
    };

    const tool = createMemoryForgetTool(brokenCtx);
    const result = await tool.execute({ id: 1 }, toolCtx);

    expect(result).toContain("Error deleting memory: Disk full");
  });
});
