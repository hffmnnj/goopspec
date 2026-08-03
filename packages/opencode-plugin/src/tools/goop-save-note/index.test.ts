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
    const result = String(
      await tool.execute(
        {
          title: "SQLite WAL mode",
          body: "WAL mode improves concurrent read performance.",
          tags: ["sqlite", "performance"],
          source_agent: "goop-researcher",
        },
        toolCtx,
      ),
    );

    expect(result).toContain("Field Note saved:");
    expect(result).toContain("fn_");
    expect(result).toContain("SQLite WAL mode");
  });

  it("echoes body_chars in the save result", async () => {
    const tool = createGoopSaveNoteTool(ctx);
    const body = "WAL mode improves concurrent read performance.";
    const result = String(
      await tool.execute(
        {
          title: "SQLite WAL mode",
          body,
          tags: ["sqlite", "performance"],
          source_agent: "goop-researcher",
        },
        toolCtx,
      ),
    );

    expect(result).toContain(`Body chars: ${body.length}`);
  });

  it("echoes body_chars in batch mode item details", async () => {
    const tool = createGoopSaveNoteTool(ctx);
    const result = String(
      await tool.execute(
        {
          title: "",
          body: "",
          tags: [],
          source_agent: "test",
          items: [{ title: "Note 1", body: "Body 1", tags: ["a"], source_agent: "goop-tester" }],
        },
        toolCtx,
      ),
    );

    expect(result).toContain("1/1 succeeded");
    expect(result).toContain("6 chars");
  });

  it("ID matches fn_YYYYMMDD_random8 format", async () => {
    const tool = createGoopSaveNoteTool(ctx);
    const result = String(
      await tool.execute(
        {
          title: "Test note",
          body: "Body content",
          tags: ["test"],
          source_agent: "goop-tester",
        },
        toolCtx,
      ),
    );

    // Extract the ID from the result string
    const idMatch = result.match(/fn_\d{8}_[a-z0-9]+/);
    expect(idMatch).not.toBeNull();

    const id = idMatch?.[0];
    // Verify format: fn_YYYYMMDD_<alphanumeric>
    expect(id).toMatch(/^fn_\d{8}_[a-z0-9]+$/);
  });

  it("note is retrievable via ctx.db.getNoteById()", async () => {
    const tool = createGoopSaveNoteTool(ctx);
    const result = String(
      await tool.execute(
        {
          title: "Retrievable note",
          body: "This note should be in the DB.",
          tags: ["retrieval"],
          source_agent: "goop-explorer",
        },
        toolCtx,
      ),
    );

    // Extract the ID
    const idMatch = result.match(/fn_\d{8}_[a-z0-9]+/);
    expect(idMatch).not.toBeNull();

    const note = ctx.db.getNoteById(idMatch?.[0] ?? "");
    expect(note).not.toBeNull();
    expect(note?.title).toBe("Retrievable note");
    expect(note?.body).toBe("This note should be in the DB.");
    expect(note?.source_agent).toBe("goop-explorer");
  });

  it("tags are stored as JSON array", async () => {
    const tool = createGoopSaveNoteTool(ctx);
    const result = String(
      await tool.execute(
        {
          title: "Tagged note",
          body: "Note with multiple tags.",
          tags: ["sqlite", "fts5", "search"],
          source_agent: "goop-researcher",
        },
        toolCtx,
      ),
    );

    const idMatch = result.match(/fn_\d{8}_[a-z0-9]+/);
    const note = ctx.db.getNoteById(idMatch?.[0] ?? "");
    expect(note).not.toBeNull();

    const tags = JSON.parse(note?.tags ?? "[]");
    expect(tags).toEqual(["sqlite", "fts5", "search"]);
  });

  it("importance defaults to 5 when not provided", async () => {
    const tool = createGoopSaveNoteTool(ctx);
    const result = String(
      await tool.execute(
        {
          title: "Default importance",
          body: "No importance specified.",
          tags: ["test"],
          source_agent: "goop-tester",
        },
        toolCtx,
      ),
    );

    const idMatch = result.match(/fn_\d{8}_[a-z0-9]+/);
    const note = ctx.db.getNoteById(idMatch?.[0] ?? "");
    expect(note?.importance).toBe(5);
  });

  it("respects explicit importance value", async () => {
    const tool = createGoopSaveNoteTool(ctx);
    const result = String(
      await tool.execute(
        {
          title: "High importance",
          body: "Critical finding.",
          tags: ["critical"],
          source_agent: "goop-researcher",
          importance: 9,
        },
        toolCtx,
      ),
    );

    const idMatch = result.match(/fn_\d{8}_[a-z0-9]+/);
    const note = ctx.db.getNoteById(idMatch?.[0] ?? "");
    expect(note?.importance).toBe(9);
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

    expect(result).toContain("Error in goop_save_note");
    expect(result).toContain("DB write failed");
  });

  // -----------------------------------------------------------------------
  // Optional fields
  // -----------------------------------------------------------------------

  it("stores workflow_id and project_id when provided", async () => {
    const tool = createGoopSaveNoteTool(ctx);
    const result = String(
      await tool.execute(
        {
          title: "Scoped note",
          body: "Note with scope.",
          tags: ["scoped"],
          source_agent: "goop-researcher",
          workflow_id: "wf-test",
          project_id: "proj-test",
        },
        toolCtx,
      ),
    );

    const idMatch = result.match(/fn_\d{8}_[a-z0-9]+/);
    const note = ctx.db.getNoteById(idMatch?.[0] ?? "");
    expect(note?.workflow_id).toBe("wf-test");
    expect(note?.project_id).toBe("proj-test");
  });

  it("stores null for workflow_id and project_id when omitted", async () => {
    const tool = createGoopSaveNoteTool(ctx);
    const result = String(
      await tool.execute(
        {
          title: "Global note",
          body: "No scope.",
          tags: [],
          source_agent: "goop-researcher",
        },
        toolCtx,
      ),
    );

    const idMatch = result.match(/fn_\d{8}_[a-z0-9]+/);
    const note = ctx.db.getNoteById(idMatch?.[0] ?? "");
    expect(note?.workflow_id).toBeNull();
    expect(note?.project_id).toBeNull();
  });

  describe("goop_save_note batch mode (items[])", () => {
    it("empty items array falls through to single-note path", async () => {
      const tool = createGoopSaveNoteTool(ctx);
      const result = String(
        await tool.execute(
          {
            title: "Single fallback note",
            body: "Fallback body",
            tags: ["fallback"],
            source_agent: "test",
            items: [],
          },
          toolCtx,
        ),
      );
      expect(result).toContain("Field Note saved:");
      expect(result).toContain("Single fallback note");
      const note = ctx.db.searchNotes("Fallback body")[0];
      expect(note?.title).toBe("Single fallback note");
    });

    it("returns error when items array is empty and no note fields are provided", async () => {
      const tool = createGoopSaveNoteTool(ctx);
      const result = await tool.execute({ items: [] }, toolCtx);
      expect(result).toContain("Error in goop_save_note");
      expect(result).toContain("items[] array is empty");
      expect(result).not.toContain("succeeded");
    });

    it("saves single-element items array", async () => {
      const tool = createGoopSaveNoteTool(ctx);
      const result = await tool.execute(
        {
          title: "",
          body: "",
          tags: [],
          source_agent: "test",
          items: [{ title: "Note 1", body: "Body 1", tags: ["a"], source_agent: "goop-tester" }],
        },
        toolCtx,
      );
      expect(result).toContain("1/1 succeeded");
    });

    it("saves multi-element items array", async () => {
      const tool = createGoopSaveNoteTool(ctx);
      const result = await tool.execute(
        {
          title: "",
          body: "",
          tags: [],
          source_agent: "test",
          items: [
            { title: "Note A", body: "A", tags: ["x"], source_agent: "agent" },
            { title: "Note B", body: "B", tags: ["y"], source_agent: "agent" },
            { title: "Note C", body: "C", tags: ["z"], source_agent: "agent" },
          ],
        },
        toolCtx,
      );
      expect(result).toContain("3/3 succeeded");
    });

    it("rolls back the batch when one item fails validation", async () => {
      const tool = createGoopSaveNoteTool(ctx);
      const result = await tool.execute(
        {
          title: "",
          body: "",
          tags: [],
          source_agent: "test",
          items: [
            { title: "Valid", body: "Body", tags: [], source_agent: "agent", importance: 5 },
            { title: "Bad", body: "Body", tags: [], source_agent: "agent", importance: 99 },
            { title: "Also Valid", body: "Body", tags: [], source_agent: "agent", importance: 3 },
          ],
        },
        toolCtx,
      );
      expect(result).toContain("0/3 succeeded");
      expect(result).toContain("FAIL");
      expect(result).toContain("importance out of range");

      // No valid items persist after a batch failure.
      const search = ctx.db.searchNotes("Body");
      expect(search.length).toBe(0);
    });

    it("backward-compat: single-note path works when items absent", async () => {
      const tool = createGoopSaveNoteTool(ctx);
      const result = await tool.execute(
        {
          title: "Single Note",
          body: "Body",
          tags: ["test"],
          source_agent: "agent",
        },
        toolCtx,
      );
      expect(result).toContain("Field Note saved:");
      expect(result).toContain("fn_");
    });

    it("patches an existing note via note_id", async () => {
      const tool = createGoopSaveNoteTool(ctx);
      const createResult = await tool.execute(
        {
          title: "Patch target",
          body: "alpha beta gamma",
          tags: ["patch"],
          source_agent: "agent",
        },
        toolCtx,
      );

      const idMatch = String(createResult).match(/fn_\d{8}_[a-z0-9]+/);
      const noteId = idMatch?.[0] ?? "";

      const patchResult = await tool.execute(
        {
          note_id: noteId,
          old_string: "beta",
          new_string: "BETA",
        },
        toolCtx,
      );

      expect(patchResult).toContain(noteId);
      expect(patchResult).toContain("patched");

      const note = ctx.db.getNoteById(noteId);
      expect(note?.body).toBe("alpha BETA gamma");
    });

    it("surfaces patch errors as a tool error string", async () => {
      const tool = createGoopSaveNoteTool(ctx);
      const createResult = await tool.execute(
        {
          title: "Patch target",
          body: "alpha beta gamma",
          tags: ["patch"],
          source_agent: "agent",
        },
        toolCtx,
      );

      const idMatch = String(createResult).match(/fn_\d{8}_[a-z0-9]+/);
      const noteId = idMatch?.[0] ?? "";

      const patchResult = await tool.execute(
        {
          note_id: noteId,
          old_string: "missing text",
          new_string: "BETA",
        },
        toolCtx,
      );

      expect(patchResult).toContain("Error");
      expect(patchResult).toContain("did not appear verbatim");

      const note = ctx.db.getNoteById(noteId);
      expect(note?.body).toBe("alpha beta gamma");
    });

    it("requires old_string when note_id is provided", async () => {
      const tool = createGoopSaveNoteTool(ctx);
      const result = await tool.execute(
        {
          note_id: "fn_20260618_missing0001",
          new_string: "replacement",
        },
        toolCtx,
      );
      expect(result).toContain("Error");
      expect(result).toContain("old_string is required when note_id is provided");
    });

    it("mixes create and patch items in one batch call", async () => {
      const tool = createGoopSaveNoteTool(ctx);
      const createResult = await tool.execute(
        {
          title: "Patch target",
          body: "foo bar baz",
          tags: ["patch"],
          source_agent: "agent",
        },
        toolCtx,
      );

      const idMatch = String(createResult).match(/fn_\d{8}_[a-z0-9]+/);
      const noteId = idMatch?.[0] ?? "";

      const batchResult = await tool.execute(
        {
          title: "",
          body: "",
          tags: [],
          source_agent: "agent",
          items: [
            { title: "Fresh note", body: "Fresh body", tags: ["new"], source_agent: "agent" },
            { note_id: noteId, old_string: "bar", new_string: "BAR" },
          ],
        },
        toolCtx,
      );

      expect(batchResult).toContain("2/2 succeeded");

      const patchedNote = ctx.db.getNoteById(noteId);
      expect(patchedNote?.body).toBe("foo BAR baz");

      const search = ctx.db.searchNotes("Fresh body");
      expect(search.length).toBe(1);
      expect(search[0].title).toBe("Fresh note");
    });

    it("rolls back valid creates when a patch fails", async () => {
      const tool = createGoopSaveNoteTool(ctx);

      const batchResult = await tool.execute(
        {
          title: "",
          body: "",
          tags: [],
          source_agent: "agent",
          items: [
            {
              title: "First note",
              body: "first-unique-body-abc",
              tags: ["a"],
              source_agent: "agent",
            },
            { note_id: "fn_20260618_missing0001", old_string: "no match", new_string: "x" },
            {
              title: "Third note",
              body: "third-unique-body-xyz",
              tags: ["c"],
              source_agent: "agent",
            },
          ],
        },
        toolCtx,
      );

      expect(batchResult).toContain("0/3 succeeded");
      expect(batchResult).toContain("FAIL");

      const firstSearch = ctx.db.searchNotes("first-unique-body-abc");
      expect(firstSearch.length).toBe(0);

      const thirdSearch = ctx.db.searchNotes("third-unique-body-xyz");
      expect(thirdSearch.length).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // Backward compatibility
  // -----------------------------------------------------------------------

  it("backward-compat: plain create call still behaves as before", async () => {
    const tool = createGoopSaveNoteTool(ctx);
    const result = String(
      await tool.execute(
        {
          title: "Plain create",
          body: "Plain body",
          tags: ["plain"],
          source_agent: "goop-tester",
          importance: 6,
        },
        toolCtx,
      ),
    );

    expect(result).toContain("Field Note saved:");
    expect(result).toContain("Plain create");
    expect(result).toContain("plain");

    const idMatch = result.match(/fn_\d{8}_[a-z0-9]+/);
    const note = ctx.db.getNoteById(idMatch?.[0] ?? "");
    expect(note?.body).toBe("Plain body");
    expect(note?.importance).toBe(6);
    expect(JSON.parse(note?.tags ?? "[]")).toEqual(["plain"]);
  });

  // -----------------------------------------------------------------------
  // Tag normalization (defends against string-encoded tags)
  // -----------------------------------------------------------------------

  describe("tag normalization", () => {
    function extractId(result: string): string {
      const match = result.match(/fn_\d{8}_[a-z0-9]+/);
      return match?.[0] ?? "";
    }

    describe("single mode", () => {
      it("accepts a native string[] tags value", async () => {
        const tool = createGoopSaveNoteTool(ctx);
        const result = String(
          await tool.execute(
            {
              title: "Native array tags",
              body: "Body",
              tags: ["alpha", "beta"],
              source_agent: "test",
            },
            toolCtx,
          ),
        );

        expect(result).toContain("Field Note saved:");
        expect(result).toContain("Tags: alpha, beta");

        const note = ctx.db.getNoteById(extractId(result));
        expect(JSON.parse(note?.tags ?? "[]")).toEqual(["alpha", "beta"]);
      });

      it("accepts a JSON-encoded array string for tags", async () => {
        const tool = createGoopSaveNoteTool(ctx);
        const result = String(
          await tool.execute(
            {
              title: "JSON string tags",
              body: "Body",
              tags: '["alpha","beta"]' as unknown as string[],
              source_agent: "test",
            },
            toolCtx,
          ),
        );

        expect(result).toContain("Field Note saved:");
        expect(result).toContain("Tags: alpha, beta");

        const note = ctx.db.getNoteById(extractId(result));
        expect(JSON.parse(note?.tags ?? "[]")).toEqual(["alpha", "beta"]);
      });

      it("accepts a comma-separated string for tags", async () => {
        const tool = createGoopSaveNoteTool(ctx);
        const result = String(
          await tool.execute(
            {
              title: "Comma tags",
              body: "Body",
              tags: "alpha, beta" as unknown as string[],
              source_agent: "test",
            },
            toolCtx,
          ),
        );

        expect(result).toContain("Field Note saved:");
        expect(result).toContain("Tags: alpha, beta");

        const note = ctx.db.getNoteById(extractId(result));
        expect(JSON.parse(note?.tags ?? "[]")).toEqual(["alpha", "beta"]);
      });

      it("does not throw on the success-message path with JSON-string tags (reported crash)", async () => {
        const tool = createGoopSaveNoteTool(ctx);
        const result = String(
          await tool.execute(
            {
              title: "Crash repro",
              body: "Body",
              tags: '["x","y"]' as unknown as string[],
              source_agent: "test",
            },
            toolCtx,
          ),
        );

        // The reported crash was `.join` on a string — must not throw.
        expect(result).toContain("Field Note saved:");
        expect(result).toContain("Tags: x, y");
      });

      it("round-trip: JSON-string tags store identically to native array", async () => {
        const tool = createGoopSaveNoteTool(ctx);

        const nativeResult = String(
          await tool.execute(
            {
              title: "Native",
              body: "unique-native-body-rt",
              tags: ["alpha", "beta"],
              source_agent: "test",
            },
            toolCtx,
          ),
        );
        const nativeNote = ctx.db.getNoteById(extractId(nativeResult));

        const jsonResult = String(
          await tool.execute(
            {
              title: "JSON",
              body: "unique-json-body-rt",
              tags: '["alpha","beta"]' as unknown as string[],
              source_agent: "test",
            },
            toolCtx,
          ),
        );
        const jsonNote = ctx.db.getNoteById(extractId(jsonResult));

        // Anti-double-encoding: the stored tags column must be identical.
        expect(jsonNote?.tags).toBe(nativeNote?.tags);
        expect(jsonNote?.tags).toBe('["alpha","beta"]');
      });
    });

    describe("batch mode", () => {
      it("accepts a native string[] tags value in batch mode", async () => {
        const tool = createGoopSaveNoteTool(ctx);
        const result = String(
          await tool.execute(
            {
              title: "",
              body: "",
              tags: [],
              source_agent: "test",
              items: [
                {
                  title: "Batch native",
                  body: "batch-native-body-xyz",
                  tags: ["alpha", "beta"],
                  source_agent: "test",
                },
              ],
            },
            toolCtx,
          ),
        );

        expect(result).toContain("1/1 succeeded");

        const note = ctx.db.searchNotes("batch-native-body-xyz")[0];
        expect(JSON.parse(note?.tags ?? "[]")).toEqual(["alpha", "beta"]);
      });

      it("accepts a JSON-encoded array string for tags in batch mode", async () => {
        const tool = createGoopSaveNoteTool(ctx);
        const result = String(
          await tool.execute(
            {
              title: "",
              body: "",
              tags: [],
              source_agent: "test",
              items: [
                {
                  title: "Batch JSON",
                  body: "batch-json-body-xyz",
                  tags: '["alpha","beta"]' as unknown as string[],
                  source_agent: "test",
                },
              ],
            },
            toolCtx,
          ),
        );

        expect(result).toContain("1/1 succeeded");

        const note = ctx.db.searchNotes("batch-json-body-xyz")[0];
        expect(JSON.parse(note?.tags ?? "[]")).toEqual(["alpha", "beta"]);
      });

      it("accepts a comma-separated string for tags in batch mode", async () => {
        const tool = createGoopSaveNoteTool(ctx);
        const result = String(
          await tool.execute(
            {
              title: "",
              body: "",
              tags: [],
              source_agent: "test",
              items: [
                {
                  title: "Batch comma",
                  body: "batch-comma-body-xyz",
                  tags: "alpha, beta" as unknown as string[],
                  source_agent: "test",
                },
              ],
            },
            toolCtx,
          ),
        );

        expect(result).toContain("1/1 succeeded");

        const note = ctx.db.searchNotes("batch-comma-body-xyz")[0];
        expect(JSON.parse(note?.tags ?? "[]")).toEqual(["alpha", "beta"]);
      });

      it("round-trip: batch JSON-string tags store identically to native array", async () => {
        const tool = createGoopSaveNoteTool(ctx);

        const nativeResult = String(
          await tool.execute(
            {
              title: "",
              body: "",
              tags: [],
              source_agent: "test",
              items: [
                {
                  title: "RT Native",
                  body: "rt-native-batch-body-xyz",
                  tags: ["alpha", "beta"],
                  source_agent: "test",
                },
              ],
            },
            toolCtx,
          ),
        );
        expect(nativeResult).toContain("1/1 succeeded");
        const nativeNote = ctx.db.searchNotes("rt-native-batch-body-xyz")[0];

        const jsonResult = String(
          await tool.execute(
            {
              title: "",
              body: "",
              tags: [],
              source_agent: "test",
              items: [
                {
                  title: "RT JSON",
                  body: "rt-json-batch-body-xyz",
                  tags: '["alpha","beta"]' as unknown as string[],
                  source_agent: "test",
                },
              ],
            },
            toolCtx,
          ),
        );
        expect(jsonResult).toContain("1/1 succeeded");
        const jsonNote = ctx.db.searchNotes("rt-json-batch-body-xyz")[0];

        // Anti-double-encoding: the stored tags column must be identical.
        expect(jsonNote?.tags).toBe(nativeNote?.tags);
        expect(jsonNote?.tags).toBe('["alpha","beta"]');
      });
    });
  });

  // -----------------------------------------------------------------------
  // Positive fixture inventory — valid call shapes (W4 Task 1)
  //
  // goop_save_note is a CREATE-or-PATCH tool, structurally distinct from the
  // content-document tools. The generic shapes map as follows:
  //   - "full-document write" → note CREATE (title + body + tags + source_agent)
  //   - "append mode" → N/A. There is no `mode` field; a note is a single
  //     inserted row, not appended content. Omitted.
  //   - "patch mode" → note PATCH via note_id + old_string + new_string
  //   - "replace-all patch" → note PATCH with replace_all: true
  //   - "items[] batch" → batch create/patch
  //   - "blank-document patch workaround" → patching a note whose body is ''
  //     with old_string: '' succeeds today (patchContent('', '', newString)).
  // -----------------------------------------------------------------------

  describe("positive fixture inventory — valid call shapes (W4.T1)", () => {
    function extractId(result: string): string {
      return result.match(/fn_\d{8}_[a-z0-9]+/)?.[0] ?? "";
    }

    it("SHAPE: note create (title + body + tags + source_agent)", async () => {
      const tool = createGoopSaveNoteTool(ctx);
      const result = String(
        await tool.execute(
          {
            title: "Inventory note",
            body: "Body for inventory.",
            tags: ["inv"],
            source_agent: "goop-tester",
          },
          toolCtx,
        ),
      );
      expect(result).toContain("Field Note saved:");
      expect(result).toContain("Inventory note");
    });

    it("SHAPE: patch mode (note_id + old_string + new_string, single match)", async () => {
      const tool = createGoopSaveNoteTool(ctx);
      const createResult = String(
        await tool.execute(
          { title: "Inv patch target", body: "alpha beta", tags: ["p"], source_agent: "agent" },
          toolCtx,
        ),
      );
      const noteId = extractId(createResult);

      const result = await tool.execute(
        { note_id: noteId, old_string: "beta", new_string: "BETA" },
        toolCtx,
      );
      expect(result).toContain(noteId);
      expect(result).toContain("patched");
      expect(ctx.db.getNoteById(noteId)?.body).toBe("alpha BETA");
    });

    it("SHAPE: replace-all patch (note_id + old_string + new_string + replace_all: true)", async () => {
      const tool = createGoopSaveNoteTool(ctx);
      const createResult = String(
        await tool.execute(
          {
            title: "Inv replace-all target",
            body: "foo bar foo baz foo",
            tags: ["p"],
            source_agent: "agent",
          },
          toolCtx,
        ),
      );
      const noteId = extractId(createResult);

      const result = await tool.execute(
        { note_id: noteId, old_string: "foo", new_string: "qux", replace_all: true },
        toolCtx,
      );
      expect(result).toContain(noteId);
      expect(ctx.db.getNoteById(noteId)?.body).toBe("qux bar qux baz qux");
    });

    it("SHAPE: items[] batch (mixed create + patch items)", async () => {
      const tool = createGoopSaveNoteTool(ctx);
      const createResult = String(
        await tool.execute(
          { title: "Batch patch target", body: "alpha beta", tags: ["p"], source_agent: "agent" },
          toolCtx,
        ),
      );
      const noteId = extractId(createResult);

      const result = String(
        await tool.execute(
          {
            title: "",
            body: "",
            tags: [],
            source_agent: "agent",
            items: [
              { title: "Fresh batch note", body: "Fresh body", tags: ["n"], source_agent: "agent" },
              { note_id: noteId, old_string: "beta", new_string: "BETA" },
            ],
          },
          toolCtx,
        ),
      );
      expect(result).toContain("2/2 succeeded");
      expect(ctx.db.getNoteById(noteId)?.body).toBe("alpha BETA");
    });

    it("SHAPE: blank-document patch workaround (note_id + old_string: '' on a note with empty body)", async () => {
      // CURRENT behaviour: a note created with body: '' can be patched via
      // old_string: '' because patchContent('', '', newString) succeeds with
      // matchCount -1. Locked here so Wave 4 Task 2/3 must decide deliberately.
      const tool = createGoopSaveNoteTool(ctx);
      const createResult = String(
        await tool.execute(
          { title: "Empty body note", body: "", tags: ["empty"], source_agent: "agent" },
          toolCtx,
        ),
      );
      const noteId = extractId(createResult);
      expect(ctx.db.getNoteById(noteId)?.body).toBe("");

      const result = await tool.execute(
        { note_id: noteId, old_string: "", new_string: "Filled in via empty patch" },
        toolCtx,
      );
      expect(result).toContain(noteId);
      expect(ctx.db.getNoteById(noteId)?.body).toBe("Filled in via empty patch");
    });
  });
});
