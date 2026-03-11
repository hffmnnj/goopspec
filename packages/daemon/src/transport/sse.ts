import type { Database } from "bun:sqlite";
import type { ServerMessage, WorkflowSession } from "@goopspec/core";
import { Hono } from "hono";
import type { WorkflowLifecycleManager } from "../orchestration/lifecycle.js";

const KEEPALIVE_INTERVAL_MS = 15_000;
const REPLAY_MAX_EVENTS = 1000;
const REPLAY_MAX_AGE_MS = 24 * 60 * 60 * 1000;

interface WorkflowEventRow {
  id: string;
  session_id: string;
  type: string;
  data: string;
  timestamp: string;
}

interface WorkflowSessionRow {
  id: string;
}

interface WorkflowStartedEvent {
  sessionId: string;
  projectId: string;
  workItemId?: string;
}

interface WorkflowStatusEvent {
  sessionId: string;
  phase: string;
  wave: number;
  totalWaves: number;
  agent?: string;
  blocker?: string;
}

interface WorkflowCompletedEvent {
  sessionId: string;
  status: "completed" | "failed";
}

interface WorkflowFailedEvent {
  sessionId: string;
  error?: string;
}

interface ActiveConnection {
  controller: ReadableStreamDefaultController<Uint8Array>;
  keepaliveTimer: ReturnType<typeof setInterval>;
  eventCounter: number;
}

/**
 * Format a single SSE event according to the text/event-stream protocol.
 */
export function formatSSEEvent(id: string, type: string, data: unknown): string {
  const jsonData = JSON.stringify(data);
  return `id: ${id}\nevent: ${type}\ndata: ${jsonData}\n\n`;
}

export class SseManager {
  private readonly connections = new Map<string, Set<ActiveConnection>>();
  private readonly cleanupFns = new Map<ActiveConnection, () => void>();
  private readonly sessionProjectMap = new Map<string, string>();
  private readonly encoder = new TextEncoder();

  constructor(
    private readonly db: Database,
    private readonly lifecycle: WorkflowLifecycleManager,
  ) {}

  createHandler(): Hono {
    const app = new Hono();

    app.get("/events/:projectId", (c) => {
      const projectId = c.req.param("projectId");
      const lastEventId = c.req.header("Last-Event-ID") ?? null;
      let activeConnection: ActiveConnection | null = null;

      const stream = new ReadableStream<Uint8Array>({
        start: (controller) => {
          const connection: ActiveConnection = {
            controller,
            keepaliveTimer: setInterval(() => {
              this.sendPing(connection);
            }, KEEPALIVE_INTERVAL_MS),
            eventCounter: 0,
          };
          activeConnection = connection;

          this.addConnection(projectId, connection);

          // Send initial ping
          this.sendPing(connection);

          // Replay historical events if Last-Event-ID is present
          if (lastEventId) {
            this.replayEvents(projectId, lastEventId, connection);
          }

          // Subscribe to lifecycle events
          const onStarted = (event: WorkflowStartedEvent): void => {
            if (event.projectId !== projectId) return;
            this.pushEvent(connection, "workflow:started", {
              sessionId: event.sessionId,
              projectId: event.projectId,
              workItemId: event.workItemId,
            });
          };

          const onStatus = (event: WorkflowStatusEvent): void => {
            const resolvedProjectId = this.resolveProjectId(event.sessionId);
            if (resolvedProjectId !== projectId) return;
            this.pushEvent(connection, "workflow:status", {
              sessionId: event.sessionId,
              phase: event.phase,
              wave: event.wave,
              totalWaves: event.totalWaves,
              agent: event.agent,
              blocker: event.blocker,
            });
          };

          const onCompleted = (event: WorkflowCompletedEvent): void => {
            const resolvedProjectId = this.resolveProjectId(event.sessionId);
            if (resolvedProjectId !== projectId) return;
            this.pushEvent(connection, "workflow:completed", {
              sessionId: event.sessionId,
              status: event.status,
            });
          };

          const onFailed = (event: WorkflowFailedEvent): void => {
            const resolvedProjectId = this.resolveProjectId(event.sessionId);
            if (resolvedProjectId !== projectId) return;
            this.pushEvent(connection, "workflow:completed", {
              sessionId: event.sessionId,
              status: "failed",
            });
          };

          this.lifecycle.on("workflow:started", onStarted);
          this.lifecycle.on("workflow:status", onStatus);
          this.lifecycle.on("workflow:completed", onCompleted);
          this.lifecycle.on("workflow:failed", onFailed);

          this.cleanupFns.set(connection, () => {
            clearInterval(connection.keepaliveTimer);
            this.lifecycle.off("workflow:started", onStarted);
            this.lifecycle.off("workflow:status", onStatus);
            this.lifecycle.off("workflow:completed", onCompleted);
            this.lifecycle.off("workflow:failed", onFailed);
            this.removeConnection(projectId, connection);
            this.cleanupFns.delete(connection);
          });
        },
        cancel: () => {
          if (activeConnection) {
            const cleanup = this.cleanupFns.get(activeConnection);
            if (cleanup) cleanup();
          }
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "X-Accel-Buffering": "no",
        },
      });
    });

    return app;
  }

