import { useState, useEffect, useRef, useCallback } from "react";
import type { WorkflowSession, WorkflowEvent } from "@/lib/api-client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WorkflowStreamState {
  connected: boolean;
  connectionType: "websocket" | "sse" | "disconnected";
  session: WorkflowSession | null;
  events: WorkflowEvent[];
  error: string | null;
}

interface ServerMessage {
  type: string;
  payload: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DAEMON_WS_URL =
  (typeof import.meta !== "undefined" &&
    import.meta.env?.PUBLIC_DAEMON_URL?.replace(/^http/, "ws")) ??
  "ws://localhost:7331";

const DAEMON_SSE_URL =
  (typeof import.meta !== "undefined" &&
    import.meta.env?.PUBLIC_DAEMON_URL) ??
  "http://localhost:7331";

const INITIAL_BACKOFF_MS = 500;
const MAX_BACKOFF_MS = 16_000;
const MAX_RETRIES = 5;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useWorkflowStream(
  sessionId: string,
  projectId: string,
): WorkflowStreamState {
  const [state, setState] = useState<WorkflowStreamState>({
    connected: false,
    connectionType: "disconnected",
    session: null,
    events: [],
    error: null,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const sseRef = useRef<EventSource | null>(null);
  const retriesRef = useRef(0);
  const backoffRef = useRef(INITIAL_BACKOFF_MS);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  // -----------------------------------------------------------------------
  // Message handler (shared between WS and SSE)
  // -----------------------------------------------------------------------

  const handleMessage = useCallback(
    (msg: ServerMessage) => {
      if (!mountedRef.current) return;

      switch (msg.type) {
        case "workflow:status": {
          const p = msg.payload as {
            sessionId: string;
            phase: string;
            wave?: number;
            totalWaves?: number;
            agent?: string;
            blocker?: string;
            status?: string;
          };
          if (p.sessionId !== sessionId) return;
          setState((prev) => ({
            ...prev,
            session: prev.session
              ? {
                  ...prev.session,
                  phase: p.phase as WorkflowSession["phase"],
                  currentWave: p.wave ?? prev.session.currentWave,
                  totalWaves: p.totalWaves ?? prev.session.totalWaves,
                  activeAgent: p.agent ?? prev.session.activeAgent,
                  blockerDescription: p.blocker,
                  status: (p.status as WorkflowSession["status"]) ?? prev.session.status,
                  updatedAt: new Date().toISOString(),
                }
              : null,
          }));
          break;
        }

        case "workflow:started": {
          const p = msg.payload as {
            sessionId: string;
            projectId: string;
            workItemId?: string;
          };
          if (p.sessionId !== sessionId) return;
          setState((prev) => ({
            ...prev,
            session: prev.session
              ? { ...prev.session, status: "running", updatedAt: new Date().toISOString() }
              : null,
            events: [
              ...prev.events,
              {
                id: `evt-${Date.now()}`,
                sessionId: p.sessionId,
                type: "workflow:started",
                data: msg.payload,
                timestamp: new Date().toISOString(),
              },
            ],
          }));
          break;
        }

        case "workflow:completed": {
          const p = msg.payload as {
            sessionId: string;
            status: "completed" | "failed";
          };
          if (p.sessionId !== sessionId) return;
          setState((prev) => ({
            ...prev,
            session: prev.session
              ? {
                  ...prev.session,
                  status: p.status,
                  completedAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                }
              : null,
            events: [
              ...prev.events,
              {
                id: `evt-${Date.now()}`,
                sessionId: p.sessionId,
                type: "workflow:completed",
                data: msg.payload,
                timestamp: new Date().toISOString(),
              },
            ],
          }));
          break;
        }

        case "ping": {
          // Respond with pong over WS
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(
              JSON.stringify({
                type: "pong",
                payload: { timestamp: new Date().toISOString() },
              }),
            );
          }
          break;
        }

        default: {
          // Generic event — append to events list
          const p = msg.payload as { sessionId?: string };
          if (p.sessionId && p.sessionId !== sessionId) return;
          setState((prev) => ({
            ...prev,
            events: [
              ...prev.events,
              {
                id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                sessionId: sessionId,
                type: msg.type,
                data: msg.payload,
                timestamp: new Date().toISOString(),
              },
            ],
          }));
        }
      }
    },
    [sessionId],
  );

  // -----------------------------------------------------------------------
  // SSE fallback
  // -----------------------------------------------------------------------

  const connectSSE = useCallback(() => {
    if (!mountedRef.current) return;

    try {
      const es = new EventSource(
        `${DAEMON_SSE_URL}/api/events/${encodeURIComponent(projectId)}`,
      );
      sseRef.current = es;

      es.onopen = () => {
        if (!mountedRef.current) return;
        retriesRef.current = 0;
        backoffRef.current = INITIAL_BACKOFF_MS;
        setState((prev) => ({
          ...prev,
          connected: true,
          connectionType: "sse",
          error: null,
        }));
      };

      es.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as ServerMessage;
          handleMessage(msg);
        } catch {
          // Ignore malformed messages
        }
      };

      es.onerror = () => {
        es.close();
        sseRef.current = null;
        if (!mountedRef.current) return;

        setState((prev) => ({
          ...prev,
          connected: false,
          connectionType: "disconnected",
          error: "Connection lost. Retrying…",
        }));

        scheduleReconnect("sse");
      };
    } catch {
      if (!mountedRef.current) return;
      setState((prev) => ({
        ...prev,
        connected: false,
        connectionType: "disconnected",
        error: "Failed to connect via SSE.",
      }));
    }
  }, [projectId, handleMessage]);

