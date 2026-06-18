/**
 * Schema migration runner for the GoopSpec unified database.
 *
 * Tracks applied migrations via the `schema_version` table and runs
 * any pending migrations in order. The initial schema (v1) is created
 * by initSchema(); this runner records that version and handles future
 * incremental migrations.
 */

import type { Database } from "bun:sqlite";

export const CURRENT_SCHEMA_VERSION = 1;

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

  // Future migrations:
  // if (current < 2) { ... db.run("ALTER TABLE ..."); db.run("INSERT OR IGNORE INTO schema_version(version) VALUES(2)"); }
}
