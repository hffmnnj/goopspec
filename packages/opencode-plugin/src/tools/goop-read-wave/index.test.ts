import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import {
  type PluginContext,
  createMockPluginContext,
  createMockToolContext,
  setupTestEnvironment,
} from "../../test-utils.js";
import { createGoopReadWaveTool } from "./index.js";

describe("goop_read_wave tool", () => {
  let ctx: PluginContext;
  let cleanup: () => void;

  beforeEach(() => {
    const env = setupTestEnvironment("read-wave");
    cleanup = env.cleanup;
    ctx = createMockPluginContext({ testDir: env.testDir, db: env.db });
  });

  afterEach(() => cleanup());

  it("returns a 'no waves' message for an empty workflow", async () => {
    const workflowId = ctx.stateManager.getState().activeWorkflowId;
    const tool = createGoopReadWaveTool(ctx);

    const result = await tool.execute({}, createMockToolContext());

    expect(result).toContain(`No waves found for workflow '${workflowId}'.`);
    expect(result).toContain("Use goop_write_wave to create one.");
  });

  it("renders multiple waves with tasks and progress", async () => {
    const workflowId = ctx.stateManager.getState().activeWorkflowId;

    ctx.db.upsertWave(workflowId, {
      wave_number: 1,
      title: "Wave one",
      status: "in_progress",
      pr_branch: "feat/wave-one",
      pr_url: "https://github.com/example/pull/1",
    });
    ctx.db.upsertWave(workflowId, {
      wave_number: 2,
      title: "Wave two",
      status: "pending",
    });

    // Tasks are stored via wave_id, so retrieve the rows to learn their ids.
    const waveOne = ctx.db.getWave(workflowId, 1);
    const waveTwo = ctx.db.getWave(workflowId, 2);
    if (!waveOne || !waveTwo) {
      throw new Error("Failed to create waves in test setup");
    }

    ctx.db.upsertWaveTask({
      wave_id: waveOne.id,
      workflow_id: workflowId,
      task_index: 1,
      description: "Implement feature",
      agent: "goop-executor-medium",
      status: "in_progress",
    });
    ctx.db.upsertWaveTask({
      wave_id: waveOne.id,
      workflow_id: workflowId,
      task_index: 2,
      description: "Add tests",
      status: "pending",
    });
    ctx.db.upsertWaveTask({
      wave_id: waveTwo.id,
      workflow_id: workflowId,
      task_index: 1,
      description: "Verify integration",
      status: "pending",
    });

    const tool = createGoopReadWaveTool(ctx);
    const result = await tool.execute({}, createMockToolContext());

    // Wave headers and metadata
    expect(result).toContain("Wave 1: Wave one");
    expect(result).toContain("Wave 2: Wave two");
    expect(result).toContain("status: in_progress");
    expect(result).toContain("status: pending");
    expect(result).toContain("pr_branch: feat/wave-one");
    expect(result).toContain("pr_url: https://github.com/example/pull/1");

    // Tasks and agents
    expect(result).toContain("1. [in_progress] Implement feature");
    expect(result).toContain("agent: goop-executor-medium");
    expect(result).toContain("2. [pending] Add tests");
    expect(result).toContain("1. [pending] Verify integration");

    // Matches shared formatter output exactly
    const { formatWaves } = await import("../../features/db/wave-format.js");
    const waves = ctx.db.getWaves(workflowId);
    expect(result).toBe(formatWaves(ctx.db, workflowId, waves));
  });

  it("filters waves by wave_numbers", async () => {
    const workflowId = ctx.stateManager.getState().activeWorkflowId;

    ctx.db.upsertWave(workflowId, { wave_number: 1, title: "Wave one", status: "done" });
    ctx.db.upsertWave(workflowId, { wave_number: 2, title: "Wave two", status: "in_progress" });
    ctx.db.upsertWave(workflowId, { wave_number: 3, title: "Wave three", status: "pending" });

    const tool = createGoopReadWaveTool(ctx);
    const result = await tool.execute({ wave_numbers: [1, 3] }, createMockToolContext());

    expect(result).toContain("Wave 1: Wave one");
    expect(result).toContain("Wave 3: Wave three");
    expect(result).not.toContain("Wave 2: Wave two");
  });

  it("uses provided workflow_id when present", async () => {
    ctx.stateManager.createWorkflow("other-wf");
    ctx.db.upsertWave("other-wf", { wave_number: 1, title: "Other wave", status: "done" });

    const activeId = ctx.stateManager.getState().activeWorkflowId;
    const tool = createGoopReadWaveTool(ctx);

    const result = await tool.execute({ workflow_id: "other-wf" }, createMockToolContext());

    expect(result).toContain("Wave 1: Other wave");
    expect(result).not.toContain(`No waves found for workflow '${activeId}'.`);
  });

  it("handles a wave_numbers filter that matches no waves", async () => {
    const workflowId = ctx.stateManager.getState().activeWorkflowId;
    ctx.db.upsertWave(workflowId, { wave_number: 1, title: "Wave one", status: "done" });

    const tool = createGoopReadWaveTool(ctx);
    const result = await tool.execute({ wave_numbers: [99] }, createMockToolContext());

    expect(result).toContain("No wave numbers [99] found for workflow");
  });
});
