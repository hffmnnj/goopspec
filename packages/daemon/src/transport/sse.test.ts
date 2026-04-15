import { afterEach, describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { EventEmitter } from "events";
import { SCHEMA_STATEMENTS } from "../db/schema.js";
import { formatSSEEvent, SseManager } from "./sse.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

class MockLifecycle extends EventEmitter {
  getSession(sessionId: string): { projectId: string } | null {
    if (sessionId === "session-a") {
      return { projectId: "project-a" };
    }
    if (sessionId === "session-b") {
      return { projectId: "project-b" };
    }
    return null;
  }
}

/** Read all currently buffered chunks from a stream reader. */
async function drainReader(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  maxReads = 10,
): Promise<string> {
  const decoder = new TextDecoder();
  let result = "";
  for (let i = 0; i < maxReads; i++) {
    const readPromise = reader.read();
    const timeoutPromise = new Promise<{ value: undefined; done: true }>((resolve) =>
      setTimeout(() => resolve({ value: undefined, done: true }), 50),
    );
    const { value, done } = await Promise.race([readPromise, timeoutPromise]);
    if (done || !value) break;
    result += decoder.decode(value);
  }
  return result;
}

function createTestDb(): Database {
  const db = new Database(":memory:");
  for (const stmt of SCHEMA_STATEMENTS) {
    db.exec(stmt);
  }
  return db;
}

function seedProject(db: Database, id: string): void {
  db.query(
    "INSERT INTO projects (id, name, path, created_at, updated_at) VALUES (?, ?, ?, datetime('now'), datetime('now'))",
  ).run(id, `Project ${id}`, `/tmp/${id}`);
}

function seedSession(db: Database, sessionId: string, projectId: string): void {
  db.query(
    `INSERT INTO workflow_sessions (id, project_id, workflow_id, phase, status, started_at, updated_at)
     VALUES (?, ?, 'default', 'idle', 'running', datetime('now'), datetime('now'))`,
  ).run(sessionId, projectId);
}

function seedEvent(
  db: Database,
  id: string,
  sessionId: string,
  type: string,
  data: Record<string, unknown>,
  timestamp: string,
): void {
  db.query(
    "INSERT INTO workflow_events (id, session_id, type, data, timestamp) VALUES (?, ?, ?, ?, ?)",
  ).run(id, sessionId, type, JSON.stringify(data), timestamp);
}

// ---------------------------------------------------------------------------
// formatSSEEvent
// ---------------------------------------------------------------------------

describe("formatSSEEvent", () => {
  it("formats a basic SSE event with id, event type, and JSON data", () => {
    const result = formatSSEEvent("1", "ping", { timestamp: "2026-01-01T00:00:00Z" });
    expect(result).toBe(
      'id: 1\nevent: ping\ndata: {"timestamp":"2026-01-01T00:00:00Z"}\n\n',
    );
  });

  it("serializes complex payloads as JSON", () => {
    const payload = { sessionId: "abc", phase: "execute", wave: 2, totalWaves: 5 };
    const result = formatSSEEvent("42", "workflow:status", payload);

    expect(result).toContain("id: 42\n");
    expect(result).toContain("event: workflow:status\n");
    expect(result).toContain(`data: ${JSON.stringify(payload)}\n`);
    expect(result).toEndWith("\n\n");
  });

  it("handles null and undefined values in data", () => {
    const result = formatSSEEvent("3", "test", { value: null });
    expect(result).toContain('data: {"value":null}\n');
  });

  it("uses the event id as-is (string)", () => {
    const uuid = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
    const result = formatSSEEvent(uuid, "workflow:started", {});
    expect(result).toContain(`id: ${uuid}\n`);
  });
});

// ---------------------------------------------------------------------------
// SseManager
// ---------------------------------------------------------------------------

describe("SseManager", () => {
  const instances: SseManager[] = [];
  let db: Database;

  afterEach(() => {
    for (const instance of instances) {
      instance.destroy();
    }
    instances.length = 0;
    if (db) {
      db.close();
    }
  });

  it("creates a Hono handler with the SSE route", () => {
    db = createTestDb();
    const lifecycle = new MockLifecycle();
    const manager = new SseManager(db, lifecycle as never);
    instances.push(manager);

    const handler = manager.createHandler();
    expect(handler).toBeDefined();
    expect(typeof handler.fetch).toBe("function");
  });

  it("returns correct SSE headers from the endpoint", async () => {
    db = createTestDb();
    seedProject(db, "project-a");
    const lifecycle = new MockLifecycle();
    const manager = new SseManager(db, lifecycle as never);
    instances.push(manager);

    const handler = manager.createHandler();
    const req = new Request("http://localhost/events/project-a");
    const res = await handler.fetch(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    expect(res.headers.get("Cache-Control")).toBe("no-cache");
    expect(res.headers.get("X-Accel-Buffering")).toBe("no");

    // Cancel the stream to clean up
    const reader = res.body?.getReader();
    await reader?.cancel();
  });

  it("sends an initial ping event on connect", async () => {
    db = createTestDb();
    seedProject(db, "project-a");
    const lifecycle = new MockLifecycle();
    const manager = new SseManager(db, lifecycle as never);
    instances.push(manager);

    const handler = manager.createHandler();
    const req = new Request("http://localhost/events/project-a");
    const res = await handler.fetch(req);

    const reader = res.body!.getReader();
    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);

    expect(text).toContain("id: 1\n");
    expect(text).toContain("event: ping\n");
    expect(text).toContain("data: {");
    expect(text).toContain('"timestamp"');

    await reader.cancel();
  });

  it("tracks active connections per project", async () => {
    db = createTestDb();
    seedProject(db, "project-a");
    const lifecycle = new MockLifecycle();
    const manager = new SseManager(db, lifecycle as never);
    instances.push(manager);

    expect(manager.getConnectionCount("project-a")).toBe(0);

    const handler = manager.createHandler();
    const res = await handler.fetch(new Request("http://localhost/events/project-a"));
    const reader = res.body!.getReader();

    // Read the initial ping to ensure start() has run
    await reader.read();

    expect(manager.getConnectionCount("project-a")).toBe(1);

    await reader.cancel();

    // After cancel, connection should be cleaned up
    // Give a tick for the cancel callback to fire
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(manager.getConnectionCount("project-a")).toBe(0);
  });

  it("streams lifecycle events filtered by projectId", async () => {
    db = createTestDb();
    seedProject(db, "project-a");
    const lifecycle = new MockLifecycle();
    const manager = new SseManager(db, lifecycle as never);
    instances.push(manager);

    const handler = manager.createHandler();
    const res = await handler.fetch(new Request("http://localhost/events/project-a"));
    const reader = res.body!.getReader();

    // Read initial ping
    await reader.read();

    // Emit a workflow:started event for project-a
    lifecycle.emit("workflow:started", {
      sessionId: "session-a",
      projectId: "project-a",
    });

    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);

    expect(text).toContain("event: workflow:started\n");
    expect(text).toContain('"sessionId":"session-a"');
    expect(text).toContain('"projectId":"project-a"');

    await reader.cancel();
  });

  it("does not stream events for other projects", async () => {
    db = createTestDb();
    seedProject(db, "project-a");
    seedProject(db, "project-b");
    const lifecycle = new MockLifecycle();
    const manager = new SseManager(db, lifecycle as never);
    instances.push(manager);

    const handler = manager.createHandler();
    const res = await handler.fetch(new Request("http://localhost/events/project-a"));
    const reader = res.body!.getReader();

    // Read initial ping
    await reader.read();

    // Emit event for project-b — should NOT appear on project-a stream
    lifecycle.emit("workflow:started", {
      sessionId: "session-b",
      projectId: "project-b",
    });

    // Emit event for project-a — should appear
    lifecycle.emit("workflow:started", {
      sessionId: "session-a",
      projectId: "project-a",
    });

    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);

    expect(text).toContain('"projectId":"project-a"');
    expect(text).not.toContain('"projectId":"project-b"');

    await reader.cancel();
  });

  it("streams workflow:status events resolved by sessionId", async () => {
    db = createTestDb();
    seedProject(db, "project-a");
    seedSession(db, "session-a", "project-a");
    const lifecycle = new MockLifecycle();
    const manager = new SseManager(db, lifecycle as never);
    instances.push(manager);

    const handler = manager.createHandler();
    const res = await handler.fetch(new Request("http://localhost/events/project-a"));
    const reader = res.body!.getReader();

    // Read initial ping
    await reader.read();

    lifecycle.emit("workflow:status", {
      sessionId: "session-a",
      phase: "execute",
      wave: 2,
      totalWaves: 5,
    });

    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);

    expect(text).toContain("event: workflow:status\n");
    expect(text).toContain('"phase":"execute"');
    expect(text).toContain('"wave":2');

    await reader.cancel();
  });

  it("streams workflow:completed events", async () => {
    db = createTestDb();
    seedProject(db, "project-a");
    seedSession(db, "session-a", "project-a");
    const lifecycle = new MockLifecycle();
    const manager = new SseManager(db, lifecycle as never);
    instances.push(manager);

    const handler = manager.createHandler();
    const res = await handler.fetch(new Request("http://localhost/events/project-a"));
    const reader = res.body!.getReader();

    await reader.read();

    lifecycle.emit("workflow:completed", {
      sessionId: "session-a",
      status: "completed",
    });

    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);

    expect(text).toContain("event: workflow:completed\n");
    expect(text).toContain('"status":"completed"');

    await reader.cancel();
  });

  it("maps workflow:failed to workflow:completed with status failed", async () => {
    db = createTestDb();
    seedProject(db, "project-a");
    seedSession(db, "session-a", "project-a");
    const lifecycle = new MockLifecycle();
    const manager = new SseManager(db, lifecycle as never);
    instances.push(manager);

    const handler = manager.createHandler();
    const res = await handler.fetch(new Request("http://localhost/events/project-a"));
    const reader = res.body!.getReader();

    await reader.read();

    lifecycle.emit("workflow:failed", {
      sessionId: "session-a",
      error: "something broke",
    });

    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);

    expect(text).toContain("event: workflow:completed\n");
    expect(text).toContain('"status":"failed"');

    await reader.cancel();
  });
});

