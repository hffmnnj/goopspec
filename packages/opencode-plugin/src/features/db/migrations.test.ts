import { describe, expect, it } from "bun:test";

import { GoopSpecDB } from "./index.js";
import { CURRENT_SCHEMA_VERSION, runMigrations } from "./migrations.js";

// ---------------------------------------------------------------------------
// All tests use in-memory SQLite — no temp files needed.
// ---------------------------------------------------------------------------

describe("migrations v2", () => {
  // -----------------------------------------------------------------------
  // chronicle_events table schema
  // -----------------------------------------------------------------------

  describe("chronicle_events table", () => {
    it("fresh DB has chronicle_events table with correct columns", () => {
      const db = new GoopSpecDB(":memory:");

      // biome-ignore lint/complexity/useLiteralKeys: accessing private property for test
      const tableRow = db["db"]
        .query<{ name: string }, []>(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='chronicle_events'",
        )
        .get();
      expect(tableRow).not.toBeNull();
      expect(tableRow?.name).toBe("chronicle_events");

      // Verify all expected columns exist
      // biome-ignore lint/complexity/useLiteralKeys: accessing private property for test
      const columns = db["db"]
        .query<{ name: string }, []>("PRAGMA table_info(chronicle_events)")
        .all()
        .map((r) => r.name);

      expect(columns).toContain("id");
      expect(columns).toContain("workflow_id");
      expect(columns).toContain("entry");
      expect(columns).toContain("created_at");

      db.close();
    });

    it("schema_version table contains CURRENT_SCHEMA_VERSION", () => {
      const db = new GoopSpecDB(":memory:");

      const version = db.getSchemaVersion();
      expect(version).toBe(CURRENT_SCHEMA_VERSION);

      db.close();
    });

    it("idx_chronicle_events_workflow index exists on chronicle_events", () => {
      const db = new GoopSpecDB(":memory:");

      // biome-ignore lint/complexity/useLiteralKeys: accessing private property for test
      const indexRow = db["db"]
        .query<{ name: string }, []>(
          "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_chronicle_events_workflow'",
        )
        .get();
      expect(indexRow).not.toBeNull();
      expect(indexRow?.name).toBe("idx_chronicle_events_workflow");

      db.close();
    });

    it("re-running migrations on already-migrated DB is idempotent", () => {
      const db = new GoopSpecDB(":memory:");

      // Constructor already ran migrations — version should be CURRENT_SCHEMA_VERSION
      expect(db.getSchemaVersion()).toBe(CURRENT_SCHEMA_VERSION);

      // Re-run migrations manually — should not throw or change version
      // biome-ignore lint/complexity/useLiteralKeys: accessing private property for test
      expect(() => runMigrations(db["db"])).not.toThrow();
      expect(db.getSchemaVersion()).toBe(CURRENT_SCHEMA_VERSION);

      db.close();
    });
  });

  // -----------------------------------------------------------------------
  // appendChronicleEvent / getChronicleEvents
  // -----------------------------------------------------------------------

  describe("appendChronicleEvent", () => {
    it("inserts a row and returns a positive id", () => {
      const db = new GoopSpecDB(":memory:");

      const id = db.appendChronicleEvent("wf-1", "Wave 1 complete");
      expect(id).toBeGreaterThan(0);

      db.close();
    });

    it("inserted row is retrievable with correct fields", () => {
      const db = new GoopSpecDB(":memory:");

      db.appendChronicleEvent("wf-1", "Task T1.1 done");
      const events = db.getChronicleEvents("wf-1");

      expect(events.length).toBe(1);
      expect(events[0].workflow_id).toBe("wf-1");
      expect(events[0].entry).toBe("Task T1.1 done");
      expect(events[0].id).toBeGreaterThan(0);
      expect(events[0].created_at).toBeGreaterThan(0);

      db.close();
    });
  });

  describe("getChronicleEvents", () => {
    it("returns rows ordered by created_at ASC", () => {
      const db = new GoopSpecDB(":memory:");

      db.appendChronicleEvent("wf-1", "first entry");
      db.appendChronicleEvent("wf-1", "second entry");
      db.appendChronicleEvent("wf-1", "third entry");

      const events = db.getChronicleEvents("wf-1");
      expect(events.length).toBe(3);

      // IDs should be ascending (proxy for created_at order in same-second inserts)
      expect(events[0].id).toBeLessThan(events[1].id);
      expect(events[1].id).toBeLessThan(events[2].id);

      // Entries should be in insertion order
      expect(events[0].entry).toBe("first entry");
      expect(events[1].entry).toBe("second entry");
      expect(events[2].entry).toBe("third entry");

      db.close();
    });

    it("returns only events for the specified workflow_id", () => {
      const db = new GoopSpecDB(":memory:");

      db.appendChronicleEvent("wf-a", "entry for wf-a");
      db.appendChronicleEvent("wf-b", "entry for wf-b");
      db.appendChronicleEvent("wf-a", "second entry for wf-a");

      const eventsA = db.getChronicleEvents("wf-a");
      expect(eventsA.length).toBe(2);
      expect(eventsA.every((e) => e.workflow_id === "wf-a")).toBe(true);

      const eventsB = db.getChronicleEvents("wf-b");
      expect(eventsB.length).toBe(1);
      expect(eventsB[0].entry).toBe("entry for wf-b");

      db.close();
    });

    it("returns empty array for workflow with no events", () => {
      const db = new GoopSpecDB(":memory:");

      const events = db.getChronicleEvents("wf-nonexistent");
      expect(events).toEqual([]);

      db.close();
    });
  });
});

