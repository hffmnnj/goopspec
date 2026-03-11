import type { Database } from "bun:sqlite";
import { ProjectSchema, ProjectUpdateSchema } from "@goopspec/core";
import { Hono } from "hono";
import { ProjectService, ProjectValidationError } from "../services/project-service.js";

export function createProjectRoutes(db: Database): Hono {
  const router = new Hono();
  const service = new ProjectService(db);

  router.get("/", (c) => {
    const projects = service.list();
    return c.json({ projects, count: projects.length });
  });

  router.get("/:id", (c) => {
    const project = service.get(c.req.param("id"));
    if (!project) {
      return c.json({ error: "Project not found" }, 404);
    }
    return c.json(project);
  });

  router.post("/", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    const parsed = ProjectSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: "Validation failed", details: parsed.error.issues },
        400,
      );
    }

    try {
      const project = service.register(parsed.data);
      return c.json(project, 201);
    } catch (err) {
      if (err instanceof ProjectValidationError) {
        return c.json({ error: err.message }, 400);
      }
      throw err;
    }
  });

  router.put("/:id", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    const parsed = ProjectUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: "Validation failed", details: parsed.error.issues },
        400,
      );
    }

    const project = service.update(c.req.param("id"), parsed.data);
    if (!project) {
      return c.json({ error: "Project not found" }, 404);
    }
    return c.json(project);
  });

  router.delete("/:id", (c) => {
    const deleted = service.deregister(c.req.param("id"));
    if (!deleted) {
      return c.json({ error: "Project not found" }, 404);
    }
    return c.json({ success: true });
  });

  return router;
}
