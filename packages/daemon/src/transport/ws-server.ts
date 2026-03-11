import {
  ClientMessageSchema,
  ServerMessageSchema,
  type ServerMessage,
  type WorkflowSession,
} from "@goopspec/core";
import type { Server, ServerWebSocket, WebSocketHandler } from "bun";
import type { WorkflowLifecycleManager } from "../orchestration/lifecycle.js";
import { RoomManager } from "./rooms.js";

const HEARTBEAT_INTERVAL_MS = 30_000;
const HEARTBEAT_TIMEOUT_MS = 10_000;

export interface WsData {
  rooms: Set<string>;
  connectedAt: number;
  lastPong: number;
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

export class WsServer {
  private readonly heartbeatTimer: ReturnType<typeof setInterval>;
  private readonly activeSockets = new Set<ServerWebSocket<WsData>>();
  private readonly sessionProjectMap = new Map<string, string>();

  private readonly onWorkflowStarted = (event: WorkflowStartedEvent): void => {
    this.sessionProjectMap.set(event.sessionId, event.projectId);

    this.broadcastToRoom(`project:${event.projectId}`, {
      type: "workflow:started",
      payload: {
        sessionId: event.sessionId,
        projectId: event.projectId,
        workItemId: event.workItemId,
      },
    });

    this.broadcastToRoom(`workflow:${event.sessionId}`, {
      type: "workflow:started",
      payload: {
        sessionId: event.sessionId,
        projectId: event.projectId,
        workItemId: event.workItemId,
      },
    });
  };

  private readonly onWorkflowStatus = (event: WorkflowStatusEvent): void => {
    this.broadcastToRoom(`workflow:${event.sessionId}`, {
      type: "workflow:status",
      payload: {
        sessionId: event.sessionId,
        phase: event.phase,
        wave: event.wave,
        totalWaves: event.totalWaves,
        agent: event.agent,
        blocker: event.blocker,
      },
    });
  };

  private readonly onWorkflowCompleted = (event: WorkflowCompletedEvent): void => {
    const projectId = this.resolveProjectId(event.sessionId);
    if (!projectId) {
      return;
    }

    const message: ServerMessage = {
      type: "workflow:completed",
      payload: {
        sessionId: event.sessionId,
        status: event.status,
      },
    };

    this.broadcastToRoom(`project:${projectId}`, message);
    this.broadcastToRoom(`workflow:${event.sessionId}`, message);
  };

  private readonly onWorkflowFailed = (event: WorkflowFailedEvent): void => {
    const projectId = this.resolveProjectId(event.sessionId);
    if (!projectId) {
      return;
    }

    this.broadcastToRoom(`project:${projectId}`, {
      type: "workflow:completed",
      payload: {
        sessionId: event.sessionId,
        status: "failed",
      },
    });

    this.broadcastToRoom(`workflow:${event.sessionId}`, {
      type: "workflow:completed",
      payload: {
        sessionId: event.sessionId,
        status: "failed",
      },
    });

    if (event.error) {
      this.broadcastToRoom(`workflow:${event.sessionId}`, {
        type: "workflow:status",
        payload: {
          sessionId: event.sessionId,
          phase: "error",
          wave: 0,
          totalWaves: 1,
          blocker: event.error,
        },
      });
    }
  };

  constructor(
    private readonly roomManager: RoomManager<WsData>,
    private readonly lifecycle: WorkflowLifecycleManager,
  ) {
    this.lifecycle.on("workflow:started", this.onWorkflowStarted);
    this.lifecycle.on("workflow:status", this.onWorkflowStatus);
    this.lifecycle.on("workflow:completed", this.onWorkflowCompleted);
    this.lifecycle.on("workflow:failed", this.onWorkflowFailed);

    this.heartbeatTimer = setInterval(() => {
      this.runHeartbeat();
    }, HEARTBEAT_INTERVAL_MS);
  }

  get websocket(): WebSocketHandler<WsData> {
    return {
      open: (ws) => {
        this.handleOpen(ws);
      },
      message: (ws, message) => {
        this.handleMessage(ws, message);
      },
      close: (ws) => {
        this.handleClose(ws);
      },
      drain: () => {
        return;
      },
      ping: () => {
        return;
      },
      pong: () => {
        return;
      },
    };
  }

