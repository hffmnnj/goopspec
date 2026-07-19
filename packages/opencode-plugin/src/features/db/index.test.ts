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

    it("updateNote replaces a single occurrence and returns ok", () => {
      const db = new GoopSpecDB(":memory:");
      db.saveNote({ ...baseNote, body: "Hello world" });

      const result = db.updateNote(baseNote.id, { oldString: "world", newString: "universe" });
      expect(result).toEqual({ ok: true });

      const note = db.getNoteById(baseNote.id);
      expect(note?.body).toBe("Hello universe");
      db.close();
    });

    it("updateNote returns an error and leaves the body unchanged on no match", () => {
      const db = new GoopSpecDB(":memory:");
      db.saveNote({ ...baseNote, body: "Hello world" });

      const result = db.updateNote(baseNote.id, { oldString: "missing", newString: "x" });
      expect(result.ok).toBe(false);
      expect(result.error).toContain("did not appear verbatim");

      const note = db.getNoteById(baseNote.id);
      expect(note?.body).toBe("Hello world");
      db.close();
    });

    it("updateNote returns an error on multiple occurrences without replaceAll", () => {
      const db = new GoopSpecDB(":memory:");
      db.saveNote({ ...baseNote, body: "foo bar foo" });

      const result = db.updateNote(baseNote.id, { oldString: "foo", newString: "baz" });
      expect(result.ok).toBe(false);
      expect(result.error).toContain("2");
      expect(result.error).toContain("occurrences");

      const note = db.getNoteById(baseNote.id);
      expect(note?.body).toBe("foo bar foo");
      db.close();
    });

    it("updateNote replaces all occurrences when replaceAll is true", () => {
      const db = new GoopSpecDB(":memory:");
      db.saveNote({ ...baseNote, body: "foo bar foo" });

      const result = db.updateNote(baseNote.id, {
        oldString: "foo",
        newString: "baz",
        replaceAll: true,
      });
      expect(result).toEqual({ ok: true });

      const note = db.getNoteById(baseNote.id);
      expect(note?.body).toBe("baz bar baz");
      db.close();
    });

    it("updateNote returns an error for a missing id without throwing", () => {
      const db = new GoopSpecDB(":memory:");
      const result = db.updateNote("fn_missing_00000000", { oldString: "x", newString: "y" });
      expect(result.ok).toBe(false);
      expect(result.error).toContain("fn_missing_00000000");
      db.close();
    });
  });

  // -----------------------------------------------------------------------
  // Wave metadata, sections, tracking, and cross-document search
  // -----------------------------------------------------------------------

  describe("workflow structure tables", () => {
    it("upsertWave + getWave + getWaves round-trip and preserve omitted fields", () => {
      const db = new GoopSpecDB(":memory:");

      db.upsertWave("wf-1", {
        wave_number: 2,
        title: "Second wave",
        status: "in_progress",
        pr_branch: "feat/second-wave",
        started_at: 100,
      });
      db.upsertWave("wf-1", { wave_number: 1, title: "First wave" });
      db.upsertWave("wf-1", { wave_number: 2, status: "done", completed_at: 200 });

      const wave = db.getWave("wf-1", 2);
      expect(wave).not.toBeNull();
      expect(wave?.title).toBe("Second wave");
      expect(wave?.status).toBe("done");
      expect(wave?.pr_branch).toBe("feat/second-wave");
      expect(wave?.completed_at).toBe(200);
      expect(db.getWaves("wf-1").map((w) => w.wave_number)).toEqual([1, 2]);
      expect(db.getWave("wf-1", 99)).toBeNull();

      db.close();
    });

    it("upsertWaveTask + setWaveTaskStatus update task progress view", () => {
      const db = new GoopSpecDB(":memory:");
      db.upsertWave("wf-1", { wave_number: 1, title: "Wave 1" });
      const wave = db.getWave("wf-1", 1);
      expect(wave).not.toBeNull();

      db.upsertWaveTask({
        wave_id: wave?.id ?? -1,
        workflow_id: "wf-1",
        task_index: 2,
        description: "Second task",
        agent: "goop-executor-high",
      });
      db.upsertWaveTask({
        wave_id: wave?.id ?? -1,
        workflow_id: "wf-1",
        task_index: 1,
        description: "First task",
      });
      db.upsertWaveTask({
        wave_id: wave?.id ?? -1,
        workflow_id: "wf-1",
        task_index: 2,
        status: "in_progress",
      });
      db.setWaveTaskStatus(wave?.id ?? -1, 2, "completed");

      const tasks = db.getWaveTasks(wave?.id ?? -1);
      expect(tasks.map((t) => t.task_index)).toEqual([1, 2]);
      expect(tasks[1].description).toBe("Second task");
      expect(tasks[1].status).toBe("completed");

      // biome-ignore lint/complexity/useLiteralKeys: accessing private property for test
      const progress = db["db"]
        .query<{ completed_tasks: number; total_tasks: number }, []>(
          "SELECT completed_tasks, total_tasks FROM v_wave_progress WHERE wave_id = 1",
        )
        .get();
      expect(progress?.total_tasks).toBe(2);
      expect(progress?.completed_tasks).toBe(1);

      db.close();
    });

    it("getWaveProgress reads task counts from the progress view", () => {
      const db = new GoopSpecDB(":memory:");
      db.upsertWave("wf-1", { wave_number: 1, title: "Wave 1" });
      db.upsertWave("wf-1", { wave_number: 2, title: "Wave 2" });
      const wave = db.getWave("wf-1", 1);
      expect(wave).not.toBeNull();
      const waveId = wave?.id ?? -1;

      db.upsertWaveTask({
        wave_id: waveId,
        workflow_id: "wf-1",
        task_index: 1,
        status: "done",
      });
      db.upsertWaveTask({
        wave_id: waveId,
        workflow_id: "wf-1",
        task_index: 2,
        status: "pending",
      });

      const allProgress = db.getWaveProgress("wf-1");
      expect(allProgress.map((p) => p.wave_number)).toEqual([1, 2]);
      expect(allProgress[0].completed_tasks).toBe(1);
      expect(allProgress[0].total_tasks).toBe(2);

      const filteredProgress = db.getWaveProgress("wf-1", 1);
      expect(filteredProgress.length).toBe(1);
      expect(filteredProgress[0].wave_id).toBe(waveId);

      db.close();
    });

    it("getWorkflowSummaries reads workflow counts ordered by last activity", () => {
      const db = new GoopSpecDB(":memory:");
      db.upsertWave("older-wf", { wave_number: 1, status: "completed" });
      db.upsertWave("newer-wf", { wave_number: 1, status: "pending" });
      db.upsertBlocker("newer-wf", { description: "Open issue" });

      const rows = db.getWorkflowSummaries();

      expect(rows.map((row) => row.workflow_id)).toEqual(["newer-wf", "older-wf"]);
      expect(rows[0].total_waves).toBe(1);
      expect(rows[0].completed_waves).toBe(0);
      expect(rows[0].open_blockers).toBe(1);
      expect(rows[0].last_activity).toBeGreaterThanOrEqual(rows[1].last_activity ?? 0);

      db.close();
    });

    it("upsertSection + getSection + getSections + assembleDocument preserve ordering", () => {
      const db = new GoopSpecDB(":memory:");

      db.upsertSection("wf-1", "spec", "intro", "# Intro", 1);
      db.upsertSection("wf-1", "spec", "summary", "# Summary", 0);
      db.upsertSection("wf-1", "spec", "appendix", "# Appendix");
      db.upsertSection("wf-1", "spec", "intro", "# Intro Updated", 1);

      expect(db.getSection("wf-1", "spec", "intro")?.content).toBe("# Intro Updated");
      expect(db.getSections("wf-1", "spec").map((s) => s.section_key)).toEqual([
        "summary",
        "intro",
        "appendix",
      ]);
      expect(db.assembleDocument("wf-1", "spec")).toBe(
        "# Summary\n\n# Intro Updated\n\n# Appendix",
      );
      expect(db.assembleDocument("wf-1", "blueprint")).toBe("");

      db.close();
    });

    it("resolves sectioned content first and treats empty content as absent", () => {
      const db = new GoopSpecDB(":memory:");
      db.upsertDocument("wf-1", "spec", "# Monolithic");

      expect(db.resolveDocumentContent("wf-1", "spec")).toBe("# Monolithic");

      db.upsertSection("wf-1", "spec", "section", "# Section", 0);
      expect(db.resolveDocumentContent("wf-1", "spec")).toBe("# Section");

      db.upsertDocument("wf-1", "blueprint", "");
      db.upsertSection("wf-1", "chronicle", "empty", "", 0);
      expect(db.resolveDocumentContent("wf-1", "blueprint")).toBeNull();
      expect(db.resolveDocumentContent("wf-1", "chronicle")).toBeNull();

      db.close();
    });

    it("deletes one section or all sections without affecting other document types", () => {
      const db = new GoopSpecDB(":memory:");
      db.upsertSection("wf-1", "spec", "keep", "# Keep", 0);
      db.upsertSection("wf-1", "spec", "remove", "# Remove", 1);
      db.upsertSection("wf-1", "blueprint", "other", "# Other", 0);

      expect(db.deleteSection("wf-1", "spec", "remove")).toBe(true);
      expect(db.deleteSection("wf-1", "spec", "missing")).toBe(false);
      expect(db.assembleDocument("wf-1", "spec")).toBe("# Keep");

      db.deleteSections("wf-1", "spec");
      expect(db.getSections("wf-1", "spec")).toEqual([]);
      expect(db.getSections("wf-1", "blueprint")).toHaveLength(1);

      db.close();
    });

    it("searchSections uses FTS ranking and supports filters", () => {
      const db = new GoopSpecDB(":memory:");
      db.upsertSection("wf-1", "spec", "priority-needle", "ordinary content", 0);
      db.upsertSection("wf-1", "spec", "ordinary", "needle appears in content", 1);
      db.upsertSection("wf-2", "spec", "priority-needle", "other workflow", 0);

      const results = db.searchSections("needle", { workflowId: "wf-1" });
      expect(results.length).toBe(2);
      expect(results[0].section_key).toBe("priority-needle");

      const filtered = db.searchSections("needle", {
        workflowId: "wf-1",
        docType: "spec",
        sectionKey: "ordinary",
      });
      expect(filtered.length).toBe(1);
      expect(filtered[0].content).toContain("needle");

      db.close();
    });

    it("searchSections falls back to LIKE when FTS is unavailable", () => {
      const db = new GoopSpecDB(":memory:");
      Object.defineProperty(db, "fts5Enabled", { value: false });
      db.upsertSection("wf-1", "blueprint", "dispatch", "LIKE fallback needle", 0);
      db.upsertSection("wf-1", "blueprint", "other", "unrelated", 1);

      const results = db.searchSections("fallback needle", { workflowId: "wf-1" });
      expect(results.length).toBe(1);
      expect(results[0].section_key).toBe("dispatch");

      db.close();
    });

    it("decisions round-trip with filtering and JSON files", () => {
      const db = new GoopSpecDB(":memory:");

      const id = db.insertDecision("wf-1", {
        rule: 4,
        type: "decision",
        description: "Choose typed CRUD methods",
        action: "Implement methods on GoopSpecDB",
        files: ["src/features/db/index.ts"],
      });
      db.insertDecision("wf-2", {
        description: "Other workflow",
        action: "Ignore",
      });

      expect(id).toBeGreaterThan(0);
      const decisions = db.getDecisions({ workflowId: "wf-1", rule: 4, type: "decision" });
      expect(decisions.length).toBe(1);
      expect(JSON.parse(decisions[0].files)).toEqual(["src/features/db/index.ts"]);

      db.close();
    });

    it("verifications round-trip and filter by wave", () => {
      const db = new GoopSpecDB(":memory:");
      db.upsertWave("wf-1", { wave_number: 1 });
      const wave = db.getWave("wf-1", 1);

      const id = db.insertVerification("wf-1", {
        wave_id: wave?.id,
        check_name: "typecheck",
        status: "passed",
        detail: "clean",
      });
      db.insertVerification("wf-1", { check_name: "global", status: "skipped" });

      expect(id).toBeGreaterThan(0);
      const all = db.getVerifications("wf-1");
      const byWave = db.getVerifications("wf-1", wave?.id ?? -1);
      expect(all.length).toBe(2);
      expect(byWave.length).toBe(1);
      expect(byWave[0].check_name).toBe("typecheck");

      db.close();
    });

    it("blockers insert, resolve, and filter by status", () => {
      const db = new GoopSpecDB(":memory:");
      const id = db.upsertBlocker("wf-1", {
        description: "Need schema decision",
        severity: "high",
      });

      expect(id).toBeGreaterThan(0);
      expect(db.getBlockers("wf-1", "open").length).toBe(1);

      const resolvedId = db.upsertBlocker("wf-1", {
        id,
        description: "Need schema decision",
        severity: "high",
        status: "resolved",
        resolution: "Decision made",
      });
      expect(resolvedId).toBe(id);
      const resolved = db.getBlockers("wf-1", "resolved");
      expect(resolved.length).toBe(1);
      expect(resolved[0].resolution).toBe("Decision made");
      expect(resolved[0].resolved_at).toBeGreaterThan(0);

      db.close();
    });

    it("traceability upserts and orders requirement mappings", () => {
      const db = new GoopSpecDB(":memory:");

      db.upsertTraceability("wf-1", {
        requirement_key: "MH-02",
        wave_number: 1,
        task_index: 2,
        status: "pending",
      });
      db.upsertTraceability("wf-1", {
        requirement_key: "MH-01",
        wave_number: 1,
        task_index: 1,
        status: "done",
      });
      db.upsertTraceability("wf-1", {
        requirement_key: "MH-02",
        wave_number: 1,
        task_index: 2,
        status: "completed",
      });

      const rows = db.getTraceability("wf-1");
      expect(rows.map((r) => r.requirement_key)).toEqual(["MH-01", "MH-02"]);
      expect(rows[1].status).toBe("completed");

      db.close();
    });

    it("searchDocuments returns document and section hits across workflows", () => {
      const db = new GoopSpecDB(":memory:");
      db.upsertDocument("wf-1", "spec", "sharedneedle appears in a document");
      db.upsertDocument("wf-2", "blueprint", "another sharedneedle document");
      db.upsertSection("wf-1", "spec", "section-a", "section sharedneedle", 0);
      db.upsertSection("wf-2", "blueprint", "section-b", "other section sharedneedle", 0);

      const results = db.searchDocuments("sharedneedle", { limit: 10 });
      const workflows = new Set(results.map((r) => r.workflow_id));
      const sources = new Set(results.map((r) => r.source));

      expect(results.length).toBe(4);
      expect(workflows).toEqual(new Set(["wf-1", "wf-2"]));
      expect(sources).toEqual(new Set(["document", "section"]));

      const sectionOnly = db.searchDocuments("sharedneedle", { sectionKey: "section-a" });
      expect(sectionOnly.some((r) => r.source === "section" && r.section_key === "section-a")).toBe(
        true,
      );
      expect(sectionOnly.some((r) => r.source === "section" && r.section_key === "section-b")).toBe(
        false,
      );

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