  // -----------------------------------------------------------------------
  // Reconnection with exponential backoff
  // -----------------------------------------------------------------------

  const scheduleReconnect = useCallback(
    (failedType: "ws" | "sse") => {
      if (!mountedRef.current) return;
      if (retriesRef.current >= MAX_RETRIES) {
        setState((prev) => ({
          ...prev,
          error: "Unable to connect after multiple attempts.",
        }));
        return;
      }

      retriesRef.current += 1;
      const delay = backoffRef.current;
      backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF_MS);

      reconnectTimerRef.current = setTimeout(() => {
        if (!mountedRef.current) return;
        if (failedType === "ws") {
          // First WS failure → try SSE
          connectSSE();
        } else {
          // SSE failure → try SSE again
          connectSSE();
        }
      }, delay);
    },
    [connectSSE],
  );

  // -----------------------------------------------------------------------
  // WebSocket connection
  // -----------------------------------------------------------------------

  const connectWS = useCallback(() => {
    if (!mountedRef.current) return;

    try {
      const ws = new WebSocket(`${DAEMON_WS_URL}/api/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) {
          ws.close();
          return;
        }
        retriesRef.current = 0;
        backoffRef.current = INITIAL_BACKOFF_MS;

        // Join rooms
        ws.send(
          JSON.stringify({
            type: "join",
            payload: { room: `workflow:${sessionId}` },
          }),
        );
        ws.send(
          JSON.stringify({
            type: "join",
            payload: { room: `project:${projectId}` },
          }),
        );

        setState((prev) => ({
          ...prev,
          connected: true,
          connectionType: "websocket",
          error: null,
        }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string) as ServerMessage;
          handleMessage(msg);
        } catch {
          // Ignore malformed messages
        }
      };

      ws.onerror = () => {
        // Will trigger onclose
      };

      ws.onclose = () => {
        wsRef.current = null;
        if (!mountedRef.current) return;

        setState((prev) => ({
          ...prev,
          connected: false,
          connectionType: "disconnected",
        }));

        // On first WS failure, fall back to SSE
        scheduleReconnect("ws");
      };
    } catch {
      if (!mountedRef.current) return;
      // WebSocket constructor failed — go straight to SSE
      connectSSE();
    }
  }, [sessionId, projectId, handleMessage, scheduleReconnect, connectSSE]);

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  useEffect(() => {
    mountedRef.current = true;
    connectWS();

    return () => {
      mountedRef.current = false;

      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (sseRef.current) {
        sseRef.current.close();
        sseRef.current = null;
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };
  }, [connectWS]);

  return state;
}
