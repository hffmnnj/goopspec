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

export interface WorkflowRow {
  id: string;
  state: string;
  created_at: number;
  updated_at: number;
}

export interface EventRow {
  id: number;
  workflow_id: string;
  event_type: string;
  payload: string;
  created_at: number;
}

export interface DocumentRow {
  id: number;
  workflow_id: string;
  doc_type: string;
  content: string;
  created_at: number;
  updated_at: number;
}

export interface FieldNoteRow {
  id: string;
  title: string;
  body: string;
  tags: string;
  source_agent: string;
  importance: number;
  workflow_id: string | null;
  project_id: string | null;
  created_at: number;
}

export interface ChronicleEventRow {
  id: number;
  workflow_id: string;
  entry: string;
  created_at: number;
}

export interface FtsNoteSearchRow extends FieldNoteRow {
  rank: number;
}
