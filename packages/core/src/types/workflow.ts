export const WORKFLOW_PHASES = ["idle", "discuss", "plan", "execute", "accept", "complete"] as const;
export type WorkflowPhase = (typeof WORKFLOW_PHASES)[number];

export const WORKFLOW_STATUSES = ["pending", "running", "paused", "completed", "failed", "cancelled"] as const;
export type WorkflowStatus = (typeof WORKFLOW_STATUSES)[number];

export interface WorkflowSession {
  id: string;
  projectId: string;
  workItemId?: string;
  workflowId: string;
  phase: WorkflowPhase;
  currentWave: number;
  totalWaves: number;
  status: WorkflowStatus;
  activeAgent?: string;
  blockerDescription?: string;
  startedAt: string;
  completedAt?: string;
  updatedAt: string;
}

export interface WorkflowEvent {
  id: string;
  sessionId: string;
  type: string;
  data: Record<string, unknown>;
  timestamp: string;
}
