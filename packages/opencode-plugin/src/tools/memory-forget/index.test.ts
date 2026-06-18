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

    expect(result).toContain("Error: Must provide either 'id' or 'query'");
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
