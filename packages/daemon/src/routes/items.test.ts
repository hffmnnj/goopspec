import type { DaemonConfig, Project, WorkItem } from "@goopspec/core";
import type { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import type { Hono } from "hono";
import { createTestDatabase } from "../db/index.js";
import { createServer } from "../server.js";

const testConfig: DaemonConfig = {
  port: 7331,
  host: "127.0.0.1",
  dbPath: ":memory:",
  logLevel: "info",
};

async function createProject(app: Hono, dir: string): Promise<Project> {
  const res = await app.request("/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Test Project", path: dir }),
  });
  return (await res.json()) as Project;
}

async function createItem(
  app: Hono,
  projectId: string,
  data: Record<string, unknown>,
): Promise<WorkItem> {
  const res = await app.request(`/api/projects/${projectId}/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return (await res.json()) as WorkItem;
}

describe("work item routes", () => {
  let db: Database;
  let app: Hono;
  let projectDir: string;
  let project: Project;

  beforeEach(async () => {
    db = createTestDatabase();
    app = createServer({ config: testConfig, db });

    projectDir = mkdtempSync(join(tmpdir(), "goopspec-item-test-"));
    mkdirSync(join(projectDir, ".goopspec"), { recursive: true });

    project = await createProject(app, projectDir);
  });

  afterEach(() => {
    db.close();
    rmSync(projectDir, { recursive: true, force: true });
  });

  describe("POST /api/projects/:projectId/items", () => {
    it("creates a work item with defaults and returns 201", async () => {
      const res = await app.request(`/api/projects/${project.id}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Fix login bug" }),
      });

      expect(res.status).toBe(201);

      const item = (await res.json()) as WorkItem;
      expect(item.id).toBeDefined();
      expect(item.projectId).toBe(project.id);
      expect(item.title).toBe("Fix login bug");
      expect(item.status).toBe("todo");
      expect(item.priority).toBe("medium");
      expect(item.tags).toEqual([]);
      expect(item.createdAt).toBeDefined();
      expect(item.updatedAt).toBeDefined();
    });

    it("creates a work item with all fields specified", async () => {
      const res = await app.request(`/api/projects/${project.id}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Implement auth",
          description: "Add OAuth2 support",
          status: "in-progress",
          priority: "high",
          tags: ["auth", "security"],
        }),
      });

      expect(res.status).toBe(201);

      const item = (await res.json()) as WorkItem;
      expect(item.title).toBe("Implement auth");
      expect(item.description).toBe("Add OAuth2 support");
      expect(item.status).toBe("in-progress");
      expect(item.priority).toBe("high");
      expect(item.tags).toEqual(["auth", "security"]);
    });

    it("returns 400 for missing title", async () => {
      const res = await app.request(`/api/projects/${project.id}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: "No title" }),
      });

      expect(res.status).toBe(400);

      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("Validation failed");
    });

    it("returns 400 for invalid JSON body", async () => {
      const res = await app.request(`/api/projects/${project.id}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not json",
      });

      expect(res.status).toBe(400);

      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("Invalid JSON body");
    });

    it("returns 400 for invalid status value", async () => {
      const res = await app.request(`/api/projects/${project.id}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Bad status", status: "invalid" }),
      });

      expect(res.status).toBe(400);

      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("Validation failed");
    });

    it("returns 400 for invalid priority value", async () => {
      const res = await app.request(`/api/projects/${project.id}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Bad priority", priority: "urgent" }),
      });

      expect(res.status).toBe(400);

      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("Validation failed");
    });
  });

  describe("GET /api/projects/:projectId/items", () => {
    it("returns empty list when no items exist", async () => {
      const res = await app.request(`/api/projects/${project.id}/items`);

      expect(res.status).toBe(200);

      const body = (await res.json()) as { items: WorkItem[]; count: number };
      expect(body.items).toEqual([]);
      expect(body.count).toBe(0);
    });

    it("returns all items for a project", async () => {
      await createItem(app, project.id, { title: "Item 1" });
      await createItem(app, project.id, { title: "Item 2" });

      const res = await app.request(`/api/projects/${project.id}/items`);

      expect(res.status).toBe(200);

      const body = (await res.json()) as { items: WorkItem[]; count: number };
      expect(body.items).toHaveLength(2);
      expect(body.count).toBe(2);
    });

    it("does not return items from a different project", async () => {
      await createItem(app, project.id, { title: "My item" });

      const otherDir = mkdtempSync(join(tmpdir(), "goopspec-item-test-other-"));
      mkdirSync(join(otherDir, ".goopspec"), { recursive: true });
      const otherProject = await createProject(app, otherDir);

      await createItem(app, otherProject.id, { title: "Other item" });

      const res = await app.request(`/api/projects/${project.id}/items`);
      const body = (await res.json()) as { items: WorkItem[]; count: number };
      expect(body.items).toHaveLength(1);
      expect(body.items[0].title).toBe("My item");

      rmSync(otherDir, { recursive: true, force: true });
    });
  });

  describe("GET /api/projects/:projectId/items/:id", () => {
    it("returns a single item by ID", async () => {
      const created = await createItem(app, project.id, {
        title: "Lookup item",
      });

      const res = await app.request(
        `/api/projects/${project.id}/items/${created.id}`,
      );

      expect(res.status).toBe(200);

      const item = (await res.json()) as WorkItem;
      expect(item.id).toBe(created.id);
      expect(item.title).toBe("Lookup item");
    });

    it("returns 404 for non-existent item", async () => {
      const res = await app.request(
        `/api/projects/${project.id}/items/nonexistent`,
      );

      expect(res.status).toBe(404);

      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("Work item not found");
    });

    it("returns 404 for item belonging to a different project", async () => {
      const otherDir = mkdtempSync(join(tmpdir(), "goopspec-item-test-xproj-"));
      mkdirSync(join(otherDir, ".goopspec"), { recursive: true });
      const otherProject = await createProject(app, otherDir);

      const otherItem = await createItem(app, otherProject.id, {
        title: "Other project item",
      });

      const res = await app.request(
        `/api/projects/${project.id}/items/${otherItem.id}`,
      );

      expect(res.status).toBe(404);

      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("Work item not found");

      rmSync(otherDir, { recursive: true, force: true });
    });
  });

  describe("PUT /api/projects/:projectId/items/:id", () => {
    it("updates item title", async () => {
      const created = await createItem(app, project.id, {
        title: "Original",
      });

      const res = await app.request(
        `/api/projects/${project.id}/items/${created.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Updated" }),
        },
      );

      expect(res.status).toBe(200);

      const item = (await res.json()) as WorkItem;
      expect(item.title).toBe("Updated");
      expect(item.id).toBe(created.id);
    });

    it("updates item status and priority", async () => {
      const created = await createItem(app, project.id, {
        title: "Status test",
      });

      const res = await app.request(
        `/api/projects/${project.id}/items/${created.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "done", priority: "critical" }),
        },
      );

      expect(res.status).toBe(200);

      const item = (await res.json()) as WorkItem;
      expect(item.status).toBe("done");
      expect(item.priority).toBe("critical");
    });

    it("updates item tags", async () => {
      const created = await createItem(app, project.id, {
        title: "Tags test",
        tags: ["old"],
      });

      const res = await app.request(
        `/api/projects/${project.id}/items/${created.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tags: ["new", "updated"] }),
        },
      );

      expect(res.status).toBe(200);

      const item = (await res.json()) as WorkItem;
      expect(item.tags).toEqual(["new", "updated"]);
    });

    it("returns 404 for non-existent item", async () => {
      const res = await app.request(
        `/api/projects/${project.id}/items/nonexistent`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Nope" }),
        },
      );

      expect(res.status).toBe(404);

      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("Work item not found");
    });

    it("accepts empty body as valid update (defaults applied by schema)", async () => {
      const created = await createItem(app, project.id, {
        title: "Default update",
        status: "in-progress",
        priority: "high",
      });

      const res = await app.request(
        `/api/projects/${project.id}/items/${created.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      );

      // WorkItemUpdateSchema.partial() with defaults means {} parses to
      // { status: "todo", priority: "medium", tags: [] }, which is a valid update
      expect(res.status).toBe(200);

      const item = (await res.json()) as WorkItem;
      expect(item.id).toBe(created.id);
    });
  });

  describe("DELETE /api/projects/:projectId/items/:id", () => {
    it("deletes an existing item", async () => {
      const created = await createItem(app, project.id, {
        title: "Delete me",
      });

      const res = await app.request(
        `/api/projects/${project.id}/items/${created.id}`,
        { method: "DELETE" },
      );

      expect(res.status).toBe(200);

      const body = (await res.json()) as { success: boolean };
      expect(body.success).toBe(true);

      const getRes = await app.request(
        `/api/projects/${project.id}/items/${created.id}`,
      );
      expect(getRes.status).toBe(404);
    });

    it("returns 404 for non-existent item", async () => {
      const res = await app.request(
        `/api/projects/${project.id}/items/nonexistent`,
        { method: "DELETE" },
      );

      expect(res.status).toBe(404);

      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("Work item not found");
    });
  });

  describe("filtering", () => {
    beforeEach(async () => {
      await createItem(app, project.id, {
        title: "Todo low",
        status: "todo",
        priority: "low",
        tags: ["frontend"],
      });
      await createItem(app, project.id, {
        title: "In progress high",
        status: "in-progress",
        priority: "high",
        tags: ["backend", "api"],
      });
      await createItem(app, project.id, {
        title: "Done critical",
        description: "Important bugfix completed",
        status: "done",
        priority: "critical",
        tags: ["backend", "bugfix"],
      });
    });

    it("filters by status", async () => {
      const res = await app.request(
        `/api/projects/${project.id}/items?status=todo`,
      );
      const body = (await res.json()) as { items: WorkItem[]; count: number };

      expect(body.count).toBe(1);
      expect(body.items[0].title).toBe("Todo low");
    });

    it("filters by priority", async () => {
      const res = await app.request(
        `/api/projects/${project.id}/items?priority=critical`,
      );
      const body = (await res.json()) as { items: WorkItem[]; count: number };

      expect(body.count).toBe(1);
      expect(body.items[0].title).toBe("Done critical");
    });

    it("filters by search matching title", async () => {
      const res = await app.request(
        `/api/projects/${project.id}/items?search=progress`,
      );
      const body = (await res.json()) as { items: WorkItem[]; count: number };

      expect(body.count).toBe(1);
      expect(body.items[0].title).toBe("In progress high");
    });

    it("filters by search matching description", async () => {
      const res = await app.request(
        `/api/projects/${project.id}/items?search=bugfix`,
      );
      const body = (await res.json()) as { items: WorkItem[]; count: number };

      expect(body.count).toBe(1);
      expect(body.items[0].title).toBe("Done critical");
    });

    it("filters by tags (any match)", async () => {
      const res = await app.request(
        `/api/projects/${project.id}/items?tags=backend`,
      );
      const body = (await res.json()) as { items: WorkItem[]; count: number };

      expect(body.count).toBe(2);
      const titles = body.items.map((i) => i.title).sort();
      expect(titles).toEqual(["Done critical", "In progress high"]);
    });

    it("filters by tags with multiple values", async () => {
      const res = await app.request(
        `/api/projects/${project.id}/items?tags=frontend,bugfix`,
      );
      const body = (await res.json()) as { items: WorkItem[]; count: number };

      expect(body.count).toBe(2);
      const titles = body.items.map((i) => i.title).sort();
      expect(titles).toEqual(["Done critical", "Todo low"]);
    });

    it("combines status and priority filters", async () => {
      await createItem(app, project.id, {
        title: "Todo high",
        status: "todo",
        priority: "high",
      });

      const res = await app.request(
        `/api/projects/${project.id}/items?status=todo&priority=high`,
      );
      const body = (await res.json()) as { items: WorkItem[]; count: number };

      expect(body.count).toBe(1);
      expect(body.items[0].title).toBe("Todo high");
    });
  });

  describe("sorting", () => {
    it("sorts by title ascending", async () => {
      await createItem(app, project.id, { title: "Charlie" });
      await createItem(app, project.id, { title: "Alpha" });
      await createItem(app, project.id, { title: "Bravo" });

      const res = await app.request(
        `/api/projects/${project.id}/items?sort=title&order=asc`,
      );
      const body = (await res.json()) as { items: WorkItem[]; count: number };

      expect(body.items[0].title).toBe("Alpha");
      expect(body.items[1].title).toBe("Bravo");
      expect(body.items[2].title).toBe("Charlie");
    });

    it("sorts by priority descending", async () => {
      await createItem(app, project.id, {
        title: "Low",
        priority: "low",
      });
      await createItem(app, project.id, {
        title: "Critical",
        priority: "critical",
      });
      await createItem(app, project.id, {
        title: "High",
        priority: "high",
      });

      const res = await app.request(
        `/api/projects/${project.id}/items?sort=priority&order=desc`,
      );
      const body = (await res.json()) as { items: WorkItem[]; count: number };

      expect(body.items[0].title).toBe("Critical");
      expect(body.items[1].title).toBe("High");
      expect(body.items[2].title).toBe("Low");
    });
  });
});
