import type { Database } from "bun:sqlite";

export const CURRENT_SCHEMA_VERSION = 2;

interface VersionRow {
  v: number | null;
}

export function runMigrations(db: Database): void {
  const row = db.query<VersionRow, []>("SELECT MAX(version) as v FROM schema_version").get();
  const current = row?.v ?? 0;

  if (current < 1) {
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
}
