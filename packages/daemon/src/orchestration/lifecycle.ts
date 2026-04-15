import type { Database, SQLQueryBindings } from "bun:sqlite";
import {
  WORKFLOW_PHASES,
  WORKFLOW_STATUSES,
  generateId,
  type WorkflowEvent,
  type WorkflowPhase,
  type WorkflowSession,
} from "@goopspec/core";
import { EventEmitter } from "events";
import type { WorkflowLauncher } from "./launcher.js";

export interface SpawnWorkflowOptions {
  projectId: string;
  projectPath: string;
  workItemId?: string;
  prompt?: string;
  workflowId?: string;
}

interface WorkflowSessionRow {
  id: string;
  project_id: string;
  work_item_id: string | null;
  workflow_id: string;
  phase: string;
  current_wave: number;
  total_waves: number;
  status: string;
  active_agent: string | null;
  blocker_description: string | null;
  started_at: string;
  completed_at: string | null;
  updated_at: string;
}

interface WorkflowEventRow {
  id: string;
  session_id: string;
  type: string;
  data: string;
  timestamp: string;
}

const ACTIVE_STATUSES = ["pending", "running", "paused"] as const;

export class WorkflowLifecycleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkflowLifecycleError";
  }
}

export class WorkflowLifecycleManager extends EventEmitter {
  constructor(
    private db: Database,
    private launcher: WorkflowLauncher,
  ) {
    super();
  }

  async spawn(options: SpawnWorkflowOptions): Promise<WorkflowSession> {
    if (options.workItemId) {
      this.ensureNoActiveSessionForWorkItem(options.workItemId);
    }

    const sessionId = generateId();
    const now = new Date().toISOString();

    this.db
      .query(
        `INSERT INTO workflow_sessions
        (id, project_id, work_item_id, workflow_id, phase, status, started_at, updated_at)
        VALUES (?, ?, ?, ?, 'idle', 'pending', ?, ?)`,
      )
      .run(
        sessionId,
        options.projectId,
        options.workItemId ?? null,
        options.workflowId ?? "default",
        now,
        now,
      );

    this.recordEvent(sessionId, "workflow:spawning", {
      projectId: options.projectId,
      workItemId: options.workItemId,
    });

    const launchResult = await this.launcher.launch({
      projectPath: options.projectPath,
      workItemId: options.workItemId,
      workflowId: options.workflowId,
      prompt: options.prompt,
    });

    if (launchResult.status === "failed") {
      this.updateSession(sessionId, { status: "failed" });
      this.recordEvent(sessionId, "workflow:failed", {
        error: launchResult.error ?? "Launcher failed to start workflow",
      });
      this.emit("workflow:failed", {
        sessionId,
        error: launchResult.error,
      });
    } else {
      this.updateSession(sessionId, { status: "running" });
      this.recordEvent(sessionId, "workflow:started", {
        pid: launchResult.pid,
      });
      this.emit("workflow:started", {
        sessionId,
        projectId: options.projectId,
        workItemId: options.workItemId,
      });
    }

    const session = this.getSession(sessionId);
    if (!session) {
      throw new WorkflowLifecycleError("Failed to load workflow session after spawn");
    }

    return session;
  }

  updateProgress(
    sessionId: string,
    phase: WorkflowPhase,
    wave: number,
    totalWaves: number,
    activeAgent?: string,
  ): void {
    this.updateSession(sessionId, {
      phase,
      current_wave: wave,
      total_waves: totalWaves,
      active_agent: activeAgent ?? null,
    });
    this.recordEvent(sessionId, "workflow:progress", {
      phase,
      wave,
      totalWaves,
      activeAgent,
    });
    this.emit("workflow:status", {
      sessionId,
      phase,
      wave,
      totalWaves,
      agent: activeAgent,
    });
  }

  complete(sessionId: string): void {
    const now = new Date().toISOString();
    this.db
      .query(
        "UPDATE workflow_sessions SET status = 'completed', completed_at = ?, updated_at = ? WHERE id = ?",
      )
      .run(now, now, sessionId);

    this.recordEvent(sessionId, "workflow:completed", {});
    this.emit("workflow:completed", { sessionId, status: "completed" });
  }

  fail(sessionId: string, error: string): void {
    this.updateSession(sessionId, {
      status: "failed",
      blocker_description: error,
    });
    this.recordEvent(sessionId, "workflow:failed", { error });
    this.emit("workflow:completed", { sessionId, status: "failed" });
  }

