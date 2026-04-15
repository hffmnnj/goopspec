import type { DaemonConfig, Project, WorkflowEvent, WorkflowSession } from "@goopspec/core";
import type { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import type { Hono } from "hono";
import { createTestDatabase } from "../db/index.js";
import type { WorkflowLauncher } from "../orchestration/launcher.js";
import { createServer } from "../server.js";

const testConfig: DaemonConfig = {
  port: 7331,
  host: "127.0.0.1",
  dbPath: ":memory:",
  logLevel: "info",
};

async function createProject(app: Hono, dir: string): Promise<Project> {
  const response = await app.request("/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Workflow Project",
      path: dir,
    }),
  });

  return (await response.json()) as Project;
}

describe("workflow routes", () => {
  let db: Database;
  let app: Hono;
  let projectDir: string;
  let project: Project;

  beforeEach(async () => {
    db = createTestDatabase();
    projectDir = mkdtempSync(join(tmpdir(), "goopspec-workflow-test-"));
    mkdirSync(join(projectDir, ".goopspec"), { recursive: true });

    const launcher: WorkflowLauncher = {
      name: "test",
      launch: mock(async () => ({
        sessionId: "external-session-route",
        status: "started" as const,
        pid: 8181,
      })),
      isAvailable: async () => true,
    };

    app = createServer({ config: testConfig, db, launcher });
    project = await createProject(app, projectDir);
  });

  afterEach(() => {
    db.close();
    rmSync(projectDir, { recursive: true, force: true });
    mock.restore();
  });

  it("POST /api/workflows/spawn returns 201 with session", async () => {
    const response = await app.request("/api/workflows/spawn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: project.id,
        prompt: "run workflow",
        workflowId: "default",
      }),
    });

    expect(response.status).toBe(201);

    const session = (await response.json()) as WorkflowSession;
    expect(session.projectId).toBe(project.id);
    expect(session.status).toBe("running");
    expect(session.workflowId).toBe("default");
  });

  it("GET /api/workflows returns workflow session list", async () => {
    await app.request("/api/workflows/spawn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: project.id }),
    });

    const response = await app.request(`/api/workflows?projectId=${project.id}`);

    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      sessions: WorkflowSession[];
      count: number;
    };
    expect(body.count).toBe(1);
    expect(body.sessions[0].projectId).toBe(project.id);
  });

  it("GET /api/workflows/:id returns a session", async () => {
    const spawnResponse = await app.request("/api/workflows/spawn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: project.id }),
    });

    const created = (await spawnResponse.json()) as WorkflowSession;

    const response = await app.request(`/api/workflows/${created.id}`);

    expect(response.status).toBe(200);

    const session = (await response.json()) as WorkflowSession;
    expect(session.id).toBe(created.id);
    expect(session.projectId).toBe(project.id);
  });

  it("GET /api/workflows/:id/events returns event list", async () => {
    const spawnResponse = await app.request("/api/workflows/spawn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: project.id }),
    });

    const created = (await spawnResponse.json()) as WorkflowSession;

    const response = await app.request(`/api/workflows/${created.id}/events`);

    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      events: WorkflowEvent[];
      count: number;
    };
    expect(body.count).toBeGreaterThan(0);
    expect(body.events[0].sessionId).toBe(created.id);
  });
});
