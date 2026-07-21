import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { truncateWal } from "./wal.js";

describe("WAL management", () => {
  it("truncates a checkpointed WAL file", () => {
    const dir = mkdtempSync(join(tmpdir(), "goopspec-wal-test-"));
    const dbPath = join(dir, "test.db");
    const walPath = `${dbPath}-wal`;
    const db = new Database(dbPath, { create: true });

    try {
      db.run("PRAGMA journal_mode = WAL");
      db.run("PRAGMA wal_autocheckpoint = 0");
      db.run("CREATE TABLE entries (value TEXT NOT NULL)");
      const insert = db.prepare("INSERT INTO entries (value) VALUES (?)");
      db.transaction(() => {
        for (let index = 0; index < 100; index += 1) {
          insert.run("x".repeat(4096));
        }
      })();

      expect(statSync(walPath).size).toBeGreaterThan(0);
      expect(truncateWal(db)).toBe(true);
      expect(statSync(walPath).size).toBe(0);
    } finally {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