  getSession(id: string): WorkflowSession | null {
    const row = this.db
      .query("SELECT * FROM workflow_sessions WHERE id = ?")
      .get(id) as WorkflowSessionRow | null;

    if (!row) {
      return null;
    }

    return this.rowToSession(row);
  }

  listSessions(projectId?: string): WorkflowSession[] {
    let rows: WorkflowSessionRow[];

    if (projectId) {
      rows = this.db
        .query(
          "SELECT * FROM workflow_sessions WHERE project_id = ? ORDER BY started_at DESC",
        )
        .all(projectId) as WorkflowSessionRow[];
    } else {
      rows = this.db
        .query("SELECT * FROM workflow_sessions ORDER BY started_at DESC")
        .all() as WorkflowSessionRow[];
    }

    return rows.map((row) => this.rowToSession(row));
  }

  getEvents(sessionId: string, afterTimestamp?: string): WorkflowEvent[] {
    let rows: WorkflowEventRow[];

    if (afterTimestamp) {
      rows = this.db
        .query(
          "SELECT * FROM workflow_events WHERE session_id = ? AND timestamp > ? ORDER BY timestamp ASC",
        )
        .all(sessionId, afterTimestamp) as WorkflowEventRow[];
    } else {
      rows = this.db
        .query(
          "SELECT * FROM workflow_events WHERE session_id = ? ORDER BY timestamp ASC",
        )
        .all(sessionId) as WorkflowEventRow[];
    }

    return rows.map((row) => this.rowToEvent(row));
  }

  private updateSession(id: string, fields: Record<string, SQLQueryBindings>): void {
    const entries = Object.entries(fields);
    if (entries.length === 0) {
      return;
    }

    const now = new Date().toISOString();
    const assignments = entries.map(([key]) => `${key} = ?`).join(", ");
    const values = entries.map(([, value]) => value);

    this.db
      .query(`UPDATE workflow_sessions SET ${assignments}, updated_at = ? WHERE id = ?`)
      .run(...values, now, id);
  }

  private recordEvent(
    sessionId: string,
    type: string,
    data: Record<string, unknown>,
  ): void {
    const eventId = generateId();
    this.db
      .query(
        `INSERT INTO workflow_events (id, session_id, type, data, timestamp)
        VALUES (?, ?, ?, ?, ?)`,
      )
      .run(eventId, sessionId, type, JSON.stringify(data), new Date().toISOString());
  }

  private ensureNoActiveSessionForWorkItem(workItemId: string): void {
    const active = this.db
      .query(
        `SELECT id FROM workflow_sessions
         WHERE work_item_id = ? AND status IN (?, ?, ?)
         LIMIT 1`,
      )
      .get(workItemId, ...ACTIVE_STATUSES) as { id: string } | null;

    if (active) {
      throw new WorkflowLifecycleError(
        `Work item ${workItemId} already has an active workflow session`,
      );
    }
  }

  private rowToSession(row: WorkflowSessionRow): WorkflowSession {
    return {
      id: row.id,
      projectId: row.project_id,
      workItemId: row.work_item_id ?? undefined,
      workflowId: row.workflow_id,
      phase: this.toWorkflowPhase(row.phase),
      currentWave: row.current_wave,
      totalWaves: row.total_waves,
      status: this.toWorkflowStatus(row.status),
      activeAgent: row.active_agent ?? undefined,
      blockerDescription: row.blocker_description ?? undefined,
      startedAt: row.started_at,
      completedAt: row.completed_at ?? undefined,
      updatedAt: row.updated_at,
    };
  }

  private rowToEvent(row: WorkflowEventRow): WorkflowEvent {
    return {
      id: row.id,
      sessionId: row.session_id,
      type: row.type,
      data: this.safeParseJson(row.data),
      timestamp: row.timestamp,
    };
  }

  private toWorkflowPhase(phase: string): WorkflowPhase {
    if (WORKFLOW_PHASES.includes(phase as WorkflowPhase)) {
      return phase as WorkflowPhase;
    }

    return "idle";
  }

  private toWorkflowStatus(status: string): WorkflowSession["status"] {
    if (WORKFLOW_STATUSES.includes(status as WorkflowSession["status"])) {
      return status as WorkflowSession["status"];
    }

    return "pending";
  }

  private safeParseJson(value: string): Record<string, unknown> {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      return {};
    } catch {
      return {};
    }
  }
}
