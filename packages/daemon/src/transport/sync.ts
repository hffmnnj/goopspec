import type { Database } from "bun:sqlite";
import type {
  Project,
  WorkflowEvent,
  WorkflowPhase,
  WorkflowSession,
} from "@goopspec/core";
import { WORKFLOW_PHASES, WORKFLOW_STATUSES } from "@goopspec/core";

const MAX_EVENT_LIMIT = 1000;
const RECENT_SESSION_LIMIT = 20;
const RECENT_EVENT_LIMIT = 100;

const ACTIVE_STATUSES = ["pending", "running", "paused"] as const;
const TERMINAL_STATUSES = ["completed", "failed", "cancelled"] as const;

// ---------------------------------------------------------------------------
// DB row types (snake_case)
// ---------------------------------------------------------------------------

interface ProjectRow {
  id: string;
  name: string;
  path: string;
  description: string | null;
  created_at: string;
  updated_at: string;
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

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

export interface SyncResponse {
  project: Project;
  activeSessions: WorkflowSession[];
  recentSessions: WorkflowSession[];
  recentEvents: WorkflowEvent[];
  serverTime: string;
}

export interface MissedEventsResponse {
  events: WorkflowEvent[];
  hasMore: boolean;
}

// ---------------------------------------------------------------------------
// SyncService
// ---------------------------------------------------------------------------

export class SyncService {
  constructor(private readonly db: Database) {}

  getProjectSnapshot(projectId: string): SyncResponse | null {
    const project = this.getProject(projectId);
    if (!project) return null;

    const activeSessions = this.getSessionsByStatus(projectId, ACTIVE_STATUSES);
    const recentSessions = this.getRecentTerminalSessions(projectId);
    const recentEvents = this.getRecentProjectEvents(projectId);

    return {
      project,
      activeSessions,
      recentSessions,
      recentEvents,
      serverTime: new Date().toISOString(),
    };
  }

  getMissedEvents(
    projectId: string,
    after: string,
    limit: number,
  ): MissedEventsResponse {
    const clampedLimit = Math.max(1, Math.min(limit, MAX_EVENT_LIMIT));

    const sessionIds = this.getProjectSessionIds(projectId);
    if (sessionIds.length === 0) {
      return { events: [], hasMore: false };
    }

    const placeholders = sessionIds.map(() => "?").join(", ");

    // Fetch one extra row to determine hasMore
    const rows = this.db
      .query(
        `SELECT * FROM workflow_events
         WHERE session_id IN (${placeholders})
           AND timestamp > ?
         ORDER BY timestamp ASC
         LIMIT ?`,
      )
      .all(...sessionIds, after, clampedLimit + 1) as WorkflowEventRow[];

    const hasMore = rows.length > clampedLimit;
    const resultRows = hasMore ? rows.slice(0, clampedLimit) : rows;

    return {
      events: resultRows.map((row) => this.rowToEvent(row)),
      hasMore,
    };
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private getProject(id: string): Project | null {
    const row = this.db
      .query("SELECT * FROM projects WHERE id = ?")
      .get(id) as ProjectRow | null;
    return row ? this.rowToProject(row) : null;
  }

  private getSessionsByStatus(
    projectId: string,
    statuses: readonly string[],
  ): WorkflowSession[] {
    const placeholders = statuses.map(() => "?").join(", ");
    const rows = this.db
      .query(
        `SELECT * FROM workflow_sessions
         WHERE project_id = ? AND status IN (${placeholders})
         ORDER BY updated_at DESC`,
      )
      .all(projectId, ...statuses) as WorkflowSessionRow[];
    return rows.map((row) => this.rowToSession(row));
  }

  private getRecentTerminalSessions(projectId: string): WorkflowSession[] {
    const placeholders = TERMINAL_STATUSES.map(() => "?").join(", ");
    const rows = this.db
      .query(
        `SELECT * FROM workflow_sessions
         WHERE project_id = ? AND status IN (${placeholders})
         ORDER BY updated_at DESC
         LIMIT ?`,
      )
      .all(projectId, ...TERMINAL_STATUSES, RECENT_SESSION_LIMIT) as WorkflowSessionRow[];
    return rows.map((row) => this.rowToSession(row));
  }

  private getRecentProjectEvents(projectId: string): WorkflowEvent[] {
    const sessionIds = this.getProjectSessionIds(projectId);
    if (sessionIds.length === 0) return [];

    const placeholders = sessionIds.map(() => "?").join(", ");
    const rows = this.db
      .query(
        `SELECT * FROM workflow_events
         WHERE session_id IN (${placeholders})
         ORDER BY timestamp DESC
         LIMIT ?`,
      )
      .all(...sessionIds, RECENT_EVENT_LIMIT) as WorkflowEventRow[];

    // Return in ascending order for chronological consumption
    return rows.reverse().map((row) => this.rowToEvent(row));
  }

  private getProjectSessionIds(projectId: string): string[] {
    const rows = this.db
      .query("SELECT id FROM workflow_sessions WHERE project_id = ?")
      .all(projectId) as Array<{ id: string }>;
    return rows.map((r) => r.id);
  }

  // -------------------------------------------------------------------------
  // Row mappers
  // -------------------------------------------------------------------------

  private rowToProject(row: ProjectRow): Project {
    return {
      id: row.id,
      name: row.name,
      path: row.path,
      description: row.description ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
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
