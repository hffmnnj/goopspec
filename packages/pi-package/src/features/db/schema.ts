import type { Database } from "bun:sqlite";

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
      // ignore
    }
    return false;
  }
}

function createWorkflowsTable(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS workflows (
      id         TEXT    PRIMARY KEY,
      state      TEXT    NOT NULL DEFAULT '{}',
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    )
  `);
}

function createEventsTable(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS events (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      workflow_id TEXT    NOT NULL,
      event_type  TEXT    NOT NULL,
      payload     TEXT    NOT NULL DEFAULT '{}',
      created_at  INTEGER DEFAULT (unixepoch())
    )
  `);
  db.run(
    "CREATE INDEX IF NOT EXISTS idx_events_workflow_created ON events(workflow_id, created_at)",
  );
  db.run(
    "CREATE INDEX IF NOT EXISTS idx_events_type_created ON events(event_type, created_at)",
  );
}

function createDocumentsTable(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS documents (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      workflow_id TEXT    NOT NULL,
      doc_type    TEXT    NOT NULL,
      content     TEXT    NOT NULL DEFAULT '',
      created_at  INTEGER DEFAULT (unixepoch()),
      updated_at  INTEGER DEFAULT (unixepoch()),
      UNIQUE(workflow_id, doc_type)
    )
  `);
  db.run(
    "CREATE INDEX IF NOT EXISTS idx_documents_workflow_type ON documents(workflow_id, doc_type)",
  );
}

function createFieldNotesTable(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS field_notes (
      id           TEXT    PRIMARY KEY,
      title        TEXT    NOT NULL,
      body         TEXT    NOT NULL,
      tags         TEXT    NOT NULL DEFAULT '[]',
      source_agent TEXT    NOT NULL,
      importance   INTEGER NOT NULL DEFAULT 5 CHECK(importance >= 1 AND importance <= 10),
      workflow_id  TEXT,
      project_id   TEXT,
      created_at   INTEGER DEFAULT (unixepoch())
    )
  `);
  db.run(
    "CREATE INDEX IF NOT EXISTS idx_field_notes_project_created ON field_notes(project_id, created_at)",
  );
  db.run(
    "CREATE INDEX IF NOT EXISTS idx_field_notes_workflow_created ON field_notes(workflow_id, created_at)",
  );
}

function createSchemaVersionTable(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version    INTEGER PRIMARY KEY,
      applied_at INTEGER DEFAULT (unixepoch())
    )
  `);
}

function createDocumentsFts(db: Database): void {
  const ftsExists = db
    .query("SELECT name FROM sqlite_master WHERE type='table' AND name='documents_fts'")
    .get();
  if (ftsExists) return;

  db.run(`
    CREATE VIRTUAL TABLE documents_fts USING fts5(
      doc_type, content, content='documents', content_rowid='id',
      tokenize='porter unicode61 remove_diacritics 2', prefix='2 3'
    )
  `);
  db.run("INSERT INTO documents_fts(rowid, doc_type, content) SELECT id, doc_type, content FROM documents");
  db.run(`CREATE TRIGGER IF NOT EXISTS documents_ai AFTER INSERT ON documents BEGIN
    INSERT INTO documents_fts(rowid, doc_type, content) VALUES (new.id, new.doc_type, new.content); END`);
  db.run(`CREATE TRIGGER IF NOT EXISTS documents_ad AFTER DELETE ON documents BEGIN
    INSERT INTO documents_fts(documents_fts, rowid, doc_type, content) VALUES ('delete', old.id, old.doc_type, old.content); END`);
  db.run(`CREATE TRIGGER IF NOT EXISTS documents_au AFTER UPDATE ON documents BEGIN
    INSERT INTO documents_fts(documents_fts, rowid, doc_type, content) VALUES ('delete', old.id, old.doc_type, old.content);
    INSERT INTO documents_fts(rowid, doc_type, content) VALUES (new.id, new.doc_type, new.content); END`);
}

function createFieldNotesFts(db: Database): void {
  const ftsExists = db
    .query("SELECT name FROM sqlite_master WHERE type='table' AND name='field_notes_fts'")
    .get();
  if (ftsExists) return;

  db.run(`
    CREATE VIRTUAL TABLE field_notes_fts USING fts5(
      title, body, tags, content='field_notes', content_rowid='rowid',
      tokenize='porter unicode61 remove_diacritics 2', prefix='2 3'
    )
  `);
  db.run("INSERT INTO field_notes_fts(rowid, title, body, tags) SELECT rowid, title, body, tags FROM field_notes");
  db.run(`CREATE TRIGGER IF NOT EXISTS field_notes_ai AFTER INSERT ON field_notes BEGIN
    INSERT INTO field_notes_fts(rowid, title, body, tags) VALUES (new.rowid, new.title, new.body, new.tags); END`);
  db.run(`CREATE TRIGGER IF NOT EXISTS field_notes_ad AFTER DELETE ON field_notes BEGIN
    INSERT INTO field_notes_fts(field_notes_fts, rowid, title, body, tags) VALUES ('delete', old.rowid, old.title, old.body, old.tags); END`);
  db.run(`CREATE TRIGGER IF NOT EXISTS field_notes_au AFTER UPDATE ON field_notes BEGIN
    INSERT INTO field_notes_fts(field_notes_fts, rowid, title, body, tags) VALUES ('delete', old.rowid, old.title, old.body, old.tags);
    INSERT INTO field_notes_fts(rowid, title, body, tags) VALUES (new.rowid, new.title, new.body, new.tags); END`);
}

export interface InitSchemaResult {
  fts5Enabled: boolean;
}

export function initSchema(db: Database): InitSchemaResult {
  db.run("PRAGMA journal_mode = WAL");
  db.run("PRAGMA synchronous = NORMAL");
  db.run("PRAGMA cache_size = -8000");
  db.run("PRAGMA busy_timeout = 5000");

  createWorkflowsTable(db);
  createEventsTable(db);
  createDocumentsTable(db);
  createFieldNotesTable(db);
  createSchemaVersionTable(db);

  const fts5Enabled = isFts5Available(db);
  if (fts5Enabled) {
    createDocumentsFts(db);
    createFieldNotesFts(db);
  }

  return { fts5Enabled };
}
