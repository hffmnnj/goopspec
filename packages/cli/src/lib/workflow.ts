import { existsSync } from "node:fs";
import { join } from "node:path";
import { Database } from "bun:sqlite";

export interface WorkflowState {
  workflowId: string | null;
  phase: string | null;
}

const GOOPSPEC_DIR = ".goopspec";
const DB_FILENAME = "goopspec.db";

interface WorkflowRow {
  id: string;
  state: string;
}

interface ParsedWorkflowState {
  phase?: string | null;
  currentPhase?: string | null;
}

export async function getActiveWorkflow(): Promise<WorkflowState> {
  const dbPath = join(process.cwd(), GOOPSPEC_DIR, DB_FILENAME);
  if (!existsSync(dbPath)) {
    return { workflowId: null, phase: null };
  }

  let db: Database | null = null;
  try {
    db = new Database(dbPath, { readonly: true });
    const row = db
      .query<WorkflowRow, []>("SELECT id, state FROM workflows ORDER BY updated_at DESC LIMIT 1")
      .get();

    if (!row) return { workflowId: null, phase: null };

    const parsed = JSON.parse(row.state) as ParsedWorkflowState;
    const phase = parsed.phase ?? parsed.currentPhase ?? null;
    return { workflowId: row.id, phase };
  } catch {
    return { workflowId: null, phase: null };
  } finally {
    db?.close();
  }
}
