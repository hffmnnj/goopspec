import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { MemorySaveInput } from "../../core/types.js";
import { SqliteMemoryManager, createMemoryManager } from "./index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tmpDbPath(prefix: string): { dbPath: string; cleanup: () => void } {
  const dir = join(
    tmpdir(),
    `goopspec-mem-test-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  const dbPath = join(dir, "memory.db");
  return {
    dbPath,
    cleanup: () => {
      if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
    },
  };
}

const baseSaveInput: MemorySaveInput = {
  type: "observation",
  title: "Test memory",
  content: "Some test content about TypeScript patterns",
  facts: ["TypeScript is typed", "Bun is fast"],
  concepts: ["typescript", "testing"],
  importance: 7,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SqliteMemoryManager", () => {
  let mgr: SqliteMemoryManager;
  let cleanup: () => void;

  beforeEach(() => {
    const tmp = tmpDbPath("mgr");
    cleanup = () => {
      mgr.close();
      tmp.cleanup();
    };
    mgr = createMemoryManager({ dbPath: tmp.dbPath });
  });

  afterEach(() => cleanup());

  // -----------------------------------------------------------------------
  // init
  // -----------------------------------------------------------------------

  describe("initialisation", () => {
    it("creates the database file on disk", () => {
      const tmp = tmpDbPath("init");
      const m = createMemoryManager({ dbPath: tmp.dbPath });
      expect(existsSync(tmp.dbPath)).toBe(true);
      m.close();
      tmp.cleanup();
    });

    it("reports FTS5 as available (Bun ships with FTS5)", () => {
      expect(mgr.hasFts5).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // save
  // -----------------------------------------------------------------------

  describe("save", () => {
    it("returns a MemoryEntry with an auto-incremented id", async () => {
      const entry = await mgr.save(baseSaveInput);
      expect(entry.id).toBeGreaterThan(0);
      expect(entry.title).toBe(baseSaveInput.title);
      expect(entry.type).toBe("observation");
      expect(entry.importance).toBe(7);
      expect(entry.facts).toEqual(["TypeScript is typed", "Bun is fast"]);
      expect(entry.concepts).toEqual(["typescript", "testing"]);
    });

    it("defaults importance to 5 when omitted", async () => {
      const entry = await mgr.save({ ...baseSaveInput, importance: undefined });
      expect(entry.importance).toBe(5);
    });

    it("scales 0-1 importance to 1-10", async () => {
      const entry = await mgr.save({ ...baseSaveInput, importance: 0.8 });
      expect(entry.importance).toBe(8);
    });

    it("clamps importance to [1, 10]", async () => {
      const low = await mgr.save({ ...baseSaveInput, importance: -5 });
      const high = await mgr.save({ ...baseSaveInput, importance: 99 });
      expect(low.importance).toBe(1);
      expect(high.importance).toBe(10);
    });

    it("appends reasoning and alternatives to content for decision type", async () => {
      const entry = await mgr.save({
        ...baseSaveInput,
        type: "decision",
        reasoning: "Better performance",
        alternatives: ["Option A", "Option B"],
      });
      expect(entry.content).toContain("Reasoning: Better performance");
      expect(entry.content).toContain("Alternatives considered: Option A, Option B");
    });

    it("handles missing optional fields gracefully", async () => {
      const entry = await mgr.save({
        type: "note",
        title: "Minimal",
        content: "Just a note",
      });
      expect(entry.facts).toEqual([]);
      expect(entry.concepts).toEqual([]);
      expect(entry.sourceFiles).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // search (FTS5)
  // -----------------------------------------------------------------------

  describe("search (FTS5)", () => {
    it("finds entries by title match", async () => {
      await mgr.save({ ...baseSaveInput, title: "Authentication patterns" });
      await mgr.save({ ...baseSaveInput, title: "Database migrations" });

      const results = await mgr.search({ query: "Authentication" });
      expect(results.length).toBe(1);
      expect(results[0].memory.title).toBe("Authentication patterns");
      expect(results[0].matchType).toBe("fts");
    });

    it("finds entries by content match", async () => {
      await mgr.save({ ...baseSaveInput, content: "JWT tokens are used for session management" });
      await mgr.save({ ...baseSaveInput, content: "CSS grid layout techniques" });

      const results = await mgr.search({ query: "JWT tokens" });
      expect(results.length).toBe(1);
      expect(results[0].memory.content).toContain("JWT tokens");
    });

    it("finds entries by facts match", async () => {
      await mgr.save({ ...baseSaveInput, facts: ["jose library is ESM-native"] });

      const results = await mgr.search({ query: "jose library" });
      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it("finds entries by concepts match", async () => {
      await mgr.save({ ...baseSaveInput, concepts: ["authentication", "jwt"] });

      const results = await mgr.search({ query: "authentication" });
      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it("returns empty array for empty query", async () => {
      await mgr.save(baseSaveInput);
      const results = await mgr.search({ query: "   " });
      expect(results).toEqual([]);
    });

    it("respects the limit parameter", async () => {
      for (let i = 0; i < 5; i++) {
        await mgr.save({
          ...baseSaveInput,
          title: `Pattern ${i}`,
          content: `Pattern content ${i}`,
        });
      }

      const results = await mgr.search({ query: "Pattern", limit: 2 });
      expect(results.length).toBe(2);
    });

    it("ranks higher-importance entries higher", async () => {
      await mgr.save({
        ...baseSaveInput,
        title: "Low importance item",
        content: "ranking test",
        importance: 2,
      });
      await mgr.save({
        ...baseSaveInput,
        title: "High importance item",
        content: "ranking test",
        importance: 9,
      });

      const results = await mgr.search({ query: "ranking test" });
      expect(results.length).toBe(2);
      // Higher importance should rank first
      expect(results[0].memory.importance).toBeGreaterThanOrEqual(results[1].memory.importance);
    });
  });

  // -----------------------------------------------------------------------
  // search filters
  // -----------------------------------------------------------------------

  describe("search filters", () => {
    it("filters by type", async () => {
      await mgr.save({
        ...baseSaveInput,
        type: "observation",
        title: "Obs item",
        content: "filter test",
      });
      await mgr.save({
        ...baseSaveInput,
        type: "decision",
        title: "Dec item",
        content: "filter test",
      });

      const results = await mgr.search({ query: "filter test", types: ["decision"] });
      expect(results.length).toBe(1);
      expect(results[0].memory.type).toBe("decision");
    });

    it("filters by concepts", async () => {
      await mgr.save({
        ...baseSaveInput,
        concepts: ["auth"],
        title: "Auth thing",
        content: "concept filter",
      });
      await mgr.save({
        ...baseSaveInput,
        concepts: ["database"],
        title: "DB thing",
        content: "concept filter",
      });

      const results = await mgr.search({ query: "concept filter", concepts: ["auth"] });
      expect(results.length).toBe(1);
      expect(results[0].memory.concepts).toContain("auth");
    });

    it("filters by minImportance", async () => {
      await mgr.save({
        ...baseSaveInput,
        importance: 3,
        title: "Low",
        content: "importance filter",
      });
      await mgr.save({
        ...baseSaveInput,
        importance: 8,
        title: "High",
        content: "importance filter",
      });

      const results = await mgr.search({ query: "importance filter", minImportance: 5 });
      expect(results.length).toBe(1);
      expect(results[0].memory.importance).toBeGreaterThanOrEqual(5);
    });

    it("combines multiple filters", async () => {
      await mgr.save({
        ...baseSaveInput,
        type: "decision",
        importance: 9,
        concepts: ["auth"],
        content: "multi filter",
      });
      await mgr.save({
        ...baseSaveInput,
        type: "observation",
        importance: 9,
        concepts: ["auth"],
        content: "multi filter",
      });
      await mgr.save({
        ...baseSaveInput,
        type: "decision",
        importance: 2,
        concepts: ["auth"],
        content: "multi filter",
      });

      const results = await mgr.search({
        query: "multi filter",
        types: ["decision"],
        minImportance: 5,
        concepts: ["auth"],
      });
      expect(results.length).toBe(1);
      expect(results[0].memory.type).toBe("decision");
      expect(results[0].memory.importance).toBeGreaterThanOrEqual(5);
    });
  });

  // -----------------------------------------------------------------------
  // getById
  // -----------------------------------------------------------------------

  describe("getById", () => {
    it("returns the entry for a valid id", async () => {
      const saved = await mgr.save(baseSaveInput);
      const found = await mgr.getById(saved.id);
      expect(found).not.toBeNull();
      expect(found?.id).toBe(saved.id);
      expect(found?.title).toBe(saved.title);
    });

    it("returns null for a non-existent id", async () => {
      const found = await mgr.getById(99999);
      expect(found).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // forget (by id)
  // -----------------------------------------------------------------------

  describe("forget", () => {
    it("deletes an entry by id and returns true", async () => {
      const saved = await mgr.save(baseSaveInput);
      const deleted = await mgr.forget(saved.id);
      expect(deleted).toBe(true);

      const found = await mgr.getById(saved.id);
      expect(found).toBeNull();
    });

    it("returns false for a non-existent id", async () => {
      const deleted = await mgr.forget(99999);
      expect(deleted).toBe(false);
    });

    it("removes the entry from FTS index (no stale search results)", async () => {
      const saved = await mgr.save({ ...baseSaveInput, title: "Unique deletable entry" });
      await mgr.forget(saved.id);

      const results = await mgr.search({ query: "Unique deletable entry" });
      expect(results.length).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // forgetByQuery
  // -----------------------------------------------------------------------

  describe("forgetByQuery", () => {
    it("deletes entries matching the query and returns count", async () => {
      await mgr.save({
        ...baseSaveInput,
        title: "Xylophone zephyr alpha",
        content: "xylophone zephyr deletable",
      });
      await mgr.save({
        ...baseSaveInput,
        title: "Xylophone zephyr beta",
        content: "xylophone zephyr deletable",
      });
      await mgr.save({
        ...baseSaveInput,
        title: "Quasar keeper",
        content: "quasar keeper permanent",
      });

      const count = await mgr.forgetByQuery("xylophone zephyr deletable");
      expect(count).toBe(2);

      const remaining = await mgr.search({ query: "quasar keeper permanent" });
      expect(remaining.length).toBe(1);
    });

    it("returns 0 for empty query", async () => {
      const count = await mgr.forgetByQuery("   ");
      expect(count).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // save + search round-trip
  // -----------------------------------------------------------------------

  describe("round-trip", () => {
    it("saves and retrieves multiple entries correctly", async () => {
      const inputs: MemorySaveInput[] = [
        {
          type: "observation",
          title: "React hooks pattern",
          content: "useEffect cleanup",
          importance: 6,
        },
        {
          type: "decision",
          title: "Chose Vitest",
          content: "Better Bun integration",
          importance: 8,
        },
        { type: "note", title: "Quick note", content: "Remember to update docs", importance: 4 },
      ];

      for (const input of inputs) {
        await mgr.save(input);
      }

      const all = await mgr.search({ query: "pattern OR integration OR docs", limit: 10 });
      expect(all.length).toBeGreaterThanOrEqual(2);
    });
  });

  // -----------------------------------------------------------------------
  // graceful degradation
  // -----------------------------------------------------------------------

  describe("graceful degradation", () => {
    it("search never throws on bad input", async () => {
      const results = await mgr.search({ query: '"""***(((' });
      expect(Array.isArray(results)).toBe(true);
    });

    it("forget never throws on bad id", async () => {
      const result = await mgr.forget(-1);
      expect(result).toBe(false);
    });

    it("getById never throws on bad id", async () => {
      const result = await mgr.getById(-1);
      expect(result).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // close
  // -----------------------------------------------------------------------

  describe("close", () => {
    it("can be called multiple times without error", () => {
      const tmp = tmpDbPath("close");
      const m = createMemoryManager({ dbPath: tmp.dbPath });
      m.close();
      m.close(); // second call should not throw
      tmp.cleanup();
    });
  });

  // -----------------------------------------------------------------------
  // factory
  // -----------------------------------------------------------------------

  describe("createMemoryManager factory", () => {
    it("returns a SqliteMemoryManager instance", () => {
      const tmp = tmpDbPath("factory");
      const m = createMemoryManager({ dbPath: tmp.dbPath });
      expect(m).toBeInstanceOf(SqliteMemoryManager);
      m.close();
      tmp.cleanup();
    });
  });
});
