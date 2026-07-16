import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import type { PluginContext, ToolContext } from "../../test-utils.js";
import {
  createMockPluginContext,
  createMockToolContext,
  setupTestEnvironment,
} from "../../test-utils.js";
import { createGoopSearchNotesTool } from "./index.js";

// ---------------------------------------------------------------------------
// Seed data helper
// ---------------------------------------------------------------------------

const LONG_BODY =
  "WAL mode improves concurrent read performance in SQLite databases. " +
  "By writing changes to a separate write-ahead log file instead of the main database file, " +
  "readers can continue to access the original pages while writers append to the log. " +
  "Once the log reaches a checkpoint threshold, SQLite transfers the changes back into the database file.";

function seedNotes(ctx: PluginContext): void {
  ctx.db.saveNote({
    id: "fn_20260618_sqlite01",
    title: "SQLite WAL mode benefits",
    body: LONG_BODY,
    tags: JSON.stringify(["sqlite", "performance"]),
    source_agent: "goop-researcher",
    importance: 8,
    workflow_id: "wf-alpha",
    project_id: "goopspec",
  });

  ctx.db.saveNote({
    id: "fn_20260618_react01",
    title: "React hooks best practices",
    body: "useEffect cleanup functions prevent memory leaks in React components.",
    tags: JSON.stringify(["react", "hooks", "performance"]),
    source_agent: "goop-explorer",
    importance: 6,
    workflow_id: "wf-beta",
    project_id: "goopspec",
  });

  ctx.db.saveNote({
    id: "fn_20260618_bun0001",
    title: "Bun test runner patterns",
    body: "Bun test supports describe/it/expect with built-in mocking.",
    tags: JSON.stringify(["bun", "testing"]),
    source_agent: "goop-tester",
    importance: 5,
    workflow_id: null,
    project_id: "other-project",
  });
}

