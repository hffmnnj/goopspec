import { Database } from "bun:sqlite";
import { runMigrations } from "./migrations.js";

let db: Database | null = null;

export function getDatabase(dbPath: string): Database {
  if (!db) {
    db = new Database(dbPath, { create: true });
    runMigrations(db);
  }

  return db;
}

export function closeDatabase(): void {
  if (!db) {
    return;
  }

  db.close();
  db = null;
}

export function createTestDatabase(): Database {
  const testDb = new Database(":memory:");
  runMigrations(testDb);
  return testDb;
}
