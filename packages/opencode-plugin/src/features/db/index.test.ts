import { describe, expect, it } from "bun:test";

import { GoopSpecDB } from "./index.js";
import { CURRENT_SCHEMA_VERSION } from "./migrations.js";

// ---------------------------------------------------------------------------
// All tests use in-memory SQLite — no temp files needed.
// ---------------------------------------------------------------------------

describe("GoopSpecDB", () => {
  // -----------------------------------------------------------------------
  // Schema initialisation
  // -----------------------------------------------------------------------

  describe("schema initialization", () => {
    it("creates all four tables", () => {
      const db = new GoopSpecDB(":memory:");
      const tables = ["workflows", "events", "documents", "field_notes"];

      for (const table of tables) {
        // biome-ignore lint/complexity/useLiteralKeys: accessing private property for test
        const row = db["db"]
          .query<{ name: string }, []>(
            `SELECT name FROM sqlite_master WHERE type='table' AND name='${table}'`,
          )
          .get();
        expect(row).not.toBeNull();
        expect(row?.name).toBe(table);
      }

      db.close();
    });

    it("detects FTS5 and enables it", () => {
      const db = new GoopSpecDB(":memory:");
      // Bun ships with FTS5 enabled
      expect(db.fts5Enabled).toBe(true);
      db.close();
    });

    it("records schema version 1", () => {
      const db = new GoopSpecDB(":memory:");
      // biome-ignore lint/complexity/useLiteralKeys: accessing private property for test
      const row = db["db"]
        .query<{ version: number }, []>("SELECT version FROM schema_version WHERE version = 1")
        .get();
      expect(row).not.toBeNull();
      expect(row?.version).toBe(1);
      db.close();
    });

    it("getSchemaVersion() returns current version", () => {
      const db = new GoopSpecDB(":memory:");
      expect(db.getSchemaVersion()).toBe(CURRENT_SCHEMA_VERSION);
      db.close();
    });
  });

  // -----------------------------------------------------------------------
  // Workflows
  // -----------------------------------------------------------------------

  describe("workflows", () => {
    it("upsertWorkflow + getWorkflow round-trips state", () => {
      const db = new GoopSpecDB(":memory:");
      const state = { phase: "execute", mode: "standard" };

      db.upsertWorkflow("wf-1", state);
      const row = db.getWorkflow("wf-1");

      expect(row).not.toBeNull();
      expect(row?.id).toBe("wf-1");
      expect(JSON.parse(row?.state ?? "{}")).toEqual(state);
      db.close();
    });

    it("getAllWorkflows returns all rows", () => {
      const db = new GoopSpecDB(":memory:");
      db.upsertWorkflow("wf-a", { phase: "idle" });
      db.upsertWorkflow("wf-b", { phase: "plan" });

      const all = db.getAllWorkflows();
      expect(all.length).toBe(2);

      const ids = all.map((r) => r.id);
      expect(ids).toContain("wf-a");
      expect(ids).toContain("wf-b");
      db.close();
    });

    it("deleteWorkflow removes the row", () => {
      const db = new GoopSpecDB(":memory:");
      db.upsertWorkflow("wf-del", { phase: "idle" });
      expect(db.getWorkflow("wf-del")).not.toBeNull();

      db.deleteWorkflow("wf-del");
      expect(db.getWorkflow("wf-del")).toBeNull();
      db.close();
    });

    it("getWorkflow returns null for unknown id", () => {
      const db = new GoopSpecDB(":memory:");
      expect(db.getWorkflow("nonexistent")).toBeNull();
      db.close();
    });

    it("upsertWorkflow updates an existing workflow", () => {
      const db = new GoopSpecDB(":memory:");
      db.upsertWorkflow("wf-up", { phase: "idle" });
      db.upsertWorkflow("wf-up", { phase: "execute" });

      const row = db.getWorkflow("wf-up");
      expect(JSON.parse(row?.state ?? "{}")).toEqual({ phase: "execute" });
      // Should still be one row, not two
      expect(db.getAllWorkflows().length).toBe(1);
      db.close();
    });
  });

  // -----------------------------------------------------------------------
  // Events
  // -----------------------------------------------------------------------

  describe("events", () => {
    it("appendEvent returns a positive id", () => {
      const db = new GoopSpecDB(":memory:");
      const id = db.appendEvent("wf-1", "doc_write", { doc_type: "spec" });
      expect(id).toBeGreaterThan(0);
      db.close();
    });

    it("getEvents returns events for a workflow", () => {
      const db = new GoopSpecDB(":memory:");
      db.appendEvent("wf-1", "doc_write", { doc_type: "spec" });
      db.appendEvent("wf-1", "adl", { description: "test" });
      db.appendEvent("wf-2", "doc_write", { doc_type: "blueprint" });

      const events = db.getEvents("wf-1");
      expect(events.length).toBe(2);
      expect(events.every((e) => e.workflow_id === "wf-1")).toBe(true);
      db.close();
    });

    it("getEvents filters by event_type", () => {
      const db = new GoopSpecDB(":memory:");
      db.appendEvent("wf-1", "doc_write", { doc_type: "spec" });
      db.appendEvent("wf-1", "adl", { description: "test" });
      db.appendEvent("wf-1", "doc_write", { doc_type: "blueprint" });

      const docWrites = db.getEvents("wf-1", "doc_write");
      expect(docWrites.length).toBe(2);
      expect(docWrites.every((e) => e.event_type === "doc_write")).toBe(true);

      const adlEvents = db.getEvents("wf-1", "adl");
      expect(adlEvents.length).toBe(1);
      db.close();
    });

    it("events are append-only (no delete/update methods)", () => {
      const db = new GoopSpecDB(":memory:");
      // Verify the class has no deleteEvent or updateEvent methods
      expect("deleteEvent" in db).toBe(false);
      expect("updateEvent" in db).toBe(false);
      db.close();
    });

    it("events are ordered by created_at ASC", () => {
      const db = new GoopSpecDB(":memory:");
      db.appendEvent("wf-1", "first", { order: 1 });
      db.appendEvent("wf-1", "second", { order: 2 });
      db.appendEvent("wf-1", "third", { order: 3 });

      const events = db.getEvents("wf-1");
      expect(events.length).toBe(3);
      // IDs should be in ascending order
      expect(events[0].id).toBeLessThan(events[1].id);
      expect(events[1].id).toBeLessThan(events[2].id);
      db.close();
    });
  });

  // -----------------------------------------------------------------------
  // Documents
  // -----------------------------------------------------------------------

  describe("documents", () => {
    it("upsertDocument creates a new doc", () => {
      const db = new GoopSpecDB(":memory:");
      db.upsertDocument("wf-1", "spec", "# Spec Content");

      const doc = db.getDocument("wf-1", "spec");
      expect(doc).not.toBeNull();
      expect(doc?.content).toBe("# Spec Content");
      expect(doc?.workflow_id).toBe("wf-1");
      expect(doc?.doc_type).toBe("spec");
      db.close();
    });

    it("upsertDocument updates an existing doc", () => {
      const db = new GoopSpecDB(":memory:");
      db.upsertDocument("wf-1", "spec", "# Version 1");
      db.upsertDocument("wf-1", "spec", "# Version 2");

      const doc = db.getDocument("wf-1", "spec");
      expect(doc?.content).toBe("# Version 2");

      // Should be one doc, not two
      const all = db.getAllDocuments("wf-1");
      const specDocs = all.filter((d) => d.doc_type === "spec");
      expect(specDocs.length).toBe(1);
      db.close();
    });

    it("getDocument returns null for missing doc", () => {
      const db = new GoopSpecDB(":memory:");
      expect(db.getDocument("wf-1", "spec")).toBeNull();
      db.close();
    });

    it("listDocTypes returns correct types", () => {
      const db = new GoopSpecDB(":memory:");
      db.upsertDocument("wf-1", "spec", "spec content");
      db.upsertDocument("wf-1", "blueprint", "blueprint content");
      db.upsertDocument("wf-1", "chronicle", "chronicle content");

      const types = db.listDocTypes("wf-1");
      expect(types).toEqual(["blueprint", "chronicle", "spec"]); // sorted ASC
      db.close();
    });

    it("getAllDocuments returns all docs for a workflow", () => {
      const db = new GoopSpecDB(":memory:");
      db.upsertDocument("wf-1", "spec", "spec");
      db.upsertDocument("wf-1", "blueprint", "blueprint");
      db.upsertDocument("wf-2", "spec", "other spec");

      const docs = db.getAllDocuments("wf-1");
      expect(docs.length).toBe(2);
      expect(docs.every((d) => d.workflow_id === "wf-1")).toBe(true);
      db.close();
    });
  });

  // -----------------------------------------------------------------------
  // Field Notes
  // -----------------------------------------------------------------------

  describe("field_notes", () => {
    const baseNote = {
      id: "fn_20260618_abcd1234",
      title: "SQLite FTS5 patterns",
      body: "FTS5 provides full-text search with ranking via bm25.",
      tags: JSON.stringify(["sqlite", "fts5", "search"]),
      source_agent: "goop-researcher",
      importance: 7,
      workflow_id: "wf-1" as string | null,
      project_id: "goopspec" as string | null,
    };

    it("saveNote inserts a note", () => {
      const db = new GoopSpecDB(":memory:");
      db.saveNote(baseNote);

      const note = db.getNoteById("fn_20260618_abcd1234");
      expect(note).not.toBeNull();
      expect(note?.title).toBe("SQLite FTS5 patterns");
      expect(note?.importance).toBe(7);
      db.close();
    });

    it("getNoteById returns the note", () => {
      const db = new GoopSpecDB(":memory:");
      db.saveNote(baseNote);

      const note = db.getNoteById(baseNote.id);
      expect(note).not.toBeNull();
      expect(note?.id).toBe(baseNote.id);
      expect(note?.body).toBe(baseNote.body);
      expect(note?.source_agent).toBe("goop-researcher");
      db.close();
    });

    it("getNoteById returns null for unknown id", () => {
      const db = new GoopSpecDB(":memory:");
      expect(db.getNoteById("fn_nonexistent")).toBeNull();
      db.close();
    });

    it("searchNotes finds by FTS", () => {
      const db = new GoopSpecDB(":memory:");
      db.saveNote(baseNote);
      db.saveNote({
        ...baseNote,
        id: "fn_20260618_efgh5678",
        title: "React hooks guide",
        body: "useEffect cleanup patterns for React components.",
        tags: JSON.stringify(["react", "hooks"]),
      });

      const results = db.searchNotes("FTS5");
      expect(results.length).toBe(1);
      expect(results[0].title).toBe("SQLite FTS5 patterns");
      db.close();
    });

    it("searchNotes filters by project_id", () => {
      const db = new GoopSpecDB(":memory:");
      db.saveNote({ ...baseNote, project_id: "project-a" });
      db.saveNote({
        ...baseNote,
        id: "fn_20260618_proj_b",
        project_id: "project-b",
      });

      const results = db.searchNotes("FTS5", { projectId: "project-a" });
      expect(results.length).toBe(1);
      expect(results[0].project_id).toBe("project-a");
      db.close();
    });

    it("searchNotes filters by workflow_id", () => {
      const db = new GoopSpecDB(":memory:");
      db.saveNote({ ...baseNote, workflow_id: "wf-alpha" });
      db.saveNote({
        ...baseNote,
        id: "fn_20260618_wf_beta",
        workflow_id: "wf-beta",
      });

      const results = db.searchNotes("FTS5", { workflowId: "wf-alpha" });
      expect(results.length).toBe(1);
      expect(results[0].workflow_id).toBe("wf-alpha");
      db.close();
    });

    it("searchNotes respects limit", () => {
      const db = new GoopSpecDB(":memory:");
      for (let i = 0; i < 5; i++) {
        db.saveNote({
          ...baseNote,
          id: `fn_20260618_lim${String(i).padStart(5, "0")}`,
          title: `FTS5 note ${i}`,
          body: `FTS5 search content number ${i}`,
        });
      }

      const results = db.searchNotes("FTS5", { limit: 2 });
      expect(results.length).toBe(2);
      db.close();
    });

    it("searchNotes returns empty array for no matches", () => {
      const db = new GoopSpecDB(":memory:");
      db.saveNote(baseNote);

      const results = db.searchNotes("xyznonexistent");
      expect(results.length).toBe(0);
      db.close();
    });

    it("handles apostrophes in search query without SQL error", () => {
      const db = new GoopSpecDB(":memory:");
      db.saveNote({
        ...baseNote,
        id: "fn_20260618_apos0001",
        title: "It's a test note",
        body: "This note's body contains apostrophes and it's fine.",
      });

      // FTS path: should not throw on apostrophe
      const ftsResults = db.searchNotes("it's a test");
      expect(ftsResults.length).toBeGreaterThanOrEqual(0);

      // LIKE fallback path: should not throw on apostrophe
      const likeResults = db.searchNotes("it's", { tags: ["sqlite"] });
      expect(likeResults.length).toBeGreaterThanOrEqual(0);

      db.close();
    });

    it("handles special characters in search query without SQL error", () => {
      const db = new GoopSpecDB(":memory:");
      db.saveNote(baseNote);

      const specialQueries = [
        "test' OR 1=1 --",
        'test" OR 1=1 --',
        "test); DROP TABLE field_notes; --",
        "test*(){}:^~<>",
        "",
        "   ",
      ];

      for (const q of specialQueries) {
        expect(() => db.searchNotes(q)).not.toThrow();
      }

      db.close();
    });

    it("searchNotes with empty query and tags returns results (LIKE fallback)", () => {
      const db = new GoopSpecDB(":memory:");
      db.saveNote(baseNote);
      db.saveNote({
        ...baseNote,
        id: "fn_20260618_notag001",
        tags: JSON.stringify(["react"]),
      });

      // Empty query with tag filter should use LIKE path and return matching notes
      const results = db.searchNotes("", { tags: ["sqlite"] });
      expect(results.length).toBe(1);
      expect(results[0].id).toBe(baseNote.id);
      db.close();
    });
  });

  // -----------------------------------------------------------------------
  // Migration
  // -----------------------------------------------------------------------

  describe("migration", () => {
    it("getSchemaVersion() returns current version after init", () => {
      const db = new GoopSpecDB(":memory:");
      expect(db.getSchemaVersion()).toBe(CURRENT_SCHEMA_VERSION);
      db.close();
    });

    it("runMigrations is idempotent", async () => {
      const db = new GoopSpecDB(":memory:");
      // Constructor already ran migrations. Re-running should not change the version.
      expect(db.getSchemaVersion()).toBe(CURRENT_SCHEMA_VERSION);

      // Manually re-run migrations via the internal DB handle
      const { runMigrations } = await import("./migrations.js");
      // biome-ignore lint/complexity/useLiteralKeys: accessing private property for test
      runMigrations(db["db"]);

      expect(db.getSchemaVersion()).toBe(CURRENT_SCHEMA_VERSION);
      db.close();
    });
  });

  // -----------------------------------------------------------------------
  // Close
  // -----------------------------------------------------------------------

  describe("close", () => {
    it("can be called multiple times without error", () => {
      const db = new GoopSpecDB(":memory:");
      db.close();
      db.close(); // second call should not throw
    });
  });
});