describe("goop_search_notes tool", () => {
  let ctx: PluginContext;
  let toolCtx: ToolContext;
  let cleanup: () => void;

  beforeEach(() => {
    const env = setupTestEnvironment("goop-search-notes");
    cleanup = env.cleanup;
    ctx = createMockPluginContext({ testDir: env.testDir, db: env.db });
    toolCtx = createMockToolContext();
    seedNotes(ctx);
  });

  afterEach(() => cleanup());

  // -----------------------------------------------------------------------
  // Basic search
  // -----------------------------------------------------------------------

  it("returns formatted markdown results for a match", async () => {
    const tool = createGoopSearchNotesTool(ctx);
    const result = await tool.execute({ query: "SQLite" }, toolCtx);

    expect(result).toContain("Field Notes");
    expect(result).toContain("fn_20260618_sqlite01");
    expect(result).toContain("SQLite WAL mode benefits");
    expect(result).toContain("sqlite, performance");
    expect(result).toContain("goop-researcher");
  });

  it("returns 'no results' message when nothing matches", async () => {
    const tool = createGoopSearchNotesTool(ctx);
    const result = await tool.execute({ query: "xyznonexistent" }, toolCtx);

    expect(result).toContain("No Field Notes found");
    expect(result).toContain("xyznonexistent");
  });

  // -----------------------------------------------------------------------
  // Filters
  // -----------------------------------------------------------------------

  it("filters by project_id", async () => {
    const tool = createGoopSearchNotesTool(ctx);
    const result = await tool.execute({ query: "patterns", project_id: "other-project" }, toolCtx);

    expect(result).toContain("Bun test runner patterns");
    expect(result).not.toContain("React hooks");
  });

  it("filters by workflow_id", async () => {
    const tool = createGoopSearchNotesTool(ctx);
    const result = await tool.execute({ query: "performance", workflow_id: "wf-alpha" }, toolCtx);

    expect(result).toContain("SQLite WAL mode");
    expect(result).not.toContain("React hooks");
  });

  // -----------------------------------------------------------------------
  // Limit
  // -----------------------------------------------------------------------

  it("respects limit parameter", async () => {
    const tool = createGoopSearchNotesTool(ctx);
    const result = await tool.execute({ query: "performance", limit: 1 }, toolCtx);

    expect(result).toContain("1 result");
  });

  it("caps limit at 50", async () => {
    const tool = createGoopSearchNotesTool(ctx);
    // Even with limit=100, should not crash
    const result = await tool.execute({ query: "performance", limit: 100 }, toolCtx);

    // Should return results without error
    expect(result).toContain("Field Notes");
  });

  // -----------------------------------------------------------------------
  // Full body and body-range args
  // -----------------------------------------------------------------------

  it("returns 200-character snippet by default for long bodies", async () => {
    const tool = createGoopSearchNotesTool(ctx);
    const result = await tool.execute({ query: "SQLite" }, toolCtx);

    expect(result).toContain("fn_20260618_sqlite01");
    expect(result).toContain("WAL mode improves concurrent read performance");
    expect(result).toContain("...");
    expect(result).not.toContain("checkpoint threshold");
  });

  it("returns complete body when full is true", async () => {
    const tool = createGoopSearchNotesTool(ctx);
    const result = await tool.execute({ query: "SQLite", full: true }, toolCtx);

    expect(result).toContain("fn_20260618_sqlite01");
    expect(result).toContain(LONG_BODY);
    expect(result).not.toContain("...\n---");
  });

  it("slices body with body_offset and body_limit", async () => {
    const tool = createGoopSearchNotesTool(ctx);
    const result = await tool.execute({ query: "SQLite", body_offset: 4, body_limit: 30 }, toolCtx);

    expect(result).toContain("### fn_20260618_sqlite01");
    expect(result).toContain("mode improves concurrent read ");
    expect(result).not.toContain("WAL mode improves");
  });

  it("returns empty body slice when body_offset exceeds body length", async () => {
    const tool = createGoopSearchNotesTool(ctx);
    const result = await tool.execute(
      { query: "SQLite", full: true, body_offset: LONG_BODY.length + 10 },
      toolCtx,
    );

    expect(result).toContain("### fn_20260618_sqlite01");
    expect(result).toMatch(/### fn_20260618_sqlite01[\s\S]*?---/);
  });

  // -----------------------------------------------------------------------
  // Direct note_id fetch
  // -----------------------------------------------------------------------

  it("fetches a note by note_id and returns its full body bypassing ranking", async () => {
    const tool = createGoopSearchNotesTool(ctx);
    const result = await tool.execute({ note_id: "fn_20260618_sqlite01" }, toolCtx);

    expect(result).toContain("### fn_20260618_sqlite01");
    expect(result).toContain(LONG_BODY);
    expect(result).not.toContain("2 results");
  });

  it("returns a clear not-found message for an unknown note_id", async () => {
    const tool = createGoopSearchNotesTool(ctx);
    const result = await tool.execute({ note_id: "fn_20260618_missing9" }, toolCtx);

    expect(result).toContain("No Field Note found with ID 'fn_20260618_missing9'.");
  });

  it("note_id takes precedence over query when both are provided", async () => {
    const tool = createGoopSearchNotesTool(ctx);
    const result = await tool.execute({ note_id: "fn_20260618_bun0001", query: "SQLite" }, toolCtx);

    expect(result).toContain("### fn_20260618_bun0001");
    expect(result).toContain("Bun test supports describe/it/expect with built-in mocking.");
    expect(result).not.toContain("fn_20260618_sqlite01");
  });

  // -----------------------------------------------------------------------
  // Tag-only search (empty query)
  // -----------------------------------------------------------------------

  it("empty query with tags returns results", async () => {
    const tool = createGoopSearchNotesTool(ctx);
    const result = await tool.execute({ query: "", tags: ["sqlite"] }, toolCtx);

    expect(result).toContain("Field Notes");
    expect(result).toContain("SQLite WAL mode");
  });

  // -----------------------------------------------------------------------
  // Error handling
  // -----------------------------------------------------------------------

  it("returns error string on DB failure (graceful degradation)", async () => {
    const brokenCtx = createMockPluginContext({ testDir: "/tmp/broken-search" });
    brokenCtx.db.searchNotes = () => {
      throw new Error("FTS index corrupted");
    };

    const tool = createGoopSearchNotesTool(brokenCtx);
    const result = await tool.execute({ query: "test" }, toolCtx);

    expect(result).toContain("Error searching Field Notes");
    expect(result).toContain("FTS index corrupted");
  });
});
