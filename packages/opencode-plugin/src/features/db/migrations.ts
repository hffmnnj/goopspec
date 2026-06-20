/**
 * Schema migration runner for the GoopSpec unified database.
 *
 * Tracks applied migrations via the `schema_version` table and runs
 * any pending migrations in order. The initial schema (v1) is created
 * by initSchema(); this runner records that version and handles future
 * incremental migrations.
 */

import type { Database } from "bun:sqlite";

import { isFts5Available } from "./schema.js";

export const CURRENT_SCHEMA_VERSION = 6;

interface VersionRow {
  v: number | null;
}

export function runMigrations(db: Database): void {
  const row = db.query<VersionRow, []>("SELECT MAX(version) as v FROM schema_version").get();
  const current = row?.v ?? 0;

  if (current < 1) {
    // v1: initial schema already applied by initSchema()
    db.run("INSERT OR IGNORE INTO schema_version(version) VALUES(1)");
  }

  if (current < 2) {
    db.run(`
      CREATE TABLE IF NOT EXISTS chronicle_events (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        workflow_id TEXT    NOT NULL,
        entry       TEXT    NOT NULL,
        created_at  INTEGER DEFAULT (unixepoch())
      )
    `);
    db.run(
      "CREATE INDEX IF NOT EXISTS idx_chronicle_events_workflow ON chronicle_events(workflow_id)",
    );
    db.run("INSERT OR IGNORE INTO schema_version(version) VALUES(2)");
  }

  if (current < 3) {
    db.run(`
      CREATE TABLE IF NOT EXISTS waves (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        workflow_id TEXT    NOT NULL,
        wave_number INTEGER NOT NULL,
        title       TEXT    NOT NULL DEFAULT '',
        status      TEXT    NOT NULL DEFAULT 'pending',
        pr_branch   TEXT,
        pr_url      TEXT,
        started_at  INTEGER,
        completed_at INTEGER,
        created_at  INTEGER DEFAULT (unixepoch()),
        updated_at  INTEGER DEFAULT (unixepoch()),
        UNIQUE(workflow_id, wave_number)
      )
    `);
    db.run("CREATE INDEX IF NOT EXISTS idx_waves_workflow ON waves(workflow_id)");
    db.run("INSERT OR IGNORE INTO schema_version(version) VALUES(3)");
  }

  if (current < 4) {
    db.run(`
      CREATE TABLE IF NOT EXISTS wave_tasks (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        wave_id     INTEGER NOT NULL,
        workflow_id TEXT    NOT NULL,
        task_index  INTEGER NOT NULL,
        description TEXT    NOT NULL DEFAULT '',
        agent       TEXT,
        status      TEXT    NOT NULL DEFAULT 'pending',
        started_at  INTEGER,
        completed_at INTEGER,
        created_at  INTEGER DEFAULT (unixepoch()),
        updated_at  INTEGER DEFAULT (unixepoch()),
        UNIQUE(wave_id, task_index)
      )
    `);
    db.run("CREATE INDEX IF NOT EXISTS idx_wave_tasks_workflow ON wave_tasks(workflow_id)");

    db.run(`
      CREATE TABLE IF NOT EXISTS doc_sections (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        workflow_id TEXT    NOT NULL,
        doc_type    TEXT    NOT NULL,
        section_key TEXT    NOT NULL,
        content     TEXT    NOT NULL DEFAULT '',
        position    INTEGER NOT NULL DEFAULT 0,
        created_at  INTEGER DEFAULT (unixepoch()),
        updated_at  INTEGER DEFAULT (unixepoch()),
        UNIQUE(workflow_id, doc_type, section_key)
      )
    `);
    db.run(
      "CREATE INDEX IF NOT EXISTS idx_doc_sections_workflow_type ON doc_sections(workflow_id, doc_type)",
    );

    if (isFts5Available(db)) {
      const ftsExists = db
        .query("SELECT name FROM sqlite_master WHERE type='table' AND name='doc_sections_fts'")
        .get();

      if (!ftsExists) {
        db.run(`
          CREATE VIRTUAL TABLE doc_sections_fts USING fts5(
            section_key,
            content,
            content='doc_sections',
            content_rowid='id',
            tokenize='porter unicode61 remove_diacritics 2',
            prefix='2 3'
          )
        `);

        db.run(`
          INSERT INTO doc_sections_fts(rowid, section_key, content)
          SELECT id, section_key, content FROM doc_sections
        `);
      }

      db.run(`
        CREATE TRIGGER IF NOT EXISTS doc_sections_ai AFTER INSERT ON doc_sections BEGIN
          INSERT INTO doc_sections_fts(rowid, section_key, content)
          VALUES (new.id, new.section_key, new.content);
        END
      `);

      db.run(`
        CREATE TRIGGER IF NOT EXISTS doc_sections_ad AFTER DELETE ON doc_sections BEGIN
          INSERT INTO doc_sections_fts(doc_sections_fts, rowid, section_key, content)
          VALUES ('delete', old.id, old.section_key, old.content);
        END
      `);

      db.run(`
        CREATE TRIGGER IF NOT EXISTS doc_sections_au AFTER UPDATE ON doc_sections BEGIN
          INSERT INTO doc_sections_fts(doc_sections_fts, rowid, section_key, content)
          VALUES ('delete', old.id, old.section_key, old.content);
          INSERT INTO doc_sections_fts(rowid, section_key, content)
          VALUES (new.id, new.section_key, new.content);
        END
      `);
    }

    db.run("INSERT OR IGNORE INTO schema_version(version) VALUES(4)");
  }

  if (current < 5) {
    db.run(`
      CREATE TABLE IF NOT EXISTS decisions (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        workflow_id TEXT    NOT NULL,
        rule        INTEGER,
        type        TEXT    NOT NULL DEFAULT 'decision',
        description TEXT    NOT NULL DEFAULT '',
        action      TEXT    NOT NULL DEFAULT '',
        files       TEXT    NOT NULL DEFAULT '[]',
        created_at  INTEGER DEFAULT (unixepoch())
      )
    `);
    db.run("CREATE INDEX IF NOT EXISTS idx_decisions_workflow ON decisions(workflow_id)");

    db.run(`
      CREATE TABLE IF NOT EXISTS verifications (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        workflow_id TEXT    NOT NULL,
        wave_id     INTEGER,
        check_name  TEXT    NOT NULL,
        status      TEXT    NOT NULL,
        detail      TEXT,
        created_at  INTEGER DEFAULT (unixepoch())
      )
    `);
    db.run(
      "CREATE INDEX IF NOT EXISTS idx_verifications_workflow_wave ON verifications(workflow_id, wave_id)",
    );

    db.run(`
      CREATE TABLE IF NOT EXISTS blockers (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        workflow_id TEXT    NOT NULL,
        wave_id     INTEGER,
        description TEXT    NOT NULL DEFAULT '',
        severity    TEXT    NOT NULL DEFAULT 'medium',
        status      TEXT    NOT NULL DEFAULT 'open',
        resolution  TEXT,
        created_at  INTEGER DEFAULT (unixepoch()),
        resolved_at INTEGER
      )
    `);
    db.run(
      "CREATE INDEX IF NOT EXISTS idx_blockers_workflow_status ON blockers(workflow_id, status)",
    );

    db.run(`
      CREATE TABLE IF NOT EXISTS traceability (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        workflow_id     TEXT    NOT NULL,
        requirement_key TEXT    NOT NULL,
        wave_number     INTEGER,
        task_index      INTEGER,
        status          TEXT    NOT NULL DEFAULT 'pending',
        created_at      INTEGER DEFAULT (unixepoch()),
        updated_at      INTEGER DEFAULT (unixepoch()),
        UNIQUE(workflow_id, requirement_key, wave_number, task_index)
      )
    `);
    db.run("CREATE INDEX IF NOT EXISTS idx_traceability_workflow ON traceability(workflow_id)");
    db.run("INSERT OR IGNORE INTO schema_version(version) VALUES(5)");
  }

  if (current < 6) {
    db.run(`
      CREATE VIEW IF NOT EXISTS v_workflow_summary AS
      SELECT
        wf.workflow_id AS workflow_id,
        COUNT(DISTINCT w.id) AS total_waves,
        COUNT(DISTINCT CASE WHEN w.status IN ('done', 'completed') THEN w.id END) AS completed_waves,
        COUNT(DISTINCT CASE WHEN b.status = 'open' THEN b.id END) AS open_blockers,
        MAX(MAX(w.updated_at), COALESCE(MAX(b.created_at), MAX(w.updated_at))) AS last_activity
      FROM (
        SELECT workflow_id FROM waves
        UNION
        SELECT workflow_id FROM blockers
      ) wf
      LEFT JOIN waves w ON w.workflow_id = wf.workflow_id
      LEFT JOIN blockers b ON b.workflow_id = wf.workflow_id
      GROUP BY wf.workflow_id
    `);

    db.run(`
      CREATE VIEW IF NOT EXISTS v_wave_progress AS
      SELECT
        w.id AS wave_id,
        w.workflow_id AS workflow_id,
        w.wave_number AS wave_number,
        COUNT(t.id) AS total_tasks,
        COUNT(CASE WHEN t.status IN ('done', 'completed') THEN 1 END) AS completed_tasks
      FROM waves w
      LEFT JOIN wave_tasks t ON t.wave_id = w.id
      GROUP BY w.id, w.workflow_id, w.wave_number
    `);

    db.run("INSERT OR IGNORE INTO schema_version(version) VALUES(6)");
  }
}
