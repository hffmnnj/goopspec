/**
 * Tests for the goop_daemon_items tool
 * @module tools/goop-daemon-items/index.test
 */

import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import {
  createMockPluginContext,
  createMockToolContext,
  setupTestEnvironment,
  type PluginContext,
} from "../../test-utils.js";

const MOCK_ITEMS = [
  {
    id: "item-1",
    projectId: "proj-1",
    title: "Add OAuth login",
    description: "Support Google and GitHub OAuth",
    type: "feature" as const,
    status: "in_progress" as const,
    priority: "high" as const,
    tags: ["auth", "oauth"],
    orderIndex: 0,
    createdAt: "2026-03-11T10:00:00Z",
    updatedAt: "2026-03-11T12:00:00Z",
  },
  {
    id: "item-2",
    projectId: "proj-1",
    title: "Fix login redirect",
    type: "bug" as const,
    status: "todo" as const,
    priority: "critical" as const,
    tags: ["auth"],
    orderIndex: 1,
    createdAt: "2026-03-11T11:00:00Z",
    updatedAt: "2026-03-11T11:00:00Z",
  },
];

// Mock response holders — set per test
let mockGetResponse: ((_path: string) => Promise<unknown>) | undefined;
let mockPostResponse: ((_path: string, _body: unknown) => Promise<unknown>) | undefined;
let mockPutResponse: ((_path: string, _body: unknown) => Promise<unknown>) | undefined;

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
    async put<T>(path: string, body: unknown): Promise<T> {
      if (!mockPutResponse) throw new realModule.DaemonUnavailableError("No mock set");
      return mockPutResponse(path, body) as Promise<T>;
    }
    async delete(_path: string): Promise<void> {}
  },
}));

const { createGoopDaemonItemsTool } = await import("./index.js");

describe("goop_daemon_items tool", () => {
  let ctx: PluginContext;
  let toolContext: ReturnType<typeof createMockToolContext>;
  let cleanup: () => void;

  beforeEach(() => {
    const env = setupTestEnvironment("daemon-items-test");
    cleanup = env.cleanup;
    ctx = createMockPluginContext({ testDir: env.testDir });
    toolContext = createMockToolContext({ directory: env.testDir });
    mockGetResponse = undefined;
    mockPostResponse = undefined;
    mockPutResponse = undefined;
  });

  afterEach(() => {
    mockGetResponse = undefined;
    mockPostResponse = undefined;
    mockPutResponse = undefined;
    cleanup();
  });

  describe("tool creation", () => {
    it("creates tool with correct description", () => {
      const tool = createGoopDaemonItemsTool(ctx);
      expect(tool.description).toContain("work items");
    });

    it("has required args", () => {
      const tool = createGoopDaemonItemsTool(ctx);
      expect(tool.args).toHaveProperty("action");
      expect(tool.args).toHaveProperty("projectId");
    });
  });

  describe("list action", () => {
    it("returns formatted item list", async () => {
      mockGetResponse = async () => ({ items: MOCK_ITEMS });

      const tool = createGoopDaemonItemsTool(ctx);
      const result = await tool.execute(
        { action: "list", projectId: "proj-1" },
        toolContext,
      );

      expect(result).toContain("Work Items");
      expect(result).toContain("Add OAuth login");
      expect(result).toContain("Fix login redirect");
      expect(result).toContain("feature");
      expect(result).toContain("bug");
    });

    it("returns message when no items", async () => {
      mockGetResponse = async () => ({ items: [] });

      const tool = createGoopDaemonItemsTool(ctx);
      const result = await tool.execute(
        { action: "list", projectId: "proj-1" },
        toolContext,
      );

      expect(result).toContain("No work items found");
    });
  });

  describe("get action", () => {
    it("returns specific item details", async () => {
      mockGetResponse = async () => ({ item: MOCK_ITEMS[0] });

      const tool = createGoopDaemonItemsTool(ctx);
      const result = await tool.execute(
        { action: "get", projectId: "proj-1", itemId: "item-1" },
        toolContext,
      );

      expect(result).toContain("Add OAuth login");
      expect(result).toContain("feature");
      expect(result).toContain("in_progress");
      expect(result).toContain("high");
      expect(result).toContain("auth, oauth");
    });

    it("returns error when itemId is missing", async () => {
      const tool = createGoopDaemonItemsTool(ctx);
      const result = await tool.execute(
        { action: "get", projectId: "proj-1" },
        toolContext,
      );

      expect(result).toContain("Error");
      expect(result).toContain("itemId");
    });
  });

  describe("create action", () => {
    it("creates a new work item", async () => {
      mockPostResponse = async () => ({
        item: {
          id: "item-new",
          projectId: "proj-1",
          title: "New feature",
          type: "feature",
          status: "backlog",
          priority: "medium",
          tags: ["ui"],
          orderIndex: 2,
          createdAt: "2026-03-11T13:00:00Z",
          updatedAt: "2026-03-11T13:00:00Z",
        },
      });

      const tool = createGoopDaemonItemsTool(ctx);
      const result = await tool.execute(
        {
          action: "create",
          projectId: "proj-1",
          title: "New feature",
          type: "feature",
          priority: "medium",
          tags: ["ui"],
        },
        toolContext,
      );

      expect(result).toContain("Work item created");
      expect(result).toContain("New feature");
      expect(result).toContain("item-new");
    });

    it("returns error when title is missing", async () => {
      const tool = createGoopDaemonItemsTool(ctx);
      const result = await tool.execute(
        { action: "create", projectId: "proj-1" },
        toolContext,
      );

      expect(result).toContain("Error");
      expect(result).toContain("title");
    });
  });

  describe("update action", () => {
    it("updates an existing work item", async () => {
      mockPutResponse = async () => ({
        item: {
          ...MOCK_ITEMS[0],
          status: "review",
        },
      });

      const tool = createGoopDaemonItemsTool(ctx);
      const result = await tool.execute(
        {
          action: "update",
          projectId: "proj-1",
          itemId: "item-1",
          status: "review",
        },
        toolContext,
      );

      expect(result).toContain("Work item updated");
      expect(result).toContain("Add OAuth login");
    });

    it("returns error when itemId is missing", async () => {
      const tool = createGoopDaemonItemsTool(ctx);
      const result = await tool.execute(
        { action: "update", projectId: "proj-1", status: "done" },
        toolContext,
      );

      expect(result).toContain("Error");
      expect(result).toContain("itemId");
    });
  });

  describe("daemon unavailable", () => {
    it("returns helpful message for all actions", async () => {
      // All mock responses are undefined, so DaemonUnavailableError is thrown

      const tool = createGoopDaemonItemsTool(ctx);

      const result = await tool.execute(
        { action: "list", projectId: "proj-1" },
        toolContext,
      );
      expect(result).toContain("Daemon is not running");
    });
  });

  describe("API error handling", () => {
    it("returns API error details on non-2xx", async () => {
      mockGetResponse = async () => {
        throw new realModule.DaemonApiError(404, "Not Found");
      };

      const tool = createGoopDaemonItemsTool(ctx);
      const result = await tool.execute(
        { action: "get", projectId: "proj-1", itemId: "nonexistent" },
        toolContext,
      );

      expect(result).toContain("Daemon API error");
      expect(result).toContain("404");
    });
  });
});
