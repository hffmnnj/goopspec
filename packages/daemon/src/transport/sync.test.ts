import type { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { createTestDatabase } from "../db/connection.js";
import { createSyncRoutes } from "../routes/sync.js";
import { SyncService } from "./sync.js";
import type { SyncResponse, MissedEventsResponse } from "./sync.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function seedProject(
  db: Database,
  id: string,
  name = `Project ${id}`,
): void {
  const now = new Date().toISOString();
  db.query(
    "INSERT INTO projects (id, name, path, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run(id, name, `/tmp/${id}`, now, now);
}

function seedWorkItem(
  db: Database,
  id: string,
  projectId: string,
): void {
  const now = new Date().toISOString();
  db.query(
    "INSERT INTO work_items (id, project_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run(id, projectId, `Work Item ${id}`, now, now);
}

function seedSession(
  db: Database,
  id: string,
  projectId: string,
  status: string,
  opts: {
    phase?: string;
    currentWave?: number;
    totalWaves?: number;
    activeAgent?: string;
    workItemId?: string;
  } = {},
): void {
  const now = new Date().toISOString();
  db.query(
    `INSERT INTO workflow_sessions
       (id, project_id, work_item_id, workflow_id, phase, current_wave, total_waves, status, active_agent, started_at, completed_at, updated_at)
     VALUES (?, ?, ?, 'default', ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    projectId,
    opts.workItemId ?? null,
    opts.phase ?? "idle",
    opts.currentWave ?? 0,
    opts.totalWaves ?? 0,
    status,
    opts.activeAgent ?? null,
    now,
    status === "completed" || status === "failed" ? now : null,
    now,
  );
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
// SyncService.getProjectSnapshot
// ---------------------------------------------------------------------------

describe("SyncService.getProjectSnapshot", () => {
  let db: Database;

  beforeEach(() => {
    db = createTestDatabase();
  });

  afterEach(() => {
    db.close();
  });

  it("returns null for an unknown project", () => {
    const service = new SyncService(db);
    const result = service.getProjectSnapshot("nonexistent");
    expect(result).toBeNull();
  });

  it("returns a full snapshot for a known project", () => {
    seedProject(db, "proj-1", "My Project");
    seedSession(db, "sess-running", "proj-1", "running", { phase: "execute", currentWave: 2, totalWaves: 5 });
    seedSession(db, "sess-completed", "proj-1", "completed", { phase: "complete" });

    const now = Date.now();
    seedEvent(db, "evt-1", "sess-running", "workflow:started", { projectId: "proj-1" }, new Date(now - 2000).toISOString());
    seedEvent(db, "evt-2", "sess-running", "workflow:status", { phase: "execute" }, new Date(now - 1000).toISOString());

    const service = new SyncService(db);
    const result = service.getProjectSnapshot("proj-1");

    expect(result).not.toBeNull();
    const snapshot = result as SyncResponse;

    // Project
    expect(snapshot.project.id).toBe("proj-1");
    expect(snapshot.project.name).toBe("My Project");

    // Active sessions (running)
    expect(snapshot.activeSessions).toHaveLength(1);
    expect(snapshot.activeSessions[0].id).toBe("sess-running");
    expect(snapshot.activeSessions[0].status).toBe("running");
    expect(snapshot.activeSessions[0].phase).toBe("execute");
    expect(snapshot.activeSessions[0].currentWave).toBe(2);
    expect(snapshot.activeSessions[0].totalWaves).toBe(5);

    // Recent sessions (completed/failed)
    expect(snapshot.recentSessions).toHaveLength(1);
    expect(snapshot.recentSessions[0].id).toBe("sess-completed");
    expect(snapshot.recentSessions[0].status).toBe("completed");

    // Recent events
    expect(snapshot.recentEvents).toHaveLength(2);
    expect(snapshot.recentEvents[0].id).toBe("evt-1");
    expect(snapshot.recentEvents[1].id).toBe("evt-2");

    // Server time
    expect(snapshot.serverTime).toBeDefined();
    expect(new Date(snapshot.serverTime).getTime()).toBeGreaterThan(0);
  });

  it("separates active sessions (pending, running, paused) from terminal sessions", () => {
    seedProject(db, "proj-1");
    seedSession(db, "sess-pending", "proj-1", "pending");
    seedSession(db, "sess-running", "proj-1", "running");
    seedSession(db, "sess-paused", "proj-1", "paused");
    seedSession(db, "sess-completed", "proj-1", "completed");
    seedSession(db, "sess-failed", "proj-1", "failed");

    const service = new SyncService(db);
    const result = service.getProjectSnapshot("proj-1") as SyncResponse;

    const activeIds = result.activeSessions.map((s) => s.id).sort();
    expect(activeIds).toEqual(["sess-paused", "sess-pending", "sess-running"]);

    const recentIds = result.recentSessions.map((s) => s.id).sort();
    expect(recentIds).toEqual(["sess-completed", "sess-failed"]);
  });

  it("limits recent terminal sessions to 20", () => {
    seedProject(db, "proj-1");
    for (let i = 0; i < 25; i++) {
      seedSession(db, `sess-${i}`, "proj-1", "completed");
    }

    const service = new SyncService(db);
    const result = service.getProjectSnapshot("proj-1") as SyncResponse;

    expect(result.recentSessions).toHaveLength(20);
  });

  it("limits recent events to 100", () => {
    seedProject(db, "proj-1");
    seedSession(db, "sess-1", "proj-1", "running");

    const baseTime = Date.now();
    for (let i = 0; i < 120; i++) {
      seedEvent(
        db,
        `evt-${i}`,
        "sess-1",
        "workflow:status",
        { i },
        new Date(baseTime + i * 100).toISOString(),
      );
    }

    const service = new SyncService(db);
    const result = service.getProjectSnapshot("proj-1") as SyncResponse;

    expect(result.recentEvents).toHaveLength(100);
  });

  it("returns empty arrays when project has no sessions or events", () => {
    seedProject(db, "proj-empty");

    const service = new SyncService(db);
    const result = service.getProjectSnapshot("proj-empty") as SyncResponse;

    expect(result.activeSessions).toEqual([]);
    expect(result.recentSessions).toEqual([]);
    expect(result.recentEvents).toEqual([]);
  });

  it("does not include sessions from other projects", () => {
    seedProject(db, "proj-a");
    seedProject(db, "proj-b");
    seedSession(db, "sess-a", "proj-a", "running");
    seedSession(db, "sess-b", "proj-b", "running");

    const service = new SyncService(db);
    const result = service.getProjectSnapshot("proj-a") as SyncResponse;

    expect(result.activeSessions).toHaveLength(1);
    expect(result.activeSessions[0].id).toBe("sess-a");
  });

  it("maps optional fields correctly (workItemId, activeAgent, blockerDescription)", () => {
    seedProject(db, "proj-1");
    seedWorkItem(db, "item-1", "proj-1");
    seedSession(db, "sess-1", "proj-1", "running", {
      workItemId: "item-1",
      activeAgent: "goop-executor-high",
    });

    const service = new SyncService(db);
    const result = service.getProjectSnapshot("proj-1") as SyncResponse;

    expect(result.activeSessions[0].workItemId).toBe("item-1");
    expect(result.activeSessions[0].activeAgent).toBe("goop-executor-high");
    expect(result.activeSessions[0].blockerDescription).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// SyncService.getMissedEvents
// ---------------------------------------------------------------------------

describe("SyncService.getMissedEvents", () => {
  let db: Database;

  beforeEach(() => {
    db = createTestDatabase();
  });

  afterEach(() => {
    db.close();
  });

  it("returns events after the given timestamp", () => {
    seedProject(db, "proj-1");
    seedSession(db, "sess-1", "proj-1", "running");

    const t1 = "2026-03-10T10:00:00.000Z";
    const t2 = "2026-03-10T10:01:00.000Z";
    const t3 = "2026-03-10T10:02:00.000Z";

    seedEvent(db, "evt-1", "sess-1", "workflow:started", {}, t1);
    seedEvent(db, "evt-2", "sess-1", "workflow:status", { phase: "plan" }, t2);
    seedEvent(db, "evt-3", "sess-1", "workflow:status", { phase: "execute" }, t3);

    const service = new SyncService(db);
    const result = service.getMissedEvents("proj-1", t1, 100);

    expect(result.events).toHaveLength(2);
    expect(result.events[0].id).toBe("evt-2");
    expect(result.events[1].id).toBe("evt-3");
    expect(result.hasMore).toBe(false);
  });

  it("returns hasMore=true when events exceed the limit", () => {
    seedProject(db, "proj-1");
    seedSession(db, "sess-1", "proj-1", "running");

    const baseTime = new Date("2026-03-10T10:00:00.000Z").getTime();
    for (let i = 0; i < 10; i++) {
      seedEvent(
        db,
        `evt-${i}`,
        "sess-1",
        "workflow:status",
        { i },
        new Date(baseTime + (i + 1) * 1000).toISOString(),
      );
    }

    const service = new SyncService(db);
    const result = service.getMissedEvents(
      "proj-1",
      "2026-03-10T10:00:00.000Z",
      5,
    );

    expect(result.events).toHaveLength(5);
    expect(result.hasMore).toBe(true);
  });

  it("caps limit at 1000", () => {
    seedProject(db, "proj-1");
    seedSession(db, "sess-1", "proj-1", "running");

    // Seed 5 events to verify the service doesn't crash with large limit
    const baseTime = new Date("2026-03-10T10:00:00.000Z").getTime();
    for (let i = 0; i < 5; i++) {
      seedEvent(
        db,
        `evt-${i}`,
        "sess-1",
        "workflow:status",
        { i },
        new Date(baseTime + (i + 1) * 1000).toISOString(),
      );
    }

    const service = new SyncService(db);
    // Pass a limit > 1000 — should be clamped
    const result = service.getMissedEvents(
      "proj-1",
      "2026-03-10T10:00:00.000Z",
      5000,
    );

    expect(result.events).toHaveLength(5);
    expect(result.hasMore).toBe(false);
  });

  it("clamps limit to minimum of 1", () => {
    seedProject(db, "proj-1");
    seedSession(db, "sess-1", "proj-1", "running");

    const baseTime = new Date("2026-03-10T10:00:00.000Z").getTime();
    seedEvent(db, "evt-1", "sess-1", "workflow:status", {}, new Date(baseTime + 1000).toISOString());
    seedEvent(db, "evt-2", "sess-1", "workflow:status", {}, new Date(baseTime + 2000).toISOString());

    const service = new SyncService(db);
    const result = service.getMissedEvents("proj-1", "2026-03-10T10:00:00.000Z", 0);

    expect(result.events).toHaveLength(1);
    expect(result.hasMore).toBe(true);
  });

  it("returns empty events when project has no sessions", () => {
    seedProject(db, "proj-empty");

    const service = new SyncService(db);
    const result = service.getMissedEvents("proj-empty", "2026-01-01T00:00:00Z", 100);

    expect(result.events).toEqual([]);
    expect(result.hasMore).toBe(false);
  });

  it("only returns events for sessions belonging to the project", () => {
    seedProject(db, "proj-a");
    seedProject(db, "proj-b");
    seedSession(db, "sess-a", "proj-a", "running");
    seedSession(db, "sess-b", "proj-b", "running");

    const t1 = "2026-03-10T10:00:00.000Z";
    const t2 = "2026-03-10T10:01:00.000Z";
    const t3 = "2026-03-10T10:02:00.000Z";

    seedEvent(db, "evt-a1", "sess-a", "workflow:started", {}, t2);
    seedEvent(db, "evt-b1", "sess-b", "workflow:started", {}, t3);

    const service = new SyncService(db);
    const result = service.getMissedEvents("proj-a", t1, 100);

    expect(result.events).toHaveLength(1);
    expect(result.events[0].id).toBe("evt-a1");
  });

  it("returns events in ascending timestamp order", () => {
    seedProject(db, "proj-1");
    seedSession(db, "sess-1", "proj-1", "running");

    const t1 = "2026-03-10T10:00:01.000Z";
    const t2 = "2026-03-10T10:00:02.000Z";
    const t3 = "2026-03-10T10:00:03.000Z";

    // Insert out of order
    seedEvent(db, "evt-3", "sess-1", "workflow:status", {}, t3);
    seedEvent(db, "evt-1", "sess-1", "workflow:started", {}, t1);
    seedEvent(db, "evt-2", "sess-1", "workflow:status", {}, t2);

    const service = new SyncService(db);
    const result = service.getMissedEvents("proj-1", "2026-03-10T10:00:00.000Z", 100);

    expect(result.events.map((e) => e.id)).toEqual(["evt-1", "evt-2", "evt-3"]);
  });

  it("parses event data JSON correctly", () => {
    seedProject(db, "proj-1");
    seedSession(db, "sess-1", "proj-1", "running");

    seedEvent(
      db,
      "evt-1",
      "sess-1",
      "workflow:status",
      { phase: "execute", wave: 3, totalWaves: 5 },
      "2026-03-10T10:01:00.000Z",
    );

    const service = new SyncService(db);
    const result = service.getMissedEvents("proj-1", "2026-03-10T10:00:00.000Z", 100);

    expect(result.events[0].data).toEqual({ phase: "execute", wave: 3, totalWaves: 5 });
  });
});

// ---------------------------------------------------------------------------
// createSyncRoutes (Hono route integration)
// ---------------------------------------------------------------------------

describe("createSyncRoutes", () => {
  let db: Database;

  beforeEach(() => {
    db = createTestDatabase();
  });

  afterEach(() => {
    db.close();
  });

  it("GET /sync/:projectId returns 404 for unknown project", async () => {
    const app = createSyncRoutes(db);
    const res = await app.request("/sync/nonexistent");

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Project not found");
  });

  it("GET /sync/:projectId returns 200 with snapshot for known project", async () => {
    seedProject(db, "proj-1", "Test Project");
    seedSession(db, "sess-1", "proj-1", "running");

    const app = createSyncRoutes(db);
    const res = await app.request("/sync/proj-1");

    expect(res.status).toBe(200);
    const body = (await res.json()) as SyncResponse;
    expect(body.project.id).toBe("proj-1");
    expect(body.activeSessions).toHaveLength(1);
    expect(body.serverTime).toBeDefined();
  });

  it("GET /sync/:projectId/events returns 400 when 'after' is missing", async () => {
    const app = createSyncRoutes(db);
    const res = await app.request("/sync/proj-1/events");

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("after");
  });

  it("GET /sync/:projectId/events returns events after timestamp", async () => {
    seedProject(db, "proj-1");
    seedSession(db, "sess-1", "proj-1", "running");

    const t1 = "2026-03-10T10:00:00.000Z";
    const t2 = "2026-03-10T10:01:00.000Z";
    seedEvent(db, "evt-1", "sess-1", "workflow:started", {}, t1);
    seedEvent(db, "evt-2", "sess-1", "workflow:status", { phase: "plan" }, t2);

    const app = createSyncRoutes(db);
    const res = await app.request(`/sync/proj-1/events?after=${t1}`);

    expect(res.status).toBe(200);
    const body = (await res.json()) as MissedEventsResponse;
    expect(body.events).toHaveLength(1);
    expect(body.events[0].id).toBe("evt-2");
    expect(body.hasMore).toBe(false);
  });

  it("GET /sync/:projectId/events respects limit parameter", async () => {
    seedProject(db, "proj-1");
    seedSession(db, "sess-1", "proj-1", "running");

    const baseTime = new Date("2026-03-10T10:00:00.000Z").getTime();
    for (let i = 0; i < 10; i++) {
      seedEvent(
        db,
        `evt-${i}`,
        "sess-1",
        "workflow:status",
        { i },
        new Date(baseTime + (i + 1) * 1000).toISOString(),
      );
    }

    const app = createSyncRoutes(db);
    const res = await app.request(
      `/sync/proj-1/events?after=2026-03-10T10:00:00.000Z&limit=3`,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as MissedEventsResponse;
    expect(body.events).toHaveLength(3);
    expect(body.hasMore).toBe(true);
  });

  it("GET /sync/:projectId/events defaults limit to 100", async () => {
    seedProject(db, "proj-1");
    seedSession(db, "sess-1", "proj-1", "running");

    const baseTime = new Date("2026-03-10T10:00:00.000Z").getTime();
    for (let i = 0; i < 110; i++) {
      seedEvent(
        db,
        `evt-${String(i).padStart(4, "0")}`,
        "sess-1",
        "workflow:status",
        { i },
        new Date(baseTime + (i + 1) * 100).toISOString(),
      );
    }

    const app = createSyncRoutes(db);
    const res = await app.request(
      `/sync/proj-1/events?after=2026-03-10T10:00:00.000Z`,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as MissedEventsResponse;
    expect(body.events).toHaveLength(100);
    expect(body.hasMore).toBe(true);
  });
});
