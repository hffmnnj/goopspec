import type { DaemonConfig, DaemonHealth } from "@goopspec/core";
import { describe, expect, it, mock } from "bun:test";
import { createShutdownHandler, type StoppableServer } from "./index.js";
import { createServer } from "./server.js";

const testConfig: DaemonConfig = {
  port: 7331,
  host: "127.0.0.1",
  dbPath: ".goopspec-daemon.test.db",
  logLevel: "info",
};

describe("daemon server", () => {
  it("returns health payload from GET /health", async () => {
    const app = createServer(testConfig);
    const response = await app.request("/health");

    expect(response.status).toBe(200);

    const body = (await response.json()) as DaemonHealth;
    expect(body.status).toBe("ok");
    expect(typeof body.uptime).toBe("number");
    expect(body.uptime).toBeGreaterThanOrEqual(0);
    expect(body.version).toBe("0.1.0");
    expect(body.projectCount).toBe(0);
    expect(body.activeWorkflows).toBe(0);
    expect(new Date(body.timestamp).toString()).not.toBe("Invalid Date");
  });

  it("returns 404 payload for unknown route", async () => {
    const app = createServer(testConfig);
    const response = await app.request("/missing");

    expect(response.status).toBe(404);

    const body = (await response.json()) as { error: string; path: string };
    expect(body.error).toBe("Not Found");
    expect(body.path).toBe("/missing");
  });
});

describe("graceful shutdown lifecycle", () => {
  it("stops server, runs cleanup, and exits with code 0", () => {
    const stop = mock((_closeActiveConnections?: boolean) => undefined);
    const onStopped = mock(() => undefined);
    const exit = mock((_code: number): never => {
      throw new Error("exit-called");
    });

    const server: StoppableServer = { stop };
    const shutdown = createShutdownHandler(server, onStopped, exit);

    expect(() => shutdown("SIGTERM")).toThrow("exit-called");
    expect(stop).toHaveBeenCalledWith(true);
    expect(onStopped).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
  });
});
