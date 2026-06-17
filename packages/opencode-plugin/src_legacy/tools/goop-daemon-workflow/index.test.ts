/**
 * Tests for the goop_daemon_workflow tool
 * @module tools/goop-daemon-workflow/index.test
 */

import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import {
  createMockPluginContext,
  createMockToolContext,
  setupTestEnvironment,
  type PluginContext,
} from "../../test-utils.js";

const MOCK_SESSIONS = [
  {
    id: "sess-1",
    projectId: "proj-1",
    workflowId: "default",
    phase: "execute",
    currentWave: 2,
    totalWaves: 5,
    status: "running",
    activeAgent: "goop-executor-medium",
    startedAt: "2026-03-11T10:00:00Z",
    updatedAt: "2026-03-11T12:00:00Z",
  },
  {
    id: "sess-2",
    projectId: "proj-1",
    workflowId: "feat-auth",
    phase: "plan",
    currentWave: 0,
    totalWaves: 0,
    status: "pending",
    startedAt: "2026-03-11T11:00:00Z",
    updatedAt: "2026-03-11T11:00:00Z",
  },
  {
    id: "sess-3",
    projectId: "proj-2",
    workflowId: "default",
    phase: "accept",
    currentWave: 3,
    totalWaves: 3,
    status: "completed",
    startedAt: "2026-03-10T08:00:00Z",
    completedAt: "2026-03-10T16:00:00Z",
    updatedAt: "2026-03-10T16:00:00Z",
  },
];

// Mock response holder — set per test
let mockGetResponse: ((_path: string) => Promise<unknown>) | undefined;

const realModule = await import("../../features/daemon/client.js");
mock.module("../../features/daemon/client.js", () => ({
  ...realModule,
  DaemonClient: class MockDaemonClient {
    getBaseUrl() { return "http://localhost:7331"; }
    async isAvailable() {
      try { await this.get("/health"); return true; } catch { return false; }
    }
    async get<T>(path: string): Promise<T> {
      if (!mockGetResponse) throw new realModule.DaemonUnavailableError("No mock set");
      return mockGetResponse(path) as Promise<T>;
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

const { createGoopDaemonWorkflowTool } = await import("./index.js");

describe("goop_daemon_workflow tool", () => {
  let ctx: PluginContext;
  let toolContext: ReturnType<typeof createMockToolContext>;
  let cleanup: () => void;

  beforeEach(() => {
    const env = setupTestEnvironment("daemon-workflow-test");
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
      const tool = createGoopDaemonWorkflowTool(ctx);
      expect(tool.description).toContain("workflow");
    });

    it("has required args", () => {
      const tool = createGoopDaemonWorkflowTool(ctx);
      expect(tool.args).toHaveProperty("action");
    });
  });

  describe("status action", () => {
    it("returns active workflow sessions", async () => {
      mockGetResponse = async () => ({ sessions: MOCK_SESSIONS });

      const tool = createGoopDaemonWorkflowTool(ctx);
      const result = await tool.execute({ action: "status" }, toolContext);

      expect(result).toContain("Active Workflows");
      expect(result).toContain("sess-1");
      expect(result).toContain("running");
      // sess-3 is completed, should not appear in status
      expect(result).not.toContain("sess-3");
    });

    it("returns message when no active sessions", async () => {
      mockGetResponse = async () => ({
        sessions: MOCK_SESSIONS.filter((s) => s.status === "completed"),
      });

      const tool = createGoopDaemonWorkflowTool(ctx);
      const result = await tool.execute({ action: "status" }, toolContext);

      expect(result).toContain("No active workflow sessions");
    });

    it("filters by projectId", async () => {
      mockGetResponse = async () => ({ sessions: MOCK_SESSIONS });

      const tool = createGoopDaemonWorkflowTool(ctx);
      const result = await tool.execute(
        { action: "status", projectId: "proj-2" },
        toolContext,
      );

      // proj-2 only has a completed session, so no active
      expect(result).toContain("No active workflow sessions");
    });
  });

  describe("history action", () => {
    it("returns all sessions in table format", async () => {
      mockGetResponse = async () => ({ sessions: MOCK_SESSIONS });

      const tool = createGoopDaemonWorkflowTool(ctx);
      const result = await tool.execute({ action: "history" }, toolContext);

      expect(result).toContain("Workflow Sessions");
      expect(result).toContain("sess-1");
      expect(result).toContain("sess-2");
      expect(result).toContain("sess-3");
    });

    it("returns message when no sessions", async () => {
      mockGetResponse = async () => ({ sessions: [] });

      const tool = createGoopDaemonWorkflowTool(ctx);
      const result = await tool.execute({ action: "history" }, toolContext);

      expect(result).toContain("No workflow sessions found");
    });
  });

  describe("get action", () => {
    it("returns specific session details", async () => {
      mockGetResponse = async () => ({ session: MOCK_SESSIONS[0] });

      const tool = createGoopDaemonWorkflowTool(ctx);
      const result = await tool.execute(
        { action: "get", sessionId: "sess-1" },
        toolContext,
      );

      expect(result).toContain("sess-1");
      expect(result).toContain("execute");
      expect(result).toContain("running");
      expect(result).toContain("2/5");
      expect(result).toContain("goop-executor-medium");
    });

    it("returns error when sessionId is missing", async () => {
      const tool = createGoopDaemonWorkflowTool(ctx);
      const result = await tool.execute({ action: "get" }, toolContext);

      expect(result).toContain("Error");
      expect(result).toContain("sessionId");
    });
  });

  describe("daemon unavailable", () => {
    it("returns helpful message", async () => {
      // mockGetResponse is undefined, so DaemonUnavailableError is thrown

      const tool = createGoopDaemonWorkflowTool(ctx);
      const result = await tool.execute({ action: "status" }, toolContext);

      expect(result).toContain("Daemon is not running");
      expect(result).toContain("bun run daemon");
    });
  });
});