// ---------------------------------------------------------------------------
// Event replay
// ---------------------------------------------------------------------------

describe("SseManager replay", () => {
  let db: Database;
  const instances: SseManager[] = [];

  afterEach(() => {
    for (const instance of instances) {
      instance.destroy();
    }
    instances.length = 0;
    if (db) {
      db.close();
    }
  });

  it("replays historical events after Last-Event-ID", async () => {
    db = createTestDb();
    seedProject(db, "project-a");
    seedSession(db, "session-a", "project-a");

    // Use recent timestamps so they pass the 24h cutoff filter
    const now = Date.now();
    const ts1 = new Date(now - 3000).toISOString();
    const ts2 = new Date(now - 2000).toISOString();
    const ts3 = new Date(now - 1000).toISOString();

    seedEvent(db, "evt-1", "session-a", "workflow:started", { projectId: "project-a" }, ts1);
    seedEvent(db, "evt-2", "session-a", "workflow:status", { phase: "plan" }, ts2);
    seedEvent(db, "evt-3", "session-a", "workflow:status", { phase: "execute" }, ts3);

    const lifecycle = new MockLifecycle();
    const manager = new SseManager(db, lifecycle as never);
    instances.push(manager);

    const handler = manager.createHandler();
    const req = new Request("http://localhost/events/project-a", {
      headers: { "Last-Event-ID": "evt-1" },
    });
    const res = await handler.fetch(req);
    const reader = res.body!.getReader();

    // Read all enqueued data (ping + replay may arrive in separate chunks)
    const fullText = await drainReader(reader);

    expect(fullText).toContain("event: ping\n");
    expect(fullText).toContain("id: evt-2\n");
    expect(fullText).toContain("id: evt-3\n");
    expect(fullText).not.toContain("id: evt-1\n");

    await reader.cancel();
  });

  it("does not replay events from other projects", async () => {
    db = createTestDb();
    seedProject(db, "project-a");
    seedProject(db, "project-b");
    seedSession(db, "session-a", "project-a");
    seedSession(db, "session-b", "project-b");

    const now = Date.now();
    const ts1 = new Date(now - 3000).toISOString();
    const ts2 = new Date(now - 2000).toISOString();
    const ts3 = new Date(now - 1000).toISOString();

    seedEvent(db, "evt-1", "session-a", "workflow:started", {}, ts1);
    seedEvent(db, "evt-2", "session-b", "workflow:started", {}, ts2);
    seedEvent(db, "evt-3", "session-a", "workflow:status", { phase: "execute" }, ts3);

    const lifecycle = new MockLifecycle();
    const manager = new SseManager(db, lifecycle as never);
    instances.push(manager);

    const handler = manager.createHandler();
    const req = new Request("http://localhost/events/project-a", {
      headers: { "Last-Event-ID": "evt-1" },
    });
    const res = await handler.fetch(req);
    const reader = res.body!.getReader();

    // Read all enqueued data
    const fullText = await drainReader(reader);

    // Should contain evt-3 (project-a, after evt-1) but NOT evt-2 (project-b)
    expect(fullText).toContain("id: evt-3\n");
    expect(fullText).not.toContain("id: evt-2\n");

    await reader.cancel();
  });

  it("replays nothing when no sessions exist for the project", () => {
    db = createTestDb();
    seedProject(db, "project-empty");

    const lifecycle = new MockLifecycle();
    const manager = new SseManager(db, lifecycle as never);
    instances.push(manager);

    // Directly test replayEvents with a mock connection
    const chunks: Uint8Array[] = [];
    const mockConnection = {
      controller: {
        enqueue: (chunk: Uint8Array) => chunks.push(chunk),
      } as unknown as ReadableStreamDefaultController<Uint8Array>,
      keepaliveTimer: setTimeout(() => {}, 0),
      eventCounter: 0,
    };

    manager.replayEvents("project-empty", "some-id", mockConnection);
    clearTimeout(mockConnection.keepaliveTimer);

    expect(chunks.length).toBe(0);
    expect(mockConnection.eventCounter).toBe(0);
  });

  it("handles unknown Last-Event-ID gracefully (uses it as timestamp fallback)", () => {
    db = createTestDb();
    seedProject(db, "project-a");
    seedSession(db, "session-a", "project-a");

    // Use a recent timestamp so it passes the 24h cutoff
    const recentTs = new Date(Date.now() - 1000).toISOString();
    seedEvent(db, "evt-1", "session-a", "workflow:started", {}, recentTs);

    const lifecycle = new MockLifecycle();
    const manager = new SseManager(db, lifecycle as never);
    instances.push(manager);

    const chunks: Uint8Array[] = [];
    const mockConnection = {
      controller: {
        enqueue: (chunk: Uint8Array) => chunks.push(chunk),
      } as unknown as ReadableStreamDefaultController<Uint8Array>,
      keepaliveTimer: setTimeout(() => {}, 0),
      eventCounter: 0,
    };

    // "0" is not in DB, so it falls back to using it as a timestamp string.
    // Since "0" < any ISO timestamp lexicographically, events should be replayed.
    manager.replayEvents("project-a", "0", mockConnection);
    clearTimeout(mockConnection.keepaliveTimer);

    expect(chunks.length).toBe(1);
    const text = new TextDecoder().decode(chunks[0]);
    expect(text).toContain("id: evt-1\n");
  });
});

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

describe("SseManager cleanup", () => {
  it("destroy() clears all connections and intervals", async () => {
    const db = createTestDb();
    seedProject(db, "project-a");
    const lifecycle = new MockLifecycle();
    const manager = new SseManager(db, lifecycle as never);

    const handler = manager.createHandler();
    const res = await handler.fetch(new Request("http://localhost/events/project-a"));
    const reader = res.body!.getReader();
    await reader.read();

    expect(manager.getConnectionCount("project-a")).toBe(1);

    manager.destroy();

    expect(manager.getConnectionCount("project-a")).toBe(0);

    // Cleanup the reader (may already be closed)
    try {
      await reader.cancel();
    } catch {
      // Expected if stream was already closed by destroy
    }

    db.close();
  });

  it("removes lifecycle listeners on destroy", () => {
    const db = createTestDb();
    const lifecycle = new MockLifecycle();
    const manager = new SseManager(db, lifecycle as never);

    const initialListeners = lifecycle.listenerCount("workflow:started");

    // createHandler doesn't add listeners until a connection is made
    manager.destroy();

    expect(lifecycle.listenerCount("workflow:started")).toBe(initialListeners);

    db.close();
  });
});
