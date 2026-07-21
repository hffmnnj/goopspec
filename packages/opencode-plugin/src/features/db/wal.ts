import type { Database } from "bun:sqlite";

export const WAL_AUTOCHECKPOINT_PAGES = 1000;

interface WalCheckpointResult {
  busy: number;
}

export function configureWalAutocheckpoint(db: Database): void {
  db.run(`PRAGMA wal_autocheckpoint = ${WAL_AUTOCHECKPOINT_PAGES}`);
}

export function truncateWal(db: Database): boolean {
  try {
    const result = db.query<WalCheckpointResult, []>("PRAGMA wal_checkpoint(TRUNCATE)").get();
    return result?.busy === 0;
  } catch {
    return false;
  }
}
