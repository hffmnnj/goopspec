export const CREATE_PROJECTS = `
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    path TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`;

export const CREATE_WORK_ITEMS = `
  CREATE TABLE IF NOT EXISTS work_items (
    id TEXT PRIMARY KEY NOT NULL,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'todo' CHECK(status IN ('todo','in-progress','done','cancelled')),
    priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('low','medium','high','critical')),
    tags TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`;

export const CREATE_WORK_ITEMS_PROJECT_IDX = `
  CREATE INDEX IF NOT EXISTS idx_work_items_project_id ON work_items(project_id)
`;

export const CREATE_WORK_ITEMS_STATUS_IDX = `
  CREATE INDEX IF NOT EXISTS idx_work_items_status ON work_items(status)
`;

export const CREATE_WORKFLOW_SESSIONS = `
  CREATE TABLE IF NOT EXISTS workflow_sessions (
    id TEXT PRIMARY KEY NOT NULL,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    work_item_id TEXT REFERENCES work_items(id) ON DELETE SET NULL,
    workflow_id TEXT NOT NULL,
    phase TEXT NOT NULL DEFAULT 'idle',
    current_wave INTEGER NOT NULL DEFAULT 0,
    total_waves INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','running','paused','completed','failed','cancelled')),
    active_agent TEXT,
    blocker_description TEXT,
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`;

export const CREATE_WORKFLOW_EVENTS = `
  CREATE TABLE IF NOT EXISTS workflow_events (
    id TEXT PRIMARY KEY NOT NULL,
    session_id TEXT NOT NULL REFERENCES workflow_sessions(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    data TEXT NOT NULL DEFAULT '{}',
    timestamp TEXT NOT NULL DEFAULT (datetime('now'))
  )
`;

export const CREATE_WORKFLOW_EVENTS_SESSION_IDX = `
  CREATE INDEX IF NOT EXISTS idx_workflow_events_session ON workflow_events(session_id, timestamp)
`;

export const CREATE_AUTH = `
  CREATE TABLE IF NOT EXISTS auth (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    password_hash TEXT,
    jwt_secret TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`;

export const SCHEMA_STATEMENTS = [
  CREATE_PROJECTS,
  CREATE_WORK_ITEMS,
  CREATE_WORK_ITEMS_PROJECT_IDX,
  CREATE_WORK_ITEMS_STATUS_IDX,
  CREATE_WORKFLOW_SESSIONS,
  CREATE_WORKFLOW_EVENTS,
  CREATE_WORKFLOW_EVENTS_SESSION_IDX,
  CREATE_AUTH,
] as const;
