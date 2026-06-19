/**
 * Type definitions for the GoopSpec unified SQLite database.
 *
 * Row interfaces use snake_case to match SQLite column conventions.
 * The GoopSpecDB class converts these at the boundary where needed.
 */

// ---------------------------------------------------------------------------
// Document type enumeration
// ---------------------------------------------------------------------------

export const DOC_TYPES = [
  "spec",
  "blueprint",
  "chronicle",
  "adl",
  "handoff",
  "requirements",
  "research",
] as const;

export type DocType = (typeof DOC_TYPES)[number];

// ---------------------------------------------------------------------------
// Database row shapes
// ---------------------------------------------------------------------------

/** Raw row from the `workflows` table. */
export interface WorkflowRow {
  id: string;
  state: string; // JSON blob
  created_at: number;
  updated_at: number;
}

/** Raw row from the `events` table. */
export interface EventRow {
  id: number;
  workflow_id: string;
  event_type: string;
  payload: string; // JSON
  created_at: number;
}

/** Raw row from the `documents` table. */
export interface DocumentRow {
  id: number;
  workflow_id: string;
  doc_type: string;
  content: string;
  created_at: number;
  updated_at: number;
}

/** Raw row from the `field_notes` table. */
export interface FieldNoteRow {
  id: string; // fn_YYYYMMDD_random8
  title: string;
  body: string;
  tags: string; // JSON array
  source_agent: string;
  importance: number; // 1-10
  workflow_id: string | null;
  project_id: string | null;
  created_at: number;
}

/** Raw row from the `chronicle_events` table. */
export interface ChronicleEventRow {
  id: number;
  workflow_id: string;
  entry: string;
  created_at: number;
}

// ---------------------------------------------------------------------------
// Search result shapes
// ---------------------------------------------------------------------------

/** Extended field_notes row with FTS5 rank score. */
export interface FtsNoteSearchRow extends FieldNoteRow {
  rank: number;
}
