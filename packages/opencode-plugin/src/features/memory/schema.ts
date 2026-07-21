/**
 * SQLite schema initialisation for the in-process memory system.
 *
 * Creates the `memories` table, FTS5 virtual table with sync triggers,
 * and indexes. Falls back to LIKE-based search when FTS5 is unavailable.
 */

import type { Database } from "bun:sqlite";

import { configureWalAutocheckpoint } from "../db/wal.js";

// ---------------------------------------------------------------------------
// FTS5 availability detection
// ---------------------------------------------------------------------------

/**
 * Probe whether the current SQLite build includes FTS5.
 *
 * We attempt to create a throwaway FTS5 table inside a transaction that
 * is always rolled back. If the statement fails, FTS5 is not available.
 */
export function isFts5Available(db: Database): boolean {
  try {
    db.run("SAVEPOINT fts5_probe");
    db.run("CREATE VIRTUAL TABLE _fts5_probe USING fts5(x)");
    db.run("DROP TABLE _fts5_probe");
    db.run("RELEASE fts5_probe");
    return true;
  } catch {
    try {
      db.run("ROLLBACK TO fts5_probe");
      db.run("RELEASE fts5_probe");
    } catch {
      // Savepoint may already be released on error — safe to ignore.
    }
    return false;
  }
}

// ---------------------------------------------------------------------------
// Schema initialisation
// ---------------------------------------------------------------------------

/**
 * Create the core `memories` table and associated indexes.
 */
function createMemoriesTable(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS memories (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      type        TEXT    NOT NULL DEFAULT 'observation',
      title       TEXT    NOT NULL,
      content     TEXT    NOT NULL,
      facts       TEXT    DEFAULT '[]',
      concepts    TEXT    DEFAULT '[]',
      source_files TEXT   DEFAULT '[]',
      importance  INTEGER DEFAULT 5 CHECK (importance >= 1 AND importance <= 10),
      created_at  INTEGER DEFAULT (unixepoch())
    )
  `);

  db.run("CREATE INDEX IF NOT EXISTS idx_memories_type       ON memories(type)");
  db.run("CREATE INDEX IF NOT EXISTS idx_memories_importance  ON memories(importance)");
  db.run("CREATE INDEX IF NOT EXISTS idx_memories_created     ON memories(created_at)");
}

/**
 * Create the FTS5 virtual table and keep-in-sync triggers.
 *
 * Uses an external-content table (`content='memories'`) so the FTS index
 * mirrors the main table without duplicating storage.
 */
function createFtsIndex(db: Database): void {
  const ftsExists = db
    .query("SELECT name FROM sqlite_master WHERE type='table' AND name='memories_fts'")
    .get();

  if (ftsExists) return;

  db.run(`
    CREATE VIRTUAL TABLE memories_fts USING fts5(
      title,
      content,
      facts,
      concepts,
      content='memories',
      content_rowid='id',
      tokenize='porter unicode61 remove_diacritics 2',
      prefix='2 3'
    )
  `);

  // Backfill existing rows (idempotent — table may be empty).
  db.run(`
    INSERT INTO memories_fts(rowid, title, content, facts, concepts)
    SELECT id, title, content, facts, concepts FROM memories
  `);

  // Triggers keep the FTS index synchronised with the content table.
  db.run(`
    CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
      INSERT INTO memories_fts(rowid, title, content, facts, concepts)
      VALUES (new.id, new.title, new.content, new.facts, new.concepts);
    END
  `);

  db.run(`
    CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
      INSERT INTO memories_fts(memories_fts, rowid, title, content, facts, concepts)
      VALUES ('delete', old.id, old.title, old.content, old.facts, old.concepts);
    END
  `);

  db.run(`
    CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
      INSERT INTO memories_fts(memories_fts, rowid, title, content, facts, concepts)
      VALUES ('delete', old.id, old.title, old.content, old.facts, old.concepts);
      INSERT INTO memories_fts(rowid, title, content, facts, concepts)
      VALUES (new.id, new.title, new.content, new.facts, new.concepts);
    END
  `);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface InitSchemaResult {
  fts5Enabled: boolean;
}

/**
 * Initialise the memory database: pragmas, tables, indexes, and (if
 * available) the FTS5 virtual table.
 *
 * Returns whether FTS5 was successfully enabled so the manager can
 * choose the appropriate search strategy.
 */
export function initSchema(db: Database): InitSchemaResult {
  // Performance pragmas
  db.run("PRAGMA journal_mode = WAL");
  db.run("PRAGMA synchronous = NORMAL");
  db.run("PRAGMA cache_size = -8000"); // 8 MB
  db.run("PRAGMA busy_timeout = 3000");
  configureWalAutocheckpoint(db);

  createMemoriesTable(db);

  const fts5Enabled = isFts5Available(db);
  if (fts5Enabled) {
    createFtsIndex(db);
  }

  return { fts5Enabled };
}
