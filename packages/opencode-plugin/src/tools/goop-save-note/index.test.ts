import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import type { PluginContext, ToolContext } from "../../test-utils.js";
import {
  createMockPluginContext,
  createMockToolContext,
  setupTestEnvironment,
} from "../../test-utils.js";
import { createGoopSaveNoteTool } from "./index.js";

describe("goop_save_note tool", () => {
  let ctx: PluginContext;
  let toolCtx: ToolContext;
  let cleanup: () => void;

  beforeEach(() => {
    const env = setupTestEnvironment("goop-save-note");
    cleanup = env.cleanup;
    ctx = createMockPluginContext({ testDir: env.testDir, db: env.db });
    toolCtx = createMockToolContext();
  });

  afterEach(() => cleanup());

  // -----------------------------------------------------------------------
  // Basic save
  // -----------------------------------------------------------------------

  it("saves a note and returns the generated ID", async () => {
    const tool = createGoopSaveNoteTool(ctx);
    const result = String(await tool.execute(
      {
        title: "SQLite WAL mode",
        body: "WAL mode improves concurrent read performance.",
        tags: ["sqlite", "performance"],
        source_agent: "goop-researcher",
      },
      toolCtx,
    ));

    expect(result).toContain("Field Note saved:");
    expect(result).toContain("fn_");
    expect(result).toContain("SQLite WAL mode");
  });

  it("ID matches fn_YYYYMMDD_random8 format", async () => {
    const tool = createGoopSaveNoteTool(ctx);
    const result = String(await tool.execute(
      {
        title: "Test note",
        body: "Body content",
        tags: ["test"],
        source_agent: "goop-tester",
      },
      toolCtx,
    ));

    // Extract the ID from the result string
    const idMatch = result.match(/fn_\d{8}_[a-z0-9]+/);
    expect(idMatch).not.toBeNull();

    const id = idMatch![0];
    // Verify format: fn_YYYYMMDD_<alphanumeric>
    expect(id).toMatch(/^fn_\d{8}_[a-z0-9]+$/);
  });

  it("note is retrievable via ctx.db.getNoteById()", async () => {
    const tool = createGoopSaveNoteTool(ctx);
    const result = String(await tool.execute(
      {
        title: "Retrievable note",
        body: "This note should be in the DB.",
        tags: ["retrieval"],
        source_agent: "goop-explorer",
      },
      toolCtx,
    ));

    // Extract the ID
    const idMatch = result.match(/fn_\d{8}_[a-z0-9]+/);
    expect(idMatch).not.toBeNull();

    const note = ctx.db.getNoteById(idMatch![0]);
    expect(note).not.toBeNull();
    expect(note!.title).toBe("Retrievable note");
    expect(note!.body).toBe("This note should be in the DB.");
    expect(note!.source_agent).toBe("goop-explorer");
  });

  it("tags are stored as JSON array", async () => {
    const tool = createGoopSaveNoteTool(ctx);
    const result = String(await tool.execute(
      {
        title: "Tagged note",
        body: "Note with multiple tags.",
        tags: ["sqlite", "fts5", "search"],
        source_agent: "goop-researcher",
      },
      toolCtx,
    ));

    const idMatch = result.match(/fn_\d{8}_[a-z0-9]+/);
    const note = ctx.db.getNoteById(idMatch![0]);
    expect(note).not.toBeNull();

    const tags = JSON.parse(note!.tags);
    expect(tags).toEqual(["sqlite", "fts5", "search"]);
  });

  it("importance defaults to 5 when not provided", async () => {
    const tool = createGoopSaveNoteTool(ctx);
    const result = String(await tool.execute(
      {
        title: "Default importance",
        body: "No importance specified.",
        tags: ["test"],
        source_agent: "goop-tester",
      },
      toolCtx,
    ));

    const idMatch = result.match(/fn_\d{8}_[a-z0-9]+/);
    const note = ctx.db.getNoteById(idMatch![0]);
    expect(note!.importance).toBe(5);
  });

  it("respects explicit importance value", async () => {
    const tool = createGoopSaveNoteTool(ctx);
    const result = String(await tool.execute(
      {
        title: "High importance",
        body: "Critical finding.",
        tags: ["critical"],
        source_agent: "goop-researcher",
        importance: 9,
      },
      toolCtx,
    ));

    const idMatch = result.match(/fn_\d{8}_[a-z0-9]+/);
    const note = ctx.db.getNoteById(idMatch![0]);
    expect(note!.importance).toBe(9);
  });

  // -----------------------------------------------------------------------
  // Validation
  // -----------------------------------------------------------------------

  it("rejects importance outside 1-10 range", async () => {
    const tool = createGoopSaveNoteTool(ctx);
    const result = await tool.execute(
      {
        title: "Bad importance",
        body: "Body",
        tags: [],
        source_agent: "test",
        importance: 15,
      },
      toolCtx,
    );

    expect(result).toContain("Error");
    expect(result).toContain("Importance must be between 1 and 10");
  });

  // -----------------------------------------------------------------------
  // Error handling
  // -----------------------------------------------------------------------

  it("returns error string on DB failure (graceful degradation)", async () => {
    // Override db.saveNote to throw
    const brokenCtx = createMockPluginContext({ testDir: "/tmp/broken-save-note" });
    brokenCtx.db.saveNote = () => {
      throw new Error("DB write failed");
    };

    const tool = createGoopSaveNoteTool(brokenCtx);
    const result = await tool.execute(
      {
        title: "Will fail",
        body: "Body",
        tags: [],
        source_agent: "test",
      },
      toolCtx,
    );

    expect(result).toContain("Error saving Field Note");
    expect(result).toContain("DB write failed");
  });

  // -----------------------------------------------------------------------
  // Optional fields
  // -----------------------------------------------------------------------

  it("stores workflow_id and project_id when provided", async () => {
    const tool = createGoopSaveNoteTool(ctx);
    const result = String(await tool.execute(
      {
        title: "Scoped note",
        body: "Note with scope.",
        tags: ["scoped"],
        source_agent: "goop-researcher",
        workflow_id: "wf-test",
        project_id: "proj-test",
      },
      toolCtx,
    ));

    const idMatch = result.match(/fn_\d{8}_[a-z0-9]+/);
    const note = ctx.db.getNoteById(idMatch![0]);
    expect(note!.workflow_id).toBe("wf-test");
    expect(note!.project_id).toBe("proj-test");
  });

  it("stores null for workflow_id and project_id when omitted", async () => {
    const tool = createGoopSaveNoteTool(ctx);
    const result = String(await tool.execute(
      {
        title: "Global note",
        body: "No scope.",
        tags: [],
        source_agent: "goop-researcher",
      },
      toolCtx,
    ));

    const idMatch = result.match(/fn_\d{8}_[a-z0-9]+/);
    const note = ctx.db.getNoteById(idMatch![0]);
    expect(note!.workflow_id).toBeNull();
    expect(note!.project_id).toBeNull();
  });
});
