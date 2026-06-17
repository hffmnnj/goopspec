import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import {
  createMockPluginContext,
  createMockToolContext,
  setupTestEnvironment,
} from "../../test-utils.js";
import type { PluginContext } from "../../test-utils.js";
import { createGoopStatusTool } from "./index.js";

describe("goop_status tool", () => {
  let ctx: PluginContext;
  let cleanup: () => void;

  beforeEach(() => {
    const env = setupTestEnvironment("goop-status");
    cleanup = env.cleanup;
    ctx = createMockPluginContext({ testDir: env.testDir });
  });

  afterEach(() => cleanup());

  it("returns a formatted status string", async () => {
    const tool = createGoopStatusTool(ctx);
    const result = await tool.execute({}, createMockToolContext());
    expect(result).toContain("GoopSpec");
    expect(result).toContain("Status");
    expect(result).toContain("idle");
  });

  it("shows the active workflow id", async () => {
    const tool = createGoopStatusTool(ctx);
    const result = await tool.execute({}, createMockToolContext());
    expect(result).toContain("default");
  });

  it("shows mode and depth", async () => {
    ctx.stateManager.setMode("comprehensive");
    ctx.stateManager.setDepth("deep");

    const tool = createGoopStatusTool(ctx);
    const result = await tool.execute({}, createMockToolContext());
    expect(result).toContain("comprehensive");
    expect(result).toContain("deep");
  });

  it("shows interview, spec lock, and acceptance flags", async () => {
    ctx.stateManager.completeInterview();
    ctx.stateManager.lockSpec();

    const tool = createGoopStatusTool(ctx);
    const result = await tool.execute({}, createMockToolContext());
    expect(result).toContain("\u2713 Interview");
    expect(result).toContain("\u2713 Spec Locked");
    expect(result).toContain("\u2717 Accepted");
  });

  it("shows wave progress when waves are set", async () => {
    ctx.stateManager.updateWaveProgress(2, 5);

    const tool = createGoopStatusTool(ctx);
    const result = await tool.execute({}, createMockToolContext());
    expect(result).toContain("Wave Progress");
    expect(result).toContain("2/5");
  });

  it("does not show wave progress when totalWaves is 0", async () => {
    const tool = createGoopStatusTool(ctx);
    const result = await tool.execute({}, createMockToolContext());
    expect(result).not.toContain("Wave Progress");
  });

  it("shows phase guidance for idle", async () => {
    const tool = createGoopStatusTool(ctx);
    const result = await tool.execute({}, createMockToolContext());
    expect(result).toContain("/goop-discuss");
  });

  it("shows phase guidance for execute", async () => {
    ctx.stateManager.transitionPhase("plan", true);
    ctx.stateManager.transitionPhase("execute", true);

    const tool = createGoopStatusTool(ctx);
    const result = await tool.execute({}, createMockToolContext());
    expect(result).toContain("execute");
    expect(result).toContain("/goop-accept");
  });

  it("shows autopilot status when enabled", async () => {
    ctx.stateManager.updateWorkflow({ autopilot: true, lazyAutopilot: true });

    const tool = createGoopStatusTool(ctx);
    const result = await tool.execute({}, createMockToolContext());
    expect(result).toContain("Autopilot");
    expect(result).toContain("lazy");
  });

  it("shows checkpoint when set", async () => {
    ctx.stateManager.updateWorkflow({ checkpoint: "wave-2-done" });

    const tool = createGoopStatusTool(ctx);
    const result = await tool.execute({}, createMockToolContext());
    expect(result).toContain("wave-2-done");
  });

  it("lists multiple workflows", async () => {
    ctx.stateManager.createWorkflow("feat-auth");

    const tool = createGoopStatusTool(ctx);
    const result = await tool.execute({}, createMockToolContext());
    expect(result).toContain("Workflows");
    expect(result).toContain("feat-auth");
    expect(result).toContain("default");
  });

  it("handles missing active workflow gracefully", async () => {
    // Force a broken state where active workflow doesn't exist
    const state = ctx.stateManager.getState();
    state.activeWorkflowId = "nonexistent";
    ctx.stateManager.setState(state);

    const tool = createGoopStatusTool(ctx);
    const result = await tool.execute({}, createMockToolContext());
    expect(result).toContain("No active workflow found");
  });

  it("handles errors gracefully without throwing", async () => {
    // Create a context with a broken state manager
    const brokenCtx: PluginContext = {
      ...ctx,
      stateManager: {
        ...ctx.stateManager,
        getState: () => {
          throw new Error("disk read failed");
        },
      },
    };

    const tool = createGoopStatusTool(brokenCtx);
    const result = await tool.execute({}, createMockToolContext());
    expect(result).toContain("Error");
    expect(result).toContain("disk read failed");
  });
});
