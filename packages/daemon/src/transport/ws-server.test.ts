import { afterEach, describe, expect, it, mock } from "bun:test";
import { EventEmitter } from "events";
import type { ServerWebSocket } from "bun";
import { RoomManager } from "./rooms.js";
import { WsServer, type WsData } from "./ws-server.js";

interface MockSocket {
  data: WsData;
  send: ReturnType<typeof mock<(message: string) => void>>;
  close: ReturnType<typeof mock<(code?: number, reason?: string) => void>>;
}

class MockLifecycle extends EventEmitter {
  getSession(sessionId: string): { projectId: string } | null {
    if (sessionId === "session-a") {
      return { projectId: "project-a" };
    }
    return null;
  }
}

function createSocket(): MockSocket {
  return {
    data: {
      rooms: new Set<string>(),
      connectedAt: Date.now(),
      lastPong: Date.now(),
    },
    send: mock((_message: string) => undefined),
    close: mock((_code?: number, _reason?: string) => undefined),
  };
}

function asServerSocket(socket: MockSocket): ServerWebSocket<WsData> {
  return socket as unknown as ServerWebSocket<WsData>;
}

describe("RoomManager", () => {
  it("joins, broadcasts, and leaves rooms", () => {
    const roomManager = new RoomManager<WsData>();
    const socketA = createSocket();
    const socketB = createSocket();

    const wsA = asServerSocket(socketA);
    const wsB = asServerSocket(socketB);

    roomManager.join(wsA, "project:alpha");
    roomManager.join(wsB, "project:alpha");

    expect(roomManager.getConnectionCount("project:alpha")).toBe(2);
    roomManager.broadcast("project:alpha", JSON.stringify({ ok: true }));

    expect(socketA.send).toHaveBeenCalledTimes(1);
    expect(socketB.send).toHaveBeenCalledTimes(1);

    roomManager.leave(wsA, "project:alpha");
    expect(roomManager.getConnectionCount("project:alpha")).toBe(1);

    roomManager.leaveAll(wsB);
    expect(roomManager.getConnectionCount("project:alpha")).toBe(0);
  });
});

describe("WsServer", () => {
  const instances: WsServer[] = [];

  afterEach(() => {
    for (const instance of instances) {
      instance.destroy();
    }
    instances.length = 0;
  });

  it("handles join and leave client messages", () => {
    const roomManager = new RoomManager<WsData>();
    const lifecycle = new MockLifecycle();
    const wsServer = new WsServer(roomManager, lifecycle as never);
    instances.push(wsServer);

    const socket = createSocket();
    const ws = asServerSocket(socket);
    const handler = wsServer.websocket;

    handler.open?.(ws);
    handler.message?.(ws, JSON.stringify({ type: "join", payload: { room: "project:p1" } }));
    expect(roomManager.getConnectionCount("project:p1")).toBe(1);

    handler.message?.(ws, JSON.stringify({ type: "leave", payload: { room: "project:p1" } }));
    expect(roomManager.getConnectionCount("project:p1")).toBe(0);
  });

  it("broadcasts lifecycle events to matching rooms only", () => {
    const roomManager = new RoomManager<WsData>();
    const lifecycle = new MockLifecycle();
    const wsServer = new WsServer(roomManager, lifecycle as never);
    instances.push(wsServer);

    const workflowSocket = createSocket();
    const projectSocket = createSocket();
    const otherSocket = createSocket();

    const workflowWs = asServerSocket(workflowSocket);
    const projectWs = asServerSocket(projectSocket);
    const otherWs = asServerSocket(otherSocket);

    const handler = wsServer.websocket;
    handler.open?.(workflowWs);
    handler.open?.(projectWs);
    handler.open?.(otherWs);

    handler.message?.(
      workflowWs,
      JSON.stringify({ type: "join", payload: { room: "workflow:session-a" } }),
    );
    handler.message?.(
      projectWs,
      JSON.stringify({ type: "join", payload: { room: "project:project-a" } }),
    );
    handler.message?.(
      otherWs,
      JSON.stringify({ type: "join", payload: { room: "project:project-b" } }),
    );

    lifecycle.emit("workflow:started", {
      sessionId: "session-a",
      projectId: "project-a",
    });
    lifecycle.emit("workflow:status", {
      sessionId: "session-a",
      phase: "execute",
      wave: 1,
      totalWaves: 3,
    });
    lifecycle.emit("workflow:completed", {
      sessionId: "session-a",
      status: "completed",
    });

    expect(workflowSocket.send).toHaveBeenCalled();
    expect(projectSocket.send).toHaveBeenCalled();

    const sentPayloads = workflowSocket.send.mock.calls.map((call) => {
      return JSON.parse(call[0] as string) as { type: string };
    });

    expect(sentPayloads.some((payload) => payload.type === "workflow:status")).toBe(true);
    expect(sentPayloads.some((payload) => payload.type === "workflow:completed")).toBe(true);

    const otherPayloads = otherSocket.send.mock.calls.map((call) => {
      return JSON.parse(call[0] as string) as { payload?: { projectId?: string } };
    });

    expect(
      otherPayloads.some((payload) => payload.payload?.projectId === "project-a"),
    ).toBe(false);
  });
});
