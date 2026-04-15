import type { DaemonConfig, Project } from "@goopspec/core";
import type { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createTestDatabase } from "../db/index.js";
import { createServer } from "../server.js";
import type { Hono } from "hono";

const testConfig: DaemonConfig = {
  port: 7331,
  host: "127.0.0.1",
  dbPath: ":memory:",
  logLevel: "info",
};

describe("project routes", () => {
  let db: Database;
  let app: Hono;
  let validProjectDir: string;
  let nonGoopspecDir: string;

  beforeEach(() => {
    db = createTestDatabase();
    app = createServer({ config: testConfig, db });

    validProjectDir = mkdtempSync(join(tmpdir(), "goopspec-test-"));
    mkdirSync(join(validProjectDir, ".goopspec"), { recursive: true });

    nonGoopspecDir = mkdtempSync(join(tmpdir(), "goopspec-test-nogs-"));
  });

  afterEach(() => {
    db.close();
    rmSync(validProjectDir, { recursive: true, force: true });
    rmSync(nonGoopspecDir, { recursive: true, force: true });
  });

  describe("POST /api/projects", () => {
    it("registers a valid project directory and returns 201", async () => {
      const response = await app.request("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Test Project",
          path: validProjectDir,
          description: "A test project",
        }),
      });

      expect(response.status).toBe(201);

      const project = (await response.json()) as Project;
      expect(project.id).toBeDefined();
      expect(project.name).toBe("Test Project");
      expect(project.path).toBe(validProjectDir);
      expect(project.description).toBe("A test project");
      expect(project.createdAt).toBeDefined();
      expect(project.updatedAt).toBeDefined();
    });

    it("registers a project without description", async () => {
      const response = await app.request("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Minimal Project",
          path: validProjectDir,
        }),
      });

      expect(response.status).toBe(201);

      const project = (await response.json()) as Project;
      expect(project.name).toBe("Minimal Project");
      expect(project.description).toBeUndefined();
    });

    it("returns 400 for non-existent directory", async () => {
      const response = await app.request("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Ghost Project",
          path: "/tmp/this-directory-does-not-exist-ever-12345",
        }),
      });

      expect(response.status).toBe(400);

      const body = (await response.json()) as { error: string };
      expect(body.error).toContain("does not exist");
    });

    it("returns 400 for directory without .goopspec/", async () => {
      const response = await app.request("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Not GoopSpec",
          path: nonGoopspecDir,
        }),
      });

      expect(response.status).toBe(400);

      const body = (await response.json()) as { error: string };
      expect(body.error).toContain("not a GoopSpec project");
    });

    it("returns 400 for duplicate path registration", async () => {
      await app.request("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "First",
          path: validProjectDir,
        }),
      });

      const response = await app.request("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Duplicate",
          path: validProjectDir,
        }),
      });

      expect(response.status).toBe(400);

      const body = (await response.json()) as { error: string };
      expect(body.error).toContain("already registered");
    });

    it("returns 400 for missing name field", async () => {
      const response = await app.request("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: validProjectDir,
        }),
      });

      expect(response.status).toBe(400);

      const body = (await response.json()) as { error: string };
      expect(body.error).toBe("Validation failed");
    });

    it("returns 400 for empty name", async () => {
      const response = await app.request("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "   ",
          path: validProjectDir,
        }),
      });

      expect(response.status).toBe(400);

      const body = (await response.json()) as { error: string };
      expect(body.error).toBe("Validation failed");
    });

    it("returns 400 for invalid JSON body", async () => {
      const response = await app.request("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not json",
      });

      expect(response.status).toBe(400);

      const body = (await response.json()) as { error: string };
      expect(body.error).toBe("Invalid JSON body");
    });
  });

  describe("GET /api/projects", () => {
    it("returns empty list when no projects registered", async () => {
      const response = await app.request("/api/projects");

      expect(response.status).toBe(200);

      const body = (await response.json()) as { projects: Project[]; count: number };
      expect(body.projects).toEqual([]);
      expect(body.count).toBe(0);
    });

    it("returns all registered projects", async () => {
      await app.request("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Project One",
          path: validProjectDir,
        }),
      });

      const response = await app.request("/api/projects");

      expect(response.status).toBe(200);

      const body = (await response.json()) as { projects: Project[]; count: number };
      expect(body.projects).toHaveLength(1);
      expect(body.count).toBe(1);
      expect(body.projects[0].name).toBe("Project One");
    });
  });

  describe("GET /api/projects/:id", () => {
    it("returns project by ID", async () => {
      const createResponse = await app.request("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Lookup Project",
          path: validProjectDir,
        }),
      });

      const created = (await createResponse.json()) as Project;

      const response = await app.request(`/api/projects/${created.id}`);

      expect(response.status).toBe(200);

      const project = (await response.json()) as Project;
      expect(project.id).toBe(created.id);
      expect(project.name).toBe("Lookup Project");
    });

    it("returns 404 for non-existent ID", async () => {
      const response = await app.request("/api/projects/nonexistent-id");

      expect(response.status).toBe(404);

      const body = (await response.json()) as { error: string };
      expect(body.error).toBe("Project not found");
    });
  });

  describe("PUT /api/projects/:id", () => {
    it("updates project name", async () => {
      const createResponse = await app.request("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Original Name",
          path: validProjectDir,
        }),
      });

      const created = (await createResponse.json()) as Project;

      const response = await app.request(`/api/projects/${created.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Updated Name" }),
      });

      expect(response.status).toBe(200);

      const updated = (await response.json()) as Project;
      expect(updated.name).toBe("Updated Name");
      expect(updated.id).toBe(created.id);
    });

    it("updates project description", async () => {
      const createResponse = await app.request("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Desc Project",
          path: validProjectDir,
        }),
      });

      const created = (await createResponse.json()) as Project;

      const response = await app.request(`/api/projects/${created.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: "New description" }),
      });

      expect(response.status).toBe(200);

      const updated = (await response.json()) as Project;
      expect(updated.description).toBe("New description");
    });

    it("returns 404 for non-existent project", async () => {
      const response = await app.request("/api/projects/nonexistent-id", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Nope" }),
      });

      expect(response.status).toBe(404);

      const body = (await response.json()) as { error: string };
      expect(body.error).toBe("Project not found");
    });

    it("returns 400 for empty update body", async () => {
      const createResponse = await app.request("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Empty Update",
          path: validProjectDir,
        }),
      });

      const created = (await createResponse.json()) as Project;

      const response = await app.request(`/api/projects/${created.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(400);

      const body = (await response.json()) as { error: string };
      expect(body.error).toBe("Validation failed");
    });
  });

  describe("DELETE /api/projects/:id", () => {
    it("deregisters an existing project", async () => {
      const createResponse = await app.request("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Delete Me",
          path: validProjectDir,
        }),
      });

      const created = (await createResponse.json()) as Project;

      const response = await app.request(`/api/projects/${created.id}`, {
        method: "DELETE",
      });

      expect(response.status).toBe(200);

      const body = (await response.json()) as { success: boolean };
      expect(body.success).toBe(true);

      const getResponse = await app.request(`/api/projects/${created.id}`);
      expect(getResponse.status).toBe(404);
    });

    it("returns 404 for non-existent project", async () => {
      const response = await app.request("/api/projects/nonexistent-id", {
        method: "DELETE",
      });

      expect(response.status).toBe(404);

      const body = (await response.json()) as { error: string };
      expect(body.error).toBe("Project not found");
    });
  });

  describe("health endpoint reflects project count", () => {
    it("reports correct projectCount after registration", async () => {
      await app.request("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Counted Project",
          path: validProjectDir,
        }),
      });

      const response = await app.request("/health");
      const health = (await response.json()) as { projectCount: number };
      expect(health.projectCount).toBe(1);
    });
  });
});
