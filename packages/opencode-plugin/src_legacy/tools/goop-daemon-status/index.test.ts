/**
 * Tests for the goop_daemon_status tool
 * @module tools/goop-daemon-status/index.test
 */

import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import {
  createMockPluginContext,
  createMockToolContext,
  setupTestEnvironment,
  type PluginContext,
} from "../../test-utils.js";

// Mock response holder — set per test
let mockGetResponse: (() => Promise<unknown>) | undefined;

// Mock the DaemonClient module so each test controls the client behavior
const realModule = await import("../../features/daemon/client.js");
mock.module("../../features/daemon/client.js", () => ({
  ...realModule,
  DaemonClient: class MockDaemonClient {
    getBaseUrl() { return "http://localhost:7331"; }
    async isAvailable() {
      try { await this.get("/health"); return true; } catch { return false; }
    }
    async get<T>(_path: string): Promise<T> {
      if (!mockGetResponse) throw new realModule.DaemonUnavailableError("No mock set");
      return mockGetResponse() as Promise<T>;
    }
    async post<T>(_path: string, _body: unknown): Promise<T> {
      return {} as T;
    }
    async put<T>(_path: string, _body: unknown): Promise<T> {
      return {} as T;
    }
    async delete(_path: string): Promise<void> {}
  },
}));

// Import AFTER mock.module so we get the mocked version
const { createGoopDaemonStatusTool } = await import("./index.js");

describe("goop_daemon_status tool", () => {
  let ctx: PluginContext;
  let toolContext: ReturnType<typeof createMockToolContext>;
  let cleanup: () => void;

  beforeEach(() => {
    const env = setupTestEnvironment("daemon-status-test");
    cleanup = env.cleanup;
    ctx = createMockPluginContext({ testDir: env.testDir });
    toolContext = createMockToolContext({ directory: env.testDir });
    mockGetResponse = undefined;
  });

  afterEach(() => {
    mockGetResponse = undefined;
    cleanup();
  });

  describe("tool creation", () => {
    it("creates tool with correct description", () => {
      const tool = createGoopDaemonStatusTool(ctx);
      expect(tool.description).toContain("daemon");
    });
  });

  describe("daemon available", () => {
    it("returns formatted health when daemon is running", async () => {
      mockGetResponse = async () => ({
        status: "ok",
        uptime: 3661,
        version: "0.1.0",
        projectCount: 3,
        activeWorkflows: 1,
        timestamp: "2026-03-11T12:00:00Z",
      });

      const tool = createGoopDaemonStatusTool(ctx);
      const result = await tool.execute({}, toolContext);

      expect(result).toContain("GoopSpec Daemon");
      expect(result).toContain("✅ ok");
      expect(result).toContain("0.1.0");
      expect(result).toContain("1h");
      expect(result).toContain("3");
      expect(result).toContain("1");
    });

    it("shows degraded status with warning icon", async () => {
      mockGetResponse = async () => ({
        status: "degraded",
        uptime: 60,
        version: "0.1.0",
        projectCount: 0,
        activeWorkflows: 0,
        timestamp: "2026-03-11T12:00:00Z",
      });

      const tool = createGoopDaemonStatusTool(ctx);
      const result = await tool.execute({}, toolContext);

      expect(result).toContain("⚠️ degraded");
    });
  });

  describe("daemon unavailable", () => {
    it("returns helpful message when daemon is not running", async () => {
      mockGetResponse = async () => {
        throw new realModule.DaemonUnavailableError("Connection refused");
      };

      const tool = createGoopDaemonStatusTool(ctx);
      const result = await tool.execute({}, toolContext);

      expect(result).toContain("Daemon is not running");
      expect(result).toContain("bun run daemon");
    });
  });

  describe("daemon error", () => {
    it("returns error message on non-2xx response", async () => {
      mockGetResponse = async () => {
        throw new realModule.DaemonApiError(500, "Internal Server Error");
      };

      const tool = createGoopDaemonStatusTool(ctx);
      const result = await tool.execute({}, toolContext);

      expect(result).toContain("error");
    });
  });
});
