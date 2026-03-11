import type { Database } from "bun:sqlite";
import {
  CREATE_PROJECTS,
  CREATE_WORK_ITEMS,
  CREATE_WORK_ITEMS_PROJECT_IDX,
  CREATE_WORK_ITEMS_STATUS_IDX,
  CREATE_WORKFLOW_SESSIONS,
  CREATE_WORKFLOW_EVENTS,
  CREATE_WORKFLOW_EVENTS_SESSION_IDX,
} from "./schema.js";

export function runMigrations(db: Database): void {
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");

  db.transaction(() => {
    db.exec(CREATE_PROJECTS);
    db.exec(CREATE_WORK_ITEMS);
    db.exec(CREATE_WORK_ITEMS_PROJECT_IDX);
    db.exec(CREATE_WORK_ITEMS_STATUS_IDX);
    db.exec(CREATE_WORKFLOW_SESSIONS);
    db.exec(CREATE_WORKFLOW_EVENTS);
    db.exec(CREATE_WORKFLOW_EVENTS_SESSION_IDX);
  })();
}
