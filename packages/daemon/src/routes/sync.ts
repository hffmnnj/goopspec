import type { Database } from "bun:sqlite";
import { Hono } from "hono";
import { SyncService } from "../transport/sync.js";

const DEFAULT_EVENT_LIMIT = 100;
const MAX_EVENT_LIMIT = 1000;

export function createSyncRoutes(db: Database): Hono {
  const router = new Hono();
  const syncService = new SyncService(db);

  router.get("/sync/:projectId", (c) => {
    const projectId = c.req.param("projectId");

    try {
      const snapshot = syncService.getProjectSnapshot(projectId);
      if (!snapshot) {
        return c.json({ error: "Project not found" }, 404);
      }
      return c.json(snapshot);
    } catch (error) {
      console.error("Sync snapshot error:", error);
      return c.json({ error: "Internal Server Error" }, 500);
    }
  });

  router.get("/sync/:projectId/events", (c) => {
    const projectId = c.req.param("projectId");
    const after = c.req.query("after");

    if (!after) {
      return c.json({ error: "'after' query parameter is required" }, 400);
    }

    const limitParam = c.req.query("limit");
    const limit = limitParam
      ? Math.max(1, Math.min(Number(limitParam) || DEFAULT_EVENT_LIMIT, MAX_EVENT_LIMIT))
      : DEFAULT_EVENT_LIMIT;

    try {
      const result = syncService.getMissedEvents(projectId, after, limit);
      return c.json(result);
    } catch (error) {
      console.error("Sync events error:", error);
      return c.json({ error: "Internal Server Error" }, 500);
    }
  });

  return router;
}
