import type { Database } from "bun:sqlite";
import type { DaemonConfig, DaemonHealth } from "@goopspec/core";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { timing } from "hono/timing";
import { createProjectRoutes } from "./routes/projects.js";
import { ProjectService } from "./services/project-service.js";

const VERSION = "0.1.0";

export interface ServerDeps {
  config: DaemonConfig;
  db: Database;
}

export function createServer(deps: ServerDeps): Hono {
  const app = new Hono();
  const startTime = Date.now();
  const projectService = new ProjectService(deps.db);

  app.use("*", logger());
  app.use("*", timing());
  app.use(
    "*",
    cors({
      origin: ["http://localhost:4321", "http://localhost:3000", "http://127.0.0.1:4321"],
      credentials: true,
    }),
  );

  app.get("/health", (c) => {
    const projects = projectService.list();
    const health: DaemonHealth = {
      status: "ok",
      uptime: Math.floor((Date.now() - startTime) / 1000),
      version: VERSION,
      projectCount: projects.length,
      activeWorkflows: 0,
      timestamp: new Date().toISOString(),
    };

    return c.json(health);
  });

  app.route("/api/projects", createProjectRoutes(deps.db));

  app.notFound((c) => {
    return c.json({ error: "Not Found", path: c.req.path }, 404);
  });

  app.onError((err, c) => {
    console.error("Server error:", err);
    return c.json({ error: "Internal Server Error" }, 500);
  });

  return app;
}
