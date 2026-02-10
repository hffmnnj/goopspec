/**
 * Unit Tests for GoopSpec Status Tool
 * @module tools/goop-status/index.test
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createGoopStatusTool } from "./index.js";
import { registerAgent } from "../../features/team/registry.js";
import {
  createMockPluginContext,
  createMockToolContext,
  setupTestEnvironment,
  type PluginContext,
  type GoopState,
} from "../../test-utils.js";

describe("goop_status tool", () => {
  let ctx: PluginContext;
  let toolContext: ReturnType<typeof createMockToolContext>;
  let cleanup: () => void;
  let originalCwd: string;

  beforeEach(() => {
    const env = setupTestEnvironment("goop-status-test");
    cleanup = env.cleanup;
    ctx = createMockPluginContext({ testDir: env.testDir });
    toolContext = createMockToolContext({ directory: env.testDir });
    originalCwd = process.cwd();
    process.chdir(env.testDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    cleanup();
  });

  describe("tool creation", () => {
    it("creates tool with correct description", () => {
      const tool = createGoopStatusTool(ctx);
      
      expect(tool.description).toContain("workflow");
      expect(tool.description).toContain("state");
    });

    it("creates tool with verbose arg", () => {
      const tool = createGoopStatusTool(ctx);
      
      expect(tool.args).toHaveProperty("verbose");
    });
  });

  describe("idle state", () => {
    it("shows idle phase status", async () => {
      const tool = createGoopStatusTool(ctx);
      const result = await tool.execute({}, toolContext);

      expect(result).toContain("GoopSpec · Status");
      expect(result).toContain("idle");
    });

    it("shows project name", async () => {
      const tool = createGoopStatusTool(ctx);
      const result = await tool.execute({}, toolContext);

      expect(result).toContain("**Project:**");
      expect(result).toContain("test-project");
    });

    it("shows spec locked status", async () => {
      const tool = createGoopStatusTool(ctx);
      const result = await tool.execute({}, toolContext);

      expect(result).toContain("**Spec:**");
      expect(result).toContain("🔓");
    });

    it("shows idle phase next steps", async () => {
      const tool = createGoopStatusTool(ctx);
      const result = await tool.execute({}, toolContext);

      expect(result).toContain("→ Next:");
      expect(result).toContain("goop-plan");
    });

    it("does not show active agents when registry empty", async () => {
      const tool = createGoopStatusTool(ctx);
      const result = await tool.execute({}, toolContext);

      expect(result).not.toContain("## Active Agents");
    });
  });

  describe("active agents", () => {
    it("shows active agents when registry has entries", async () => {
      await registerAgent({
        id: "agent-123",
        type: "goop-executor",
        task: "Handle status display",
        claimedFiles: ["src/tools/goop-status/index.ts"],
        startedAt: Date.now(),
      });

      const tool = createGoopStatusTool(ctx);
      const result = await tool.execute({}, toolContext);

      expect(result).toContain("## Active Agents");
      expect(result).toContain("goop-executor");
      expect(result).toContain("Handle status display");
      expect(result).toContain("[1 file]");
    });
  });

  describe("planning phase", () => {
    beforeEach(() => {
      ctx.stateManager.updateWorkflow({ phase: "plan" });
    });

    it("shows plan phase status", async () => {
      const tool = createGoopStatusTool(ctx);
      const result = await tool.execute({}, toolContext);

      expect(result).toContain("plan");
    });

    it("shows plan phase next steps", async () => {
      const tool = createGoopStatusTool(ctx);
      const result = await tool.execute({}, toolContext);

      expect(result).toContain("goop-specify");
    });
  });

  describe("execute phase", () => {
    beforeEach(() => {
      ctx.stateManager.updateWorkflow({
        phase: "execute",
        currentWave: 2,
        totalWaves: 5,
      });
    });

    it("shows wave progress", async () => {
      const tool = createGoopStatusTool(ctx);
      const result = await tool.execute({}, toolContext);

      expect(result).toContain("**Wave:**");
      expect(result).toContain("2/5");
    });

    it("shows progress bar", async () => {
      const tool = createGoopStatusTool(ctx);
      const result = await tool.execute({}, toolContext);

      // Should show some form of progress indicator
      expect(result).toMatch(/[█░]/);
    });
  });

  describe("spec locked state", () => {
    beforeEach(() => {
      ctx.stateManager.lockSpec();
      ctx.stateManager.updateWorkflow({ phase: "specify" });
    });

    it("shows spec locked status", async () => {
      const tool = createGoopStatusTool(ctx);
      const result = await tool.execute({}, toolContext);

      expect(result).toContain("🔒");
    });
  });

  describe("acceptance confirmed state", () => {
    beforeEach(() => {
      ctx.stateManager.confirmAcceptance();
    });

    it("shows acceptance confirmed status", async () => {
      const tool = createGoopStatusTool(ctx);
      const result = await tool.execute({}, toolContext);

      expect(result).toContain("**Accepted:** ✅");
    });
  });

  describe("verbose output", () => {
    it("shows pending tasks when verbose", async () => {
      ctx.stateManager.setState({
        execution: {
          activeCheckpointId: null,
          completedPhases: [],
          pendingTasks: [
            { id: "1", name: "Task A", phase: "1", plan: "1.1", status: "pending" },
            { id: "2", name: "Task B", phase: "1", plan: "1.2", status: "in_progress" },
          ],
        },
      });

      const tool = createGoopStatusTool(ctx);
      const result = await tool.execute({ verbose: true }, toolContext);

      expect(result).toContain("Pending Tasks");
      expect(result).toContain("Task A");
      expect(result).toContain("Task B");
    });

    it("does not show pending tasks when not verbose", async () => {
      ctx.stateManager.setState({
        execution: {
          activeCheckpointId: null,
          completedPhases: [],
          pendingTasks: [
            { id: "1", name: "Task A", phase: "1", plan: "1.1", status: "pending" },
          ],
        },
      });

      const tool = createGoopStatusTool(ctx);
      const result = await tool.execute({ verbose: false }, toolContext);

      expect(result).not.toContain("### Pending Tasks");
    });
  });

  describe("completed phases", () => {
    it("shows completed phases", async () => {
      ctx.stateManager.transitionPhase("plan");
      ctx.stateManager.transitionPhase("research");

      const tool = createGoopStatusTool(ctx);
      const result = await tool.execute({ verbose: true }, toolContext);

      expect(result).toContain("Phases");
      expect(result).toContain("plan");
    });

    it("shows None when no completed phases", async () => {
      const tool = createGoopStatusTool(ctx);
      const result = await tool.execute({ verbose: true }, toolContext);

      expect(result).toContain("**Phases:** None");
    });
  });

  describe("active checkpoint", () => {
    it("shows active checkpoint when set", async () => {
      ctx.stateManager.setState({
        execution: {
          activeCheckpointId: "checkpoint-123",
          completedPhases: [],
          pendingTasks: [],
        },
      });

      const tool = createGoopStatusTool(ctx);
      const result = await tool.execute({ verbose: true }, toolContext);

      expect(result).toContain("checkpoint-123");
    });

    it("shows None when no active checkpoint", async () => {
      const tool = createGoopStatusTool(ctx);
      const result = await tool.execute({ verbose: true }, toolContext);

      expect(result).toContain("**Checkpoint:** None");
    });
  });

  describe("output size limits", () => {
    it("non-verbose output is ≤15 lines", async () => {
      const tool = createGoopStatusTool(ctx);
      const result = await tool.execute({ verbose: false }, toolContext);
      const lines = result.split("\n").filter((l: string) => l.trim().length > 0);
      expect(lines.length).toBeLessThanOrEqual(15);
    });

    it("verbose output is ≤30 lines", async () => {
      ctx.stateManager.setState({
        execution: {
          activeCheckpointId: "test-checkpoint",
          completedPhases: ["plan", "execute", "accept"],
          pendingTasks: [
            { id: "1", name: "Task A", phase: "1", plan: "1.1", status: "pending" },
          ],
        },
      });
      ctx.stateManager.updateWorkflow({
        phase: "execute",
        currentWave: 2,
        totalWaves: 5,
      });

      const tool = createGoopStatusTool(ctx);
      const result = await tool.execute({ verbose: true }, toolContext);
      const lines = result.split("\n").filter((l: string) => l.trim().length > 0);
      expect(lines.length).toBeLessThanOrEqual(30);
    });
  });

  describe("mode display", () => {
    it("shows standard mode by default", async () => {
      const tool = createGoopStatusTool(ctx);
      const result = await tool.execute({}, toolContext);

      expect(result).toContain("standard");
    });

    it("shows quick mode when set", async () => {
      ctx.stateManager.setMode("quick");

      const tool = createGoopStatusTool(ctx);
      const result = await tool.execute({}, toolContext);

      expect(result).toContain("quick");
    });

    it("shows comprehensive mode when set", async () => {
      ctx.stateManager.setMode("comprehensive");

      const tool = createGoopStatusTool(ctx);
      const result = await tool.execute({}, toolContext);

      expect(result).toContain("comprehensive");
    });

    it("shows milestone mode when set", async () => {
      ctx.stateManager.setMode("milestone");

      const tool = createGoopStatusTool(ctx);
      const result = await tool.execute({}, toolContext);

      expect(result).toContain("milestone");
    });
  });

  describe("last activity", () => {
    it("shows last activity timestamp", async () => {
      const tool = createGoopStatusTool(ctx);
      const result = await tool.execute({ verbose: true }, toolContext);

      expect(result).toContain("Last Activity");
      // Should contain an ISO timestamp
      expect(result).toMatch(/\d{4}-\d{2}-\d{2}/);
    });
  });
});
