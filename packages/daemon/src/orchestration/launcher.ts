import type { WorkflowPhase, WorkflowSession, WorkflowStatus } from "@goopspec/core";

export interface LaunchOptions {
  projectPath: string;
  workItemId?: string;
  workflowId?: string;
  prompt?: string;
  model?: string;
}

export interface LaunchResult {
  sessionId: string;
  pid?: number;
  status: "started" | "failed";
  error?: string;
  phase?: WorkflowPhase;
  workflowStatus?: WorkflowStatus;
  session?: Pick<WorkflowSession, "id" | "workItemId" | "workflowId" | "phase" | "status">;
}

export interface WorkflowLauncher {
  launch(options: LaunchOptions): Promise<LaunchResult>;
  isAvailable(): Promise<boolean>;
  readonly name: string;
}