  destroy(): void {
    for (const [, projectConnections] of this.connections) {
      for (const conn of projectConnections) {
        const cleanup = this.cleanupFns.get(conn);
        if (cleanup) {
          cleanup();
        } else {
          clearInterval(conn.keepaliveTimer);
        }
      }
      projectConnections.clear();
    }
    this.connections.clear();
    this.cleanupFns.clear();
  }

  getConnectionCount(projectId: string): number {
    return this.connections.get(projectId)?.size ?? 0;
  }

  private addConnection(projectId: string, connection: ActiveConnection): void {
    let projectConnections = this.connections.get(projectId);
    if (!projectConnections) {
      projectConnections = new Set<ActiveConnection>();
      this.connections.set(projectId, projectConnections);
    }
    projectConnections.add(connection);
  }

  private removeConnection(projectId: string, connection: ActiveConnection): void {
    const projectConnections = this.connections.get(projectId);
    if (!projectConnections) return;

    projectConnections.delete(connection);
    if (projectConnections.size === 0) {
      this.connections.delete(projectId);
    }
  }

  private sendPing(connection: ActiveConnection): void {
    connection.eventCounter++;
    const event = formatSSEEvent(
      String(connection.eventCounter),
      "ping",
      { timestamp: new Date().toISOString() },
    );
    this.enqueue(connection, event);
  }

  private pushEvent(
    connection: ActiveConnection,
    type: ServerMessage["type"],
    payload: Record<string, unknown>,
  ): void {
    connection.eventCounter++;
    const event = formatSSEEvent(
      String(connection.eventCounter),
      type,
      payload,
    );
    this.enqueue(connection, event);
  }

  private enqueue(connection: ActiveConnection, event: string): void {
    try {
      connection.controller.enqueue(this.encoder.encode(event));
    } catch {
      // Stream already closed — ignore
    }
  }

  replayEvents(
    projectId: string,
    lastEventId: string,
    connection: ActiveConnection,
  ): void {
    const cutoff = new Date(Date.now() - REPLAY_MAX_AGE_MS).toISOString();

    // Find all sessions for this project
    const sessions = this.db
      .query("SELECT id FROM workflow_sessions WHERE project_id = ?")
      .all(projectId) as WorkflowSessionRow[];

    if (sessions.length === 0) return;

    const sessionIds = sessions.map((s) => s.id);
    const placeholders = sessionIds.map(() => "?").join(", ");

    // Since event IDs are UUIDs (not sequential), look up the timestamp
    // of the last-event-id, then replay everything after that timestamp.
    const lastEvent = this.db
      .query("SELECT timestamp FROM workflow_events WHERE id = ? LIMIT 1")
      .get(lastEventId) as { timestamp: string } | null;

    const afterTimestamp = lastEvent ? lastEvent.timestamp : lastEventId;

    const rows = this.db
      .query(
        `SELECT * FROM workflow_events
         WHERE session_id IN (${placeholders})
           AND timestamp > ?
           AND timestamp > ?
         ORDER BY timestamp ASC
         LIMIT ?`,
      )
      .all(...sessionIds, afterTimestamp, cutoff, REPLAY_MAX_EVENTS) as WorkflowEventRow[];

    for (const row of rows) {
      const eventData = this.safeParseJson(row.data);
      connection.eventCounter++;
      const event = formatSSEEvent(
        row.id,
        row.type,
        eventData,
      );
      this.enqueue(connection, event);
    }
  }

  private resolveProjectId(sessionId: string): string | undefined {
    const cached = this.sessionProjectMap.get(sessionId);
    if (cached) return cached;

    const session = this.lifecycle.getSession(sessionId) as WorkflowSession | null;
    if (!session) return undefined;

    this.sessionProjectMap.set(sessionId, session.projectId);
    return session.projectId;
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