  upgrade(req: Request, server: Server<WsData>): Response | undefined {
    const upgradeHeader = req.headers.get("upgrade");
    if (!upgradeHeader || upgradeHeader.toLowerCase() !== "websocket") {
      return undefined;
    }

    const upgraded = server.upgrade(req, {
      data: {
        rooms: new Set<string>(),
        connectedAt: Date.now(),
        lastPong: Date.now(),
      },
    });

    if (!upgraded) {
      return new Response("WebSocket upgrade failed", { status: 400 });
    }

    return undefined;
  }

  destroy(): void {
    clearInterval(this.heartbeatTimer);

    this.lifecycle.off("workflow:started", this.onWorkflowStarted);
    this.lifecycle.off("workflow:status", this.onWorkflowStatus);
    this.lifecycle.off("workflow:completed", this.onWorkflowCompleted);
    this.lifecycle.off("workflow:failed", this.onWorkflowFailed);

    for (const socket of this.activeSockets) {
      socket.close(1001, "Server shutting down");
    }
    this.activeSockets.clear();
  }

  private handleOpen(ws: ServerWebSocket<WsData>): void {
    ws.data = {
      rooms: new Set<string>(),
      connectedAt: ws.data?.connectedAt ?? Date.now(),
      lastPong: Date.now(),
    };
    this.activeSockets.add(ws);
  }

  private handleMessage(
    ws: ServerWebSocket<WsData>,
    rawMessage: string | ArrayBuffer | Uint8Array,
  ): void {
    const text = this.messageToString(rawMessage);
    if (!text) {
      ws.close(1003, "Unsupported message format");
      return;
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(text);
    } catch {
      ws.close(1007, "Invalid JSON payload");
      return;
    }

    const parsedMessage = ClientMessageSchema.safeParse(parsedJson);
    if (!parsedMessage.success) {
      ws.close(1008, "Invalid message schema");
      return;
    }

    const message = parsedMessage.data;
    switch (message.type) {
      case "join": {
        this.roomManager.join(ws, message.payload.room);
        ws.data.rooms = this.roomManager.getRooms(ws);
        break;
      }
      case "leave": {
        this.roomManager.leave(ws, message.payload.room);
        ws.data.rooms = this.roomManager.getRooms(ws);
        break;
      }
      case "pong": {
        ws.data.lastPong = Date.now();
        break;
      }
    }
  }

  private handleClose(ws: ServerWebSocket<WsData>): void {
    this.roomManager.leaveAll(ws);
    this.activeSockets.delete(ws);
  }

  private runHeartbeat(): void {
    const now = Date.now();
    for (const ws of this.activeSockets) {
      if (now - ws.data.lastPong > HEARTBEAT_INTERVAL_MS + HEARTBEAT_TIMEOUT_MS) {
        this.roomManager.leaveAll(ws);
        this.activeSockets.delete(ws);
        ws.close(1008, "Heartbeat timeout");
        continue;
      }

      this.sendJson(ws, {
        type: "ping",
        payload: {
          timestamp: new Date(now).toISOString(),
        },
      });
    }
  }

  private resolveProjectId(sessionId: string): string | undefined {
    const cached = this.sessionProjectMap.get(sessionId);
    if (cached) {
      return cached;
    }

    const session = this.lifecycle.getSession(sessionId) as WorkflowSession | null;
    if (!session) {
      return undefined;
    }

    this.sessionProjectMap.set(sessionId, session.projectId);
    return session.projectId;
  }

  private broadcastToRoom(room: string, message: ServerMessage): void {
    const serialized = this.serializeServerMessage(message);
    if (!serialized) {
      return;
    }

    this.roomManager.broadcast(room, serialized);
  }

  private sendJson(ws: ServerWebSocket<WsData>, message: ServerMessage): void {
    const serialized = this.serializeServerMessage(message);
    if (!serialized) {
      return;
    }

    ws.send(serialized);
  }

  private serializeServerMessage(message: ServerMessage): string | undefined {
    const validated = ServerMessageSchema.safeParse(message);
    if (!validated.success) {
      return undefined;
    }

    return JSON.stringify(validated.data);
  }

  private messageToString(
    message: string | ArrayBuffer | Uint8Array,
  ): string | undefined {
    if (typeof message === "string") {
      return message;
    }

    if (message instanceof ArrayBuffer) {
      return new TextDecoder().decode(new Uint8Array(message));
    }

    if (message instanceof Uint8Array) {
      return new TextDecoder().decode(message);
    }

    return undefined;
  }
}
