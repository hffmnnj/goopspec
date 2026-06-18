/**
 * Session tracking and workflow binding subsystem.
 *
 * Tracks active OpenCode sessions in-memory and binds each session to a
 * workflow. The primary design goal is reliable workflow resolution — the
 * 0.2.x codebase had a stale-binding bug where slash commands resolved the
 * wrong session/workflow. This implementation makes the binding explicit
 * and deterministic.
 *
 * Sessions are ephemeral runtime state (not persisted to disk). Workflow
 * state is persisted by the StateManager; this module only tracks the
 * mapping between live sessions and workflows.
 *
 * @module features/session
 */

import type { SessionInfo } from "../../core/types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Metadata tracked per session beyond the core SessionInfo. */
export interface SessionMetadata {
  lastActivity: number;
  idleSince: number | null;
  agent: string | null;
}

/** Full internal session record. */
export interface SessionRecord {
  info: SessionInfo;
  meta: SessionMetadata;
}

/** Lifecycle event types the session manager can emit. */
export type SessionEvent = "created" | "deleted" | "idle" | "active";

/** Callback signature for session lifecycle listeners. */
export type SessionEventListener = (
  event: SessionEvent,
  session: SessionRecord,
) => void | Promise<void>;

/** Options for creating a session manager. */
export interface SessionManagerOptions {
  /** Idle threshold in milliseconds. Default: 5 minutes. */
  idleThresholdMs?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_IDLE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

// ---------------------------------------------------------------------------
// Session Manager
// ---------------------------------------------------------------------------

export interface SessionManager {
  /** Register a new session. Returns the created record. */
  create(sessionId: string, opts?: { agent?: string; workflowId?: string }): SessionRecord;

  /** Get a session by ID. */
  get(sessionId: string): SessionRecord | undefined;

  /** List all active sessions. */
  list(): SessionRecord[];

  /** Bind (or rebind) a session to a workflow. */
  bindToWorkflow(sessionId: string, workflowId: string): void;

  /** Get the workflow ID bound to a session. */
  getWorkflowId(sessionId: string): string | undefined;

  /** Find sessions bound to a specific workflow. */
  findByWorkflow(workflowId: string): SessionRecord[];

  /** Record activity on a session (resets idle timer). */
  touch(sessionId: string): void;

  /** Mark a session as idle. Fires the "idle" event. */
  markIdle(sessionId: string): void;

  /** Remove a session. Fires the "deleted" event. */
  delete(sessionId: string): void;

  /** Remove all sessions. */
  clear(): void;

  /**
   * Resolve the "active" session for a given workflow.
   *
   * Resolution order:
   * 1. Sessions explicitly bound to the workflow, sorted by most recent activity.
   * 2. If no binding matches and there is exactly one session, return it.
   * 3. Otherwise, undefined (ambiguous or no sessions).
   */
  resolveForWorkflow(workflowId: string): SessionRecord | undefined;

  /** Subscribe to session lifecycle events. Returns an unsubscribe function. */
  on(listener: SessionEventListener): () => void;

  /** Number of tracked sessions. */
  size(): number;

  /** Configured idle threshold in milliseconds. */
  idleThresholdMs: number;
}

/**
 * Create a SessionManager instance.
 *
 * All state is held in-memory — no disk persistence. The manager is
 * designed to be created once during plugin initialisation and shared
 * via PluginContext.
 */
export function createSessionManager(opts: SessionManagerOptions = {}): SessionManager {
  const idleThresholdMs = opts.idleThresholdMs ?? DEFAULT_IDLE_THRESHOLD_MS;
  const sessions = new Map<string, SessionRecord>();
  const listeners = new Set<SessionEventListener>();

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  function emit(event: SessionEvent, record: SessionRecord): void {
    for (const listener of listeners) {
      try {
        // Fire-and-forget for async listeners — session events are
        // informational and must not block the caller.
        void Promise.resolve(listener(event, record));
      } catch {
        // Swallow listener errors to avoid crashing the plugin.
      }
    }
  }

  function assertExists(sessionId: string): SessionRecord {
    const record = sessions.get(sessionId);
    if (!record) {
      throw new Error(`Session "${sessionId}" not found`);
    }
    return record;
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  const manager: SessionManager = {
    create(sessionId, createOpts) {
      if (sessions.has(sessionId)) {
        return sessions.get(sessionId) as SessionRecord;
      }

      const now = Date.now();
      const record: SessionRecord = {
        info: {
          id: sessionId,
          agent: createOpts?.agent,
          workflowId: createOpts?.workflowId,
          startedAt: new Date(now).toISOString(),
        },
        meta: {
          lastActivity: now,
          idleSince: null,
          agent: createOpts?.agent ?? null,
        },
      };

      sessions.set(sessionId, record);
      emit("created", record);
      return record;
    },

    get(sessionId) {
      return sessions.get(sessionId);
    },

    list() {
      return Array.from(sessions.values());
    },

    bindToWorkflow(sessionId, workflowId) {
      const record = assertExists(sessionId);
      record.info.workflowId = workflowId;
    },

    getWorkflowId(sessionId) {
      return sessions.get(sessionId)?.info.workflowId;
    },

    findByWorkflow(workflowId) {
      const results: SessionRecord[] = [];
      for (const record of sessions.values()) {
        if (record.info.workflowId === workflowId) {
          results.push(record);
        }
      }
      return results;
    },

    touch(sessionId) {
      const record = assertExists(sessionId);
      record.meta.lastActivity = Date.now();
      record.meta.idleSince = null;
    },

    markIdle(sessionId) {
      const record = assertExists(sessionId);
      if (record.meta.idleSince !== null) return; // already idle
      record.meta.idleSince = Date.now();
      emit("idle", record);
    },

    delete(sessionId) {
      const record = sessions.get(sessionId);
      if (!record) return;
      sessions.delete(sessionId);
      emit("deleted", record);
    },

    clear() {
      const all = Array.from(sessions.values());
      sessions.clear();
      for (const record of all) {
        emit("deleted", record);
      }
    },

    resolveForWorkflow(workflowId) {
      // 1. Find sessions explicitly bound to this workflow.
      const bound = manager.findByWorkflow(workflowId);
      if (bound.length === 1) return bound[0];
      if (bound.length > 1) {
        // Multiple sessions bound — pick the most recently active.
        return bound.sort((a, b) => b.meta.lastActivity - a.meta.lastActivity)[0];
      }

      // 2. Fallback: if there is exactly one session total, return it.
      if (sessions.size === 1) {
        const [only] = sessions.values();
        return only;
      }

      // 3. Ambiguous or no sessions.
      return undefined;
    },

    on(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    size() {
      return sessions.size;
    },

    idleThresholdMs,
  };

  return manager;
}

// Re-export the SessionInfo type for convenience.
export type { SessionInfo } from "../../core/types.js";
