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

export const WAVE_STATUSES = ["pending", "in_progress", "done", "completed"] as const;
export type WaveStatus = (typeof WAVE_STATUSES)[number];

export const TASK_STATUSES = ["pending", "in_progress", "done", "completed"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const VERIFICATION_STATUSES = ["pending", "passed", "failed", "skipped"] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const BLOCKER_SEVERITIES = ["low", "medium", "high", "critical"] as const;
export type BlockerSeverity = (typeof BLOCKER_SEVERITIES)[number];

export const BLOCKER_STATUSES = ["open", "resolved"] as const;
export type BlockerStatus = (typeof BLOCKER_STATUSES)[number];

// ---------------------------------------------------------------------------
// Status normalisation
// ---------------------------------------------------------------------------

/** Unambiguous near-miss corrections for status strings (lowercased keys). */
const STATUS_NEAR_MISSES: Readonly<Record<string, string>> = {
  complete: "completed",
  "in-progress": "in_progress",
};

/** Result of {@link normalizeStatus}. */
export type NormalizeStatusResult =
  | { ok: true; status: string }
  | { ok: false; error: string };

/**
 * Normalise a status string against a set of valid values.
 *
 * Accepts exact matches (case-insensitive, trimmed) and a small set of
 * unambiguous near-misses (`complete` → `completed`, `in-progress` → `in_progress`).
 * Returns the canonical status on success, or an error message naming the
 * valid set on failure. Never throws.
 *
 * @param status - The raw status string to normalise.
 * @param valid - The set of valid status strings (e.g. `WAVE_STATUSES`).
 */
export function normalizeStatus(
  status: string,
  valid: readonly string[],
): NormalizeStatusResult {
  const trimmed = status.trim();
  const lower = trimmed.toLowerCase();

  for (const v of valid) {
    if (v === lower) {
      return { ok: true, status: v };
    }
  }

  const corrected = STATUS_NEAR_MISSES[lower];
  if (corrected !== undefined && valid.includes(corrected)) {
    return { ok: true, status: corrected };
  }

  return {
    ok: false,
    error: `Invalid status '${trimmed}'. Valid statuses: ${valid.join(", ")}.`,
  };
}

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

/** Raw row from the `waves` table. */
export interface WaveRow {
  id: number;
  workflow_id: string;
  wave_number: number;
  title: string;
  status: WaveStatus;
  pr_branch: string | null;
  pr_url: string | null;
  started_at: number | null;
  completed_at: number | null;
  created_at: number;
  updated_at: number;
}

/** Raw row from the `wave_tasks` table. */
export interface WaveTaskRow {
  id: number;
  wave_id: number;
  workflow_id: string;
  task_index: number;
  description: string;
  agent: string | null;
  status: TaskStatus;
  started_at: number | null;
  completed_at: number | null;
  created_at: number;
  updated_at: number;
}

/** Raw row from the `v_wave_progress` view. */
export interface WaveProgressRow {
  wave_id: number;
  workflow_id: string;
  wave_number: number;
  total_tasks: number;
  completed_tasks: number;
}

/** Raw row from the `v_workflow_summary` view. */
export interface WorkflowSummaryRow {
  workflow_id: string;
  total_waves: number;
  completed_waves: number;
  open_blockers: number;
  last_activity: number | null;
}

/** Raw row from the `doc_sections` table. */
export interface DocSectionRow {
  id: number;
  workflow_id: string;
  doc_type: string;
  section_key: string;
  content: string;
  position: number;
  created_at: number;
  updated_at: number;
}

/** Raw row from the `decisions` table. */
export interface DecisionRow {
  id: number;
  workflow_id: string;
  rule: number | null;
  type: string;
  description: string;
  action: string;
  files: string;
  created_at: number;
}

/** Raw row from the `verifications` table. */
export interface VerificationRow {
  id: number;
  workflow_id: string;
  wave_id: number | null;
  check_name: string;
  status: VerificationStatus;
  detail: string | null;
  created_at: number;
}

/** Raw row from the `blockers` table. */
export interface BlockerRow {
  id: number;
  workflow_id: string;
  wave_id: number | null;
  description: string;
  severity: BlockerSeverity;
  status: BlockerStatus;
  resolution: string | null;
  created_at: number;
  resolved_at: number | null;
}

/** Raw row from the `traceability` table. */
export interface TraceabilityRow {
  id: number;
  workflow_id: string;
  requirement_key: string;
  wave_number: number | null;
  task_index: number | null;
  status: TaskStatus;
  created_at: number;
  updated_at: number;
}

// ---------------------------------------------------------------------------
// Search result shapes
// ---------------------------------------------------------------------------

/** Extended field_notes row with FTS5 rank score. */
export interface FtsNoteSearchRow extends FieldNoteRow {
  rank: number;
}

/** Extended doc_sections row with FTS5 rank score. */
export interface DocSectionSearchRow extends DocSectionRow {
  rank: number;
}
