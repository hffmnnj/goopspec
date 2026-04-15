import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync } from "fs";
import { join } from "path";

import { createSession } from "../../features/session/manager.js";
import { setSession } from "../../features/session/binding.js";
import { createStateManager } from "../../features/state-manager/manager.js";
import {
  createMockPluginContext,
  createMockToolContext,
  setupTestEnvironment,
  type PluginContext,
} from "../../test-utils.js";

import { createGoopStateTool } from "./index.js";

describe("goop_state tool", () => {
  let ctx: PluginContext;
  let cleanup: () => void;

  beforeEach(() => {
    const env = setupTestEnvironment("goop-state-test");
    cleanup = env.cleanup;
    ctx = createMockPluginContext({ testDir: env.testDir });
    ctx.stateManager = createStateManager(env.testDir, "test-project", ctx.config);
  });

  afterEach(() => {
    cleanup();
  });

  it("shows state output when no session is bound", async () => {
    const tool = createGoopStateTool(ctx);
    const result = await tool.execute({ action: "get" }, createMockToolContext());

    expect(result).toContain("GoopSpec");
    expect(result).toContain("**Workflow ID:** default");
    expect(result).toContain("Phase:");
  });

  it("uses session-bound state manager when a session is active", async () => {
    createSession(ctx.input.directory, "feat-auth");
    setSession(ctx, "feat-auth");

    const tool = createGoopStateTool(ctx);
    await tool.execute({ action: "transition", phase: "plan" }, createMockToolContext());
    const result = await tool.execute({ action: "get" }, createMockToolContext());

    // state.json always lives at root .goopspec/ (since Wave 2 path scoping)
    const rootStatePath = join(ctx.input.directory, ".goopspec", "state.json");

    expect(result).toContain("Phase:");
    expect(result).toContain("plan");
    expect(existsSync(rootStatePath)).toBe(true);
  });

  describe("set-autopilot action", () => {
    it("enables autopilot when autopilot is true", async () => {
      const tool = createGoopStateTool(ctx);
      const result = await tool.execute(
        { action: "set-autopilot", autopilot: true },
        createMockToolContext()
      );

      expect(result).toContain("Autopilot enabled");
      const state = ctx.stateManager.getState();
      expect(state.workflow.autopilot).toBe(true);
    });

    it("disables autopilot when autopilot is false", async () => {
      const tool = createGoopStateTool(ctx);
      const result = await tool.execute(
        { action: "set-autopilot", autopilot: false },
        createMockToolContext()
      );

      expect(result).toContain("Autopilot disabled");
      const state = ctx.stateManager.getState();
      expect(state.workflow.autopilot).toBe(false);
    });

    it("enables lazy autopilot when autopilot is true and lazy is true", async () => {
      const tool = createGoopStateTool(ctx);
      const result = await tool.execute(
        { action: "set-autopilot", autopilot: true, lazy: true },
        createMockToolContext()
      );

      expect(result).toContain("Lazy Autopilot enabled");
      const state = ctx.stateManager.getState();
      expect(state.workflow.autopilot).toBe(true);
      expect(state.workflow.lazyAutopilot).toBe(true);
    });

    it("enables regular autopilot and clears lazyAutopilot when lazy is false", async () => {
      const tool = createGoopStateTool(ctx);
      await tool.execute(
        { action: "set-autopilot", autopilot: true, lazy: true },
        createMockToolContext()
      );

      const result = await tool.execute(
        { action: "set-autopilot", autopilot: true },
        createMockToolContext()
      );

      expect(result).toContain("Autopilot enabled");
      expect(result).not.toContain("Lazy");
      const state = ctx.stateManager.getState();
      expect(state.workflow.autopilot).toBe(true);
      expect(state.workflow.lazyAutopilot).toBe(false);
    });

    it("clears both autopilot and lazyAutopilot when autopilot is false", async () => {
      const tool = createGoopStateTool(ctx);
      await tool.execute(
        { action: "set-autopilot", autopilot: true, lazy: true },
        createMockToolContext()
      );

      const result = await tool.execute(
        { action: "set-autopilot", autopilot: false },
        createMockToolContext()
      );

      expect(result).toContain("disabled");
      const state = ctx.stateManager.getState();
      expect(state.workflow.autopilot).toBe(false);
      expect(state.workflow.lazyAutopilot).toBe(false);
    });

    it("returns error when autopilot param is missing", async () => {
      const tool = createGoopStateTool(ctx);
      const result = await tool.execute(
        { action: "set-autopilot" },
        createMockToolContext()
      );

      expect(result).toContain("Error");
      expect(result).toContain("autopilot");
    });
  });

  describe("list-workflows action", () => {
    it("returns helpful message when no workflows exist", async () => {
      // Override with a state manager that has empty workflows
      ctx.stateManager.setState({ workflows: {} });
      // Override listWorkflows to return empty
      const origList = ctx.stateManager.listWorkflows;
      ctx.stateManager.listWorkflows = () => [];

      const tool = createGoopStateTool(ctx);
      const result = await tool.execute(
        { action: "list-workflows" },
        createMockToolContext()
      );

      expect(result).toContain("No workflows found");
      expect(result).toContain("/goop-discuss");

      ctx.stateManager.listWorkflows = origList;
    });

    it("shows table with active marker for existing workflows", async () => {
      ctx.stateManager.createWorkflow("feat-auth");
      ctx.stateManager.createWorkflow("feat-billing");

      const tool = createGoopStateTool(ctx);
      const result = await tool.execute(
        { action: "list-workflows" },
        createMockToolContext()
      );

      expect(result).toContain("## Workflows");
      expect(result).toContain("default");
      expect(result).toContain("feat-auth");
      expect(result).toContain("feat-billing");
      expect(result).toContain("►");
      expect(result).toContain("Active: default");
    });
  });

  describe("create-workflow action", () => {
    it("returns error when workflowId is missing", async () => {
      const tool = createGoopStateTool(ctx);
      const result = await tool.execute(
        { action: "create-workflow" },
        createMockToolContext()
      );

      expect(result).toContain("Error");
      expect(result).toContain("workflowId");
    });

    it("returns error for invalid format", async () => {
      const tool = createGoopStateTool(ctx);
      const result = await tool.execute(
        { action: "create-workflow", workflowId: "Invalid Name!" },
        createMockToolContext()
      );

      expect(result).toContain("Error");
      expect(result).toContain("Invalid workflow ID");
      expect(result).toContain("kebab-case");
    });

    it("returns error for single character ID", async () => {
      const tool = createGoopStateTool(ctx);
      const result = await tool.execute(
        { action: "create-workflow", workflowId: "a" },
        createMockToolContext()
      );

      expect(result).toContain("Error");
      expect(result).toContain("min 2 chars");
    });

    it("successfully creates a new workflow", async () => {
      const tool = createGoopStateTool(ctx);
      const result = await tool.execute(
        { action: "create-workflow", workflowId: "feat-auth" },
        createMockToolContext()
      );

      expect(result).toContain("✓");
      expect(result).toContain("feat-auth");
      expect(result).toContain("created");
      expect(result).toContain("Phase: idle");

      // Verify it actually exists
      const wf = ctx.stateManager.getWorkflow("feat-auth");
      expect(wf).not.toBeNull();
      expect(wf!.workflowId).toBe("feat-auth");
    });

    it("returns no-op success for duplicate workflow ID", async () => {
      ctx.stateManager.createWorkflow("feat-auth");

      const tool = createGoopStateTool(ctx);
      const result = await tool.execute(
        { action: "create-workflow", workflowId: "feat-auth" },
        createMockToolContext()
      );

      // Idempotent — duplicate create is a safe no-op, not an error
      expect(result).toContain("already exists");
      expect(result).toContain("set-active-workflow");
      expect(result).not.toContain("✗ Error");
    });
  });

  describe("set-active-workflow action", () => {
    it("returns error when workflowId is missing", async () => {
      const tool = createGoopStateTool(ctx);
      const result = await tool.execute(
        { action: "set-active-workflow" },
        createMockToolContext()
      );

      expect(result).toContain("Error");
      expect(result).toContain("workflowId");
    });

    it("returns error for nonexistent workflow", async () => {
      const tool = createGoopStateTool(ctx);
      const result = await tool.execute(
        { action: "set-active-workflow", workflowId: "nonexistent" },
        createMockToolContext()
      );

      expect(result).toContain("Error");
      expect(result).toContain("not found");
      expect(result).toContain("list-workflows");
    });

    it("successfully switches to an existing workflow", async () => {
      ctx.stateManager.createWorkflow("feat-auth");

      const tool = createGoopStateTool(ctx);
      const result = await tool.execute(
        { action: "set-active-workflow", workflowId: "feat-auth" },
        createMockToolContext()
      );

      expect(result).toContain("✓");
      expect(result).toContain("feat-auth");
      expect(ctx.stateManager.getActiveWorkflowId()).toBe("feat-auth");
      expect(ctx.workflowId).toBe("feat-auth");
    });
  });
});
