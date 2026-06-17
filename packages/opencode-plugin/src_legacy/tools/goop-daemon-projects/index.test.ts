/**
 * Tests for the goop_daemon_projects tool
 * @module tools/goop-daemon-projects/index.test
 */

import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import {
  createMockPluginContext,
  createMockToolContext,
  setupTestEnvironment,
  type PluginContext,
} from "../../test-utils.js";

// Mock response holders — set per test
let mockGetResponse: ((_path: string) => Promise<unknown>) | undefined;
let mockPostResponse: ((_path: string, _body: unknown) => Promise<unknown>) | undefined;
let mockDeleteResponse: ((_path: string) => Promise<void>) | undefined;

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
    async post<T>(path: string, body: unknown): Promise<T> {
      if (!mockPostResponse) throw new realModule.DaemonUnavailableError("No mock set");
      return mockPostResponse(path, body) as Promise<T>;
    }
    async put<T>(_path: string, _body: unknown): Promise<T> {
      return {} as T;
    }
    async delete(path: string): Promise<void> {
      if (!mockDeleteResponse) throw new realModule.DaemonUnavailableError("No mock set");
      return mockDeleteResponse(path);
    }
  },
}));

const { createGoopDaemonProjectsTool } = await import("./index.js");

describe("goop_daemon_projects tool", () => {
  let ctx: PluginContext;
  let toolContext: ReturnType<typeof createMockToolContext>;
  let cleanup: () => void;

  beforeEach(() => {
    const env = setupTestEnvironment("daemon-projects-test");
    cleanup = env.cleanup;
    ctx = createMockPluginContext({ testDir: env.testDir });
    toolContext = createMockToolContext({ directory: env.testDir });
    mockGetResponse = undefined;
    mockPostResponse = undefined;
    mockDeleteResponse = undefined;
  });

  afterEach(() => {
    mockGetResponse = undefined;
    mockPostResponse = undefined;
    mockDeleteResponse = undefined;
    cleanup();
  });

  describe("tool creation", () => {
    it("creates tool with correct description", () => {
      const tool = createGoopDaemonProjectsTool(ctx);
      expect(tool.description).toContain("project");
    });

    it("has required args", () => {
      const tool = createGoopDaemonProjectsTool(ctx);
      expect(tool.args).toHaveProperty("action");
    });
  });

  describe("list action", () => {
    it("returns formatted project list", async () => {
      mockGetResponse = async () => ({
        projects: [
          {
            id: "proj-1",
            name: "my-app",
            path: "/home/user/my-app",
            createdAt: "2026-03-11T12:00:00Z",
            updatedAt: "2026-03-11T12:00:00Z",
          },
          {
            id: "proj-2",
            name: "other-app",
            path: "/home/user/other-app",
            createdAt: "2026-03-11T12:00:00Z",
            updatedAt: "2026-03-11T12:00:00Z",
          },
        ],
      });

      const tool = createGoopDaemonProjectsTool(ctx);
      const result = await tool.execute({ action: "list" }, toolContext);

      expect(result).toContain("Registered Projects");
      expect(result).toContain("my-app");
      expect(result).toContain("other-app");
    });

    it("returns message when no projects", async () => {
      mockGetResponse = async () => ({ projects: [] });

      const tool = createGoopDaemonProjectsTool(ctx);
      const result = await tool.execute({ action: "list" }, toolContext);

      expect(result).toContain("No projects registered");
    });
  });

  describe("register action", () => {
    it("registers project with daemon", async () => {
      mockPostResponse = async () => ({
        project: {
          id: "proj-new",
          name: "test-project",
          path: ctx.input.directory,
          createdAt: "2026-03-11T12:00:00Z",
          updatedAt: "2026-03-11T12:00:00Z",
        },
      });

      const tool = createGoopDaemonProjectsTool(ctx);
      const result = await tool.execute(
        { action: "register", name: "test-project" },
        toolContext,
      );

      expect(result).toContain("Project registered");
      expect(result).toContain("test-project");
      expect(result).toContain("proj-new");
    });

    it("uses project name from state when not provided", async () => {
      let capturedBody: unknown;
      mockPostResponse = async (_path: string, body: unknown) => {
        capturedBody = body;
        return {
          project: {
            id: "proj-auto",
            name: "test-project",
            path: ctx.input.directory,
            createdAt: "2026-03-11T12:00:00Z",
            updatedAt: "2026-03-11T12:00:00Z",
          },
        };
      };

      const tool = createGoopDaemonProjectsTool(ctx);
      await tool.execute({ action: "register" }, toolContext);

      expect(capturedBody).toBeDefined();
      const parsed = capturedBody as Record<string, unknown>;
      expect(parsed.name).toBe("test-project");
    });
  });

  describe("deregister action", () => {
    it("deregisters project by id", async () => {
      mockDeleteResponse = async () => {};

      const tool = createGoopDaemonProjectsTool(ctx);
      const result = await tool.execute(
        { action: "deregister", id: "proj-1" },
        toolContext,
      );

      expect(result).toContain("deregistered");
      expect(result).toContain("proj-1");
    });

    it("returns error when id is missing", async () => {
      const tool = createGoopDaemonProjectsTool(ctx);
      const result = await tool.execute(
        { action: "deregister" },
        toolContext,
      );

      expect(result).toContain("Error");
      expect(result).toContain("id");
    });
  });

  describe("daemon unavailable", () => {
    it("returns helpful message for all actions", async () => {
      // All mock responses are undefined, so DaemonUnavailableError is thrown

      const tool = createGoopDaemonProjectsTool(ctx);

      for (const action of ["list", "register", "deregister"] as const) {
        const result = await tool.execute(
          { action, id: "proj-1", name: "test" },
          toolContext,
        );
        expect(result).toContain("Daemon is not running");
      }
    });
  });
});