describe("migrations v3-v6", () => {
  function getObjectName(db: GoopSpecDB, type: string, name: string): string | null {
    // biome-ignore lint/complexity/useLiteralKeys: accessing private property for test
    const row = db["db"]
      .query<{ name: string }, [string, string]>(
        "SELECT name FROM sqlite_master WHERE type = ? AND name = ?",
      )
      .get(type, name);
    return row?.name ?? null;
  }

  it("sets CURRENT_SCHEMA_VERSION to 6", () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(6);
  });

  it("fresh DB has new relational foundation tables", () => {
    const db = new GoopSpecDB(":memory:");

    expect(getObjectName(db, "table", "waves")).toBe("waves");
    expect(getObjectName(db, "table", "wave_tasks")).toBe("wave_tasks");
    expect(getObjectName(db, "table", "doc_sections")).toBe("doc_sections");
    expect(getObjectName(db, "table", "doc_sections_fts")).toBe("doc_sections_fts");
    expect(getObjectName(db, "table", "decisions")).toBe("decisions");
    expect(getObjectName(db, "table", "verifications")).toBe("verifications");
    expect(getObjectName(db, "table", "blockers")).toBe("blockers");
    expect(getObjectName(db, "table", "traceability")).toBe("traceability");

    db.close();
  });

  it("fresh DB has new SQL views", () => {
    const db = new GoopSpecDB(":memory:");

    expect(getObjectName(db, "view", "v_workflow_summary")).toBe("v_workflow_summary");
    expect(getObjectName(db, "view", "v_wave_progress")).toBe("v_wave_progress");

    db.close();
  });

  it("fresh DB has doc_sections FTS sync triggers", () => {
    const db = new GoopSpecDB(":memory:");

    expect(getObjectName(db, "trigger", "doc_sections_ai")).toBe("doc_sections_ai");
    expect(getObjectName(db, "trigger", "doc_sections_ad")).toBe("doc_sections_ad");
    expect(getObjectName(db, "trigger", "doc_sections_au")).toBe("doc_sections_au");

    db.close();
  });

  it("re-running migrations on already-migrated DB remains a no-op", () => {
    const db = new GoopSpecDB(":memory:");

    expect(db.getSchemaVersion()).toBe(6);

    // biome-ignore lint/complexity/useLiteralKeys: accessing private property for test
    expect(() => runMigrations(db["db"])).not.toThrow();
    expect(db.getSchemaVersion()).toBe(6);

    db.close();
  });
});
