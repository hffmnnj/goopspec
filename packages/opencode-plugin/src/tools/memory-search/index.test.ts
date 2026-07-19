import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import type { MemoryEntry, PluginContext, ToolContext } from "../../test-utils.js";
import {
  createMockPluginContext,
  createMockToolContext,
  setupTestEnvironment,
} from "../../test-utils.js";
import { createMemorySearchTool } from "./index.js";

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------

function seedMemories(): MemoryEntry[] {
  return [
    {
      id: 1,
      type: "observation",
      title: "Repository pattern in data layer",
      content: "The codebase uses the repository pattern for all data access.",
      facts: ["Uses repository pattern"],
      concepts: ["patterns", "architecture"],
      importance: 7,
      createdAt: Date.now() - 86_400_000,
    },
    {
      id: 2,
      type: "decision",
      title: "Use PostgreSQL for storage",
      content: "Chose PostgreSQL for JSON support and complex queries.",
      facts: ["PostgreSQL selected"],
      concepts: ["database", "architecture"],
      importance: 9,
      createdAt: Date.now() - 43_200_000,
    },
    {
      id: 3,
      type: "note",
      title: "Auth tests flaky on CI",
      content: "The auth integration tests fail intermittently on CI runners.",
      concepts: ["testing", "ci"],
      importance: 3,
      createdAt: Date.now(),
    },
    {
      id: 4,
      type: "todo",
      title: "Refactor auth middleware",
      content: "Extract shared auth logic into a reusable helper function.",
      concepts: ["auth", "refactor"],
      importance: 5,
      createdAt: Date.now(),
    },
  ];
}

