import type { DaemonConfig, DaemonHealth } from "@goopspec/core";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { timing } from "hono/timing";

const VERSION = "0.1.0";

export function createServer(_config: DaemonConfig): Hono {
  const app = new Hono();
  const startTime = Date.now();

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
    const health: DaemonHealth = {
      status: "ok",
      uptime: Math.floor((Date.now() - startTime) / 1000),
      version: VERSION,
      projectCount: 0,
      activeWorkflows: 0,
      timestamp: new Date().toISOString(),
    };

    return c.json(health);
  });

  app.notFound((c) => {
    return c.json({ error: "Not Found", path: c.req.path }, 404);
  });

  app.onError((err, c) => {
    console.error("Server error:", err);
    return c.json({ error: "Internal Server Error" }, 500);
  });

  return app;
}
