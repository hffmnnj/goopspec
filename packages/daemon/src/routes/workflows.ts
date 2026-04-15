import type { Database } from "bun:sqlite";
import { Hono, type Context } from "hono";
import { ProjectService } from "../services/project-service.js";
import {
  WorkflowLifecycleError,
  type WorkflowLifecycleManager,
} from "../orchestration/lifecycle.js";

interface SpawnBody {
  projectId?: string;
  workItemId?: string;
  prompt?: string;
  workflowId?: string;
}

export function createWorkflowRoutes(
  db: Database,
  lifecycle: WorkflowLifecycleManager,
): Hono {
  const router = new Hono();
  const projectService = new ProjectService(db);

  const handleSpawn = async (c: Context) => {
    let body: SpawnBody;
    try {
      body = (await c.req.json()) as SpawnBody;
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    if (!body.projectId) {
      return c.json({ error: "projectId is required" }, 400);
    }

    const project = projectService.get(body.projectId);
    if (!project) {
      return c.json({ error: "Project not found" }, 404);
    }

    try {
      const session = await lifecycle.spawn({
        projectId: body.projectId,
        projectPath: project.path,
        workItemId: body.workItemId,
        prompt: body.prompt,
        workflowId: body.workflowId,
      });

      return c.json(session, 201);
    } catch (error) {
      if (error instanceof WorkflowLifecycleError) {
        return c.json({ error: error.message }, 409);
      }
      throw error;
    }
  };

  router.post("/", handleSpawn);
  router.post("/spawn", handleSpawn);

  router.get("/", (c) => {
    const projectId = c.req.query("projectId");
    const sessions = lifecycle.listSessions(projectId);
    return c.json({ sessions, count: sessions.length });
  });

  router.get("/:id", (c) => {
    const session = lifecycle.getSession(c.req.param("id"));
    if (!session) {
      return c.json({ error: "Workflow session not found" }, 404);
    }

    return c.json(session);
  });

  router.get("/:id/events", (c) => {
    const sessionId = c.req.param("id");
    const session = lifecycle.getSession(sessionId);
    if (!session) {
      return c.json({ error: "Workflow session not found" }, 404);
    }

    const after = c.req.query("after");
    const events = lifecycle.getEvents(sessionId, after);
    return c.json({ events, count: events.length });
  });

  return router;
}
