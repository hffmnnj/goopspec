import type { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { createTestDatabase } from "../db/index.js";
import { WorkflowLifecycleManager } from "./lifecycle.js";
import type { WorkflowLauncher } from "./launcher.js";

function insertProject(db: Database, id: string, path: string): void {
  const now = new Date().toISOString();
  db.query(
    "INSERT INTO projects (id, name, path, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run(id, "Test Project", path, now, now);
}

function insertWorkItem(db: Database, id: string, projectId: string): void {
  const now = new Date().toISOString();
  db.query(
    "INSERT INTO work_items (id, project_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run(id, projectId, "Test Item", now, now);
}

describe("workflow lifecycle manager", () => {
  let db: Database;

  beforeEach(() => {
    db = createTestDatabase();
    insertProject(db, "project-1", "/tmp/project-1");
  });

  afterEach(() => {
    db.close();
    mock.restore();
  });

  it("spawns a session, calls launcher, and emits started event", async () => {
    const launch = mock(async () => ({
      sessionId: "external-session-1",
      status: "started" as const,
      pid: 4242,
    }));

    const launcher: WorkflowLauncher = {
      name: "test",
      launch,
      isAvailable: async () => true,
    };

    const manager = new WorkflowLifecycleManager(db, launcher);
    const startedPromise = new Promise<{ sessionId: string }>((resolve) => {
      manager.once("workflow:started", (payload) => resolve(payload));
    });

    const session = await manager.spawn({
      projectId: "project-1",
      projectPath: "/tmp/project-1",
    });

    const startedEvent = await startedPromise;

    expect(launch).toHaveBeenCalledTimes(1);
    expect(session.projectId).toBe("project-1");
    expect(session.status).toBe("running");
    expect(startedEvent.sessionId).toBe(session.id);

    const events = manager.getEvents(session.id);
    expect(events.some((event) => event.type === "workflow:spawning")).toBe(true);
    expect(events.some((event) => event.type === "workflow:started")).toBe(true);
  });

  it("marks session failed when launcher fails and emits failure event", async () => {
    const launcher: WorkflowLauncher = {
      name: "test",
      launch: async () => ({
        sessionId: "external-session-2",
        status: "failed",
        error: "launcher down",
      }),
      isAvailable: async () => true,
    };

    const manager = new WorkflowLifecycleManager(db, launcher);
    const failedPromise = new Promise<{ sessionId: string; error?: string }>((resolve) => {
      manager.once("workflow:failed", (payload) => resolve(payload));
    });

    const session = await manager.spawn({
      projectId: "project-1",
      projectPath: "/tmp/project-1",
    });

    const failedEvent = await failedPromise;

    expect(session.status).toBe("failed");
    expect(failedEvent.sessionId).toBe(session.id);
    expect(failedEvent.error).toBe("launcher down");
  });

  it("updates progress fields and emits workflow status event", async () => {
    const manager = new WorkflowLifecycleManager(db, {
      name: "test",
      launch: async () => ({ sessionId: "external-session-3", status: "started" }),
      isAvailable: async () => true,
    });

    const session = await manager.spawn({
      projectId: "project-1",
      projectPath: "/tmp/project-1",
    });

    const statusPromise = new Promise<{
      sessionId: string;
      phase: string;
      wave: number;
      totalWaves: number;
      agent?: string;
    }>((resolve) => {
      manager.once("workflow:status", (payload) => resolve(payload));
    });

    manager.updateProgress(session.id, "execute", 2, 5, "goop-executor-high");

    const statusEvent = await statusPromise;
    const updated = manager.getSession(session.id);

    expect(updated?.phase).toBe("execute");
    expect(updated?.currentWave).toBe(2);
    expect(updated?.totalWaves).toBe(5);
    expect(updated?.activeAgent).toBe("goop-executor-high");
    expect(statusEvent.sessionId).toBe(session.id);
    expect(statusEvent.phase).toBe("execute");
  });

  it("marks session completed and emits workflow completed", async () => {
    const manager = new WorkflowLifecycleManager(db, {
      name: "test",
      launch: async () => ({ sessionId: "external-session-4", status: "started" }),
      isAvailable: async () => true,
    });

    const session = await manager.spawn({
      projectId: "project-1",
      projectPath: "/tmp/project-1",
    });

    const completedPromise = new Promise<{ sessionId: string; status: string }>((resolve) => {
      manager.once("workflow:completed", (payload) => resolve(payload));
    });

    manager.complete(session.id);

    const completedEvent = await completedPromise;
    const updated = manager.getSession(session.id);

    expect(updated?.status).toBe("completed");
    expect(updated?.completedAt).toBeDefined();
    expect(completedEvent).toEqual({
      sessionId: session.id,
      status: "completed",
    });
  });

  it("returns events for a session", async () => {
    const manager = new WorkflowLifecycleManager(db, {
      name: "test",
      launch: async () => ({ sessionId: "external-session-5", status: "started" }),
      isAvailable: async () => true,
    });

    insertWorkItem(db, "item-1", "project-1");
    const session = await manager.spawn({
      projectId: "project-1",
      projectPath: "/tmp/project-1",
      workItemId: "item-1",
    });

    manager.updateProgress(session.id, "execute", 1, 3, "goop-executor-medium");
    manager.complete(session.id);

    const events = manager.getEvents(session.id);

    expect(events.length).toBeGreaterThanOrEqual(4);
    expect(events[0].sessionId).toBe(session.id);
    expect(events.map((event) => event.type)).toEqual(
      expect.arrayContaining([
        "workflow:spawning",
        "workflow:started",
        "workflow:progress",
        "workflow:completed",
      ]),
    );
  });
});