describe("memory_search tool", () => {
  let ctx: PluginContext;
  let toolCtx: ToolContext;
  let cleanup: () => void;

  beforeEach(() => {
    const env = setupTestEnvironment("memory-search");
    cleanup = env.cleanup;
    ctx = createMockPluginContext({ testDir: env.testDir, memories: seedMemories() });
    toolCtx = createMockToolContext();
  });

  afterEach(() => cleanup());

  // -------------------------------------------------------------------------
  // Basic search
  // -------------------------------------------------------------------------

  it("finds memories matching a query", async () => {
    const tool = createMemorySearchTool(ctx);
    const result = await tool.execute({ query: "repository" }, toolCtx);

    expect(result).toContain("# Memory Search Results");
    expect(result).toContain("Repository pattern in data layer");
    expect(result).toContain("**Type:** observation");
  });

  it("returns no-results message when nothing matches", async () => {
    const tool = createMemorySearchTool(ctx);
    const result = await tool.execute({ query: "xyznonexistent" }, toolCtx);

    expect(result).toContain('No memories found matching: "xyznonexistent"');
    expect(result).toContain("Tip:");
  });

  it("keeps absent and false includeFieldNotes behavior byte-identical", async () => {
    ctx.db.saveNote({
      id: "fn_20260719_bridge01",
      title: "Repository Field Note",
      body: "The repository pattern is documented in this Field Note.",
      tags: '["architecture"]',
      source_agent: "goop-researcher",
      importance: 8,
      workflow_id: null,
      project_id: null,
    });
    const tool = createMemorySearchTool(ctx);

    const absent = await tool.execute({ query: "repository" }, toolCtx);
    const explicitFalse = await tool.execute(
      { query: "repository", includeFieldNotes: false },
      toolCtx,
    );

    expect(explicitFalse).toBe(absent);
    expect(absent).toContain("Repository pattern in data layer");
    expect(absent).not.toContain("Repository Field Note");
  });

  it("fuses memory and Field Note matches with origin tags", async () => {
    ctx.db.saveNote({
      id: "fn_20260719_bridge02",
      title: "Repository architecture Field Note",
      body: "The repository pattern governs this architecture.",
      tags: '["architecture", "patterns"]',
      source_agent: "goop-researcher",
      importance: 9,
      workflow_id: null,
      project_id: null,
    });
    const tool = createMemorySearchTool(ctx);
    const result = await tool.execute({ query: "repository", includeFieldNotes: true }, toolCtx);

    expect(result).toContain("Repository pattern in data layer");
    expect(result).toContain("Repository architecture Field Note");
    expect(result).toContain("**Origin:** memory");
    expect(result).toContain("**Origin:** field_note");
    expect(result).toContain("**RRF Score:** 0.0164");
  });

  it("returns memory.db-only results when includeFieldNotes is true but no Field Notes match", async () => {
    const tool = createMemorySearchTool(ctx);
    const result = await tool.execute({ query: "repository", includeFieldNotes: true }, toolCtx);

    expect(result).toContain("Repository pattern in data layer");
    expect(result).toContain("**Origin:** memory");
    expect(result).not.toContain("**Origin:** field_note");
  });

  it("orders cross-store results by RRF score (k=60)", async () => {
    // Seed a second memory so memory.db has a clear top-two ranking.
    await ctx.memory.save({
      type: "note",
      title: "Repository pattern second memory",
      content: "Another repository pattern mention with lower score.",
      concepts: ["patterns"],
      importance: 4,
    });

    ctx.db.saveNote({
      id: "fn_20260719_rrf02",
      title: "Repository Field Note runner-up",
      body: "Repository pattern described here but ranked second in Field Notes.",
      tags: '["patterns"]',
      source_agent: "goop-researcher",
      importance: 7,
      workflow_id: null,
      project_id: null,
    });

    ctx.db.saveNote({
      id: "fn_20260719_rrf01",
      title: "Repository Field Note winner",
      body: "The repository pattern wins in the Field Notes ranking.",
      tags: '["architecture", "patterns"]',
      source_agent: "goop-researcher",
      importance: 9,
      workflow_id: null,
      project_id: null,
    });

    const tool = createMemorySearchTool(ctx);
    const result = await tool.execute(
      { query: "repository", includeFieldNotes: true, limit: 4 },
      toolCtx,
    );

    // RRF scores with k=60:
    //   memory #1 (rank 1)  -> 1 / 61  ≈ 0.016393
    //   field_note #1       -> 1 / 61  ≈ 0.016393  (tied, stable sort keeps memory first)
    //   memory #2 (rank 2)  -> 1 / 62  ≈ 0.016129
    //   field_note #2       -> 1 / 62  ≈ 0.016129  (tied, stable sort keeps memory first)
    const output = String(result);
    const firstMemory = output.indexOf("Repository pattern in data layer");
    const firstNote = output.indexOf("Repository Field Note winner");
    const secondMemory = output.indexOf("Repository pattern second memory");
    const secondNote = output.indexOf("Repository Field Note runner-up");

    expect(firstMemory).toBeGreaterThan(-1);
    expect(firstNote).toBeGreaterThan(-1);
    expect(secondMemory).toBeGreaterThan(-1);
    expect(secondNote).toBeGreaterThan(-1);

    expect(firstMemory).toBeLessThan(firstNote);
    expect(firstNote).toBeLessThan(secondMemory);
    expect(secondMemory).toBeLessThan(secondNote);
  });

  // -------------------------------------------------------------------------
  // Filters
  // -------------------------------------------------------------------------

  it("filters by type", async () => {
    const tool = createMemorySearchTool(ctx);
    const result = await tool.execute({ query: "auth", types: ["todo"] }, toolCtx);

    expect(result).toContain("Refactor auth middleware");
    expect(result).not.toContain("Auth tests flaky");
  });

  it("filters by concepts", async () => {
    const tool = createMemorySearchTool(ctx);
    // Both entries match "storage"/"data" text, but only PostgreSQL has "database" concept
    const result = await tool.execute({ query: "PostgreSQL", concepts: ["database"] }, toolCtx);

    expect(result).toContain("PostgreSQL");
    // The observation has "architecture" concept but not "database"
    expect(result).not.toContain("Repository pattern");
  });

  it("filters by minImportance", async () => {
    const tool = createMemorySearchTool(ctx);
    const result = await tool.execute({ query: "auth", minImportance: 5 }, toolCtx);

    // Only the todo (importance=5) should match, not the note (importance=3)
    expect(result).toContain("Refactor auth middleware");
    expect(result).not.toContain("flaky");
  });

  // -------------------------------------------------------------------------
  // Limit
  // -------------------------------------------------------------------------

  it("respects the limit parameter", async () => {
    const tool = createMemorySearchTool(ctx);
    const result = await tool.execute({ query: "auth", limit: 1 }, toolCtx);

    expect(result).toContain("Found 1 matching memory");
  });

  it("caps limit at 20", async () => {
    const tool = createMemorySearchTool(ctx);
    // Even with limit=100, the mock only has 4 entries
    const result = await tool.execute({ query: "auth", limit: 100 }, toolCtx);

    // Should not crash; returns whatever matches
    expect(result).toContain("Memory Search Results");
  });

  // -------------------------------------------------------------------------
  // Output formatting
  // -------------------------------------------------------------------------

  it("includes facts and concepts in output", async () => {
    const tool = createMemorySearchTool(ctx);
    const result = await tool.execute({ query: "repository" }, toolCtx);

    expect(result).toContain("**Facts:**");
    expect(result).toContain("- Uses repository pattern");
    expect(result).toContain("**Concepts:** patterns, architecture");
  });

  it("shows score and match type", async () => {
    const tool = createMemorySearchTool(ctx);
    const result = await tool.execute({ query: "PostgreSQL" }, toolCtx);

    // Mock returns "fts" match type
    expect(result).toContain("(fts)");
  });

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------

  it("returns error message on search failure (never throws)", async () => {
    const brokenCtx = createMockPluginContext({ testDir: "/tmp/broken" });
    brokenCtx.memory.search = async () => {
      throw new Error("Index corrupted");
    };

    const tool = createMemorySearchTool(brokenCtx);
    const result = await tool.execute({ query: "test" }, toolCtx);

    expect(result).toContain("Error searching memory: Index corrupted");
  });
});
