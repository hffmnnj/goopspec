import type { Database } from "bun:sqlite";
import type { WorkItemFilter } from "@goopspec/core";
import { WorkItemSchema, WorkItemUpdateSchema } from "@goopspec/core";
import { Hono } from "hono";
import { ItemService } from "../services/item-service.js";

type SortField = "createdAt" | "updatedAt" | "priority" | "title" | "status";
type SortOrder = "asc" | "desc";

const VALID_STATUSES = new Set(["todo", "in-progress", "done"]);
const VALID_PRIORITIES = new Set(["low", "medium", "high", "critical"]);
const VALID_SORT_FIELDS = new Set<string>(["createdAt", "updatedAt", "priority", "title", "status"]);
const VALID_SORT_ORDERS = new Set<string>(["asc", "desc"]);

export function createItemRoutes(db: Database): Hono {
  const router = new Hono();
  const service = new ItemService(db);

  router.get("/:projectId/items", (c) => {
    const projectId = c.req.param("projectId");
    const query = c.req.query();

    const filter: WorkItemFilter = {};

    if (query.status && VALID_STATUSES.has(query.status)) {
      filter.status = query.status as WorkItemFilter["status"];
    }
    if (query.priority && VALID_PRIORITIES.has(query.priority)) {
      filter.priority = query.priority as WorkItemFilter["priority"];
    }
    if (query.search) filter.search = query.search;
    if (query.tags) {
      filter.tags = Array.isArray(query.tags)
        ? query.tags
        : query.tags.split(",");
    }

    const sort = VALID_SORT_FIELDS.has(query.sort ?? "")
      ? (query.sort as SortField)
      : undefined;
    const order = VALID_SORT_ORDERS.has(query.order ?? "")
      ? (query.order as SortOrder)
      : undefined;

    const items = service.list(projectId, { filter, sort, order });
    return c.json({ items, count: items.length });
  });

  router.get("/:projectId/items/:id", (c) => {
    const projectId = c.req.param("projectId");
    const id = c.req.param("id");

    const item = service.get(projectId, id);
    if (!item) {
      return c.json({ error: "Work item not found" }, 404);
    }
    return c.json(item);
  });

  router.post("/:projectId/items", async (c) => {
    const projectId = c.req.param("projectId");

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    const parsed = WorkItemSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: "Validation failed", details: parsed.error.issues },
        400,
      );
    }

    const item = service.create(projectId, parsed.data);
    return c.json(item, 201);
  });

  router.put("/:projectId/items/:id", async (c) => {
    const projectId = c.req.param("projectId");
    const id = c.req.param("id");

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    const parsed = WorkItemUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: "Validation failed", details: parsed.error.issues },
        400,
      );
    }

    const item = service.update(projectId, id, parsed.data);
    if (!item) {
      return c.json({ error: "Work item not found" }, 404);
    }
    return c.json(item);
  });

  router.delete("/:projectId/items/:id", (c) => {
    const projectId = c.req.param("projectId");
    const id = c.req.param("id");

    const deleted = service.delete(projectId, id);
    if (!deleted) {
      return c.json({ error: "Work item not found" }, 404);
    }
    return c.json({ success: true });
  });

  return router;
}
