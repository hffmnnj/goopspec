export { closeDatabase, createTestDatabase, getDatabase } from "./connection.js";
export { runMigrations } from "./migrations.js";
export {
  CREATE_AUTH,
  CREATE_PROJECTS,
  CREATE_WORK_ITEMS,
  CREATE_WORK_ITEMS_PROJECT_IDX,
  CREATE_WORK_ITEMS_STATUS_IDX,
  CREATE_WORKFLOW_SESSIONS,
  CREATE_WORKFLOW_EVENTS,
  CREATE_WORKFLOW_EVENTS_SESSION_IDX,
  SCHEMA_STATEMENTS,
} from "./schema.js";
