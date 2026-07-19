import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import {
  type PluginContext,
  createMockPluginContext,
  setupTestEnvironment,
} from "../../test-utils.js";
import type { WaveRow } from "./types.js";
import { formatWave, formatWaves } from "./wave-format.js";

describe("wave-format", () => {
  let ctx: PluginContext;
  let cleanup: () => void;

  beforeEach(() => {
    const env = setupTestEnvironment("wave-format");
    cleanup = env.cleanup;
    ctx = createMockPluginContext({ testDir: env.testDir, db: env.db });
  });

  afterEach(() => cleanup());

  function getWave(workflowId: string, waveNumber: number): WaveRow {
    const wave = ctx.db.getWave(workflowId, waveNumber);
    expect(wave).not.toBeNull();
    return wave as WaveRow;
  }

  it("formats a single wave with tasks", () => {
    const workflowId = ctx.stateManager.getState().activeWorkflowId;
    ctx.db.upsertWave(workflowId, {
      wave_number: 1,
      title: "First wave",
      status: "in_progress",
    });
    const wave = getWave(workflowId, 1);
    ctx.db.upsertWaveTask({
      wave_id: wave.id,
      workflow_id: workflowId,
      task_index: 1,
      description: "Do the thing",
      agent: "executor-medium",
      status: "in_progress",
    });

    const rendered = formatWave(ctx.db, wave);
    expect(rendered).toContain("## Wave 1: First wave");
    expect(rendered).toContain("- status: in_progress");
    expect(rendered).toContain("- progress: 0/1 tasks complete");
    expect(rendered).toContain("- 1. [in_progress] Do the thing");
    expect(rendered).toContain("  - agent: executor-medium");
  });

  it("formats a wave with progress from the view", () => {
    const workflowId = ctx.stateManager.getState().activeWorkflowId;
    ctx.db.upsertWave(workflowId, {
      wave_number: 1,
      title: "Done wave",
      status: "done",
    });
    const wave = getWave(workflowId, 1);
    ctx.db.upsertWaveTask({
      wave_id: wave.id,
      workflow_id: workflowId,
      task_index: 1,
      description: "Task one",
      status: "done",
    });
    ctx.db.upsertWaveTask({
      wave_id: wave.id,
      workflow_id: workflowId,
      task_index: 2,
      description: "Task two",
      status: "done",
    });

    const progress = ctx.db.getWaveProgress(workflowId, 1)[0];
    const rendered = formatWave(ctx.db, wave, progress);
    expect(rendered).toContain("- progress: 2/2 tasks complete");
  });

  it("formats a wave with PR fields", () => {
    const workflowId = ctx.stateManager.getState().activeWorkflowId;
    ctx.db.upsertWave(workflowId, {
      wave_number: 1,
      title: "PR wave",
      status: "in_progress",
      pr_branch: "feat/wave-read-tool",
      pr_url: "https://github.com/example/repo/pull/1",
    });
    const wave = getWave(workflowId, 1);

    const rendered = formatWave(ctx.db, wave);
    expect(rendered).toContain("- pr_branch: feat/wave-read-tool");
    expect(rendered).toContain("- pr_url: https://github.com/example/repo/pull/1");
  });

  it("omits PR fields when absent", () => {
    const workflowId = ctx.stateManager.getState().activeWorkflowId;
    ctx.db.upsertWave(workflowId, {
      wave_number: 1,
      title: "No PR wave",
      status: "pending",
    });
    const wave = getWave(workflowId, 1);

    const rendered = formatWave(ctx.db, wave);
    expect(rendered).not.toContain("pr_branch");
    expect(rendered).not.toContain("pr_url");
  });

  it("shows the empty-tasks placeholder", () => {
    const workflowId = ctx.stateManager.getState().activeWorkflowId;
    ctx.db.upsertWave(workflowId, {
      wave_number: 1,
      title: "Empty wave",
      status: "pending",
    });
    const wave = getWave(workflowId, 1);

    const rendered = formatWave(ctx.db, wave);
    expect(rendered).toContain("_(No tasks found.)_");
  });

  it("formats multiple waves joined by dividers", () => {
    const workflowId = ctx.stateManager.getState().activeWorkflowId;
    ctx.db.upsertWave(workflowId, {
      wave_number: 1,
      title: "Wave one",
      status: "done",
    });
    const waveOne = getWave(workflowId, 1);
    ctx.db.upsertWave(workflowId, {
      wave_number: 2,
      title: "Wave two",
      status: "in_progress",
    });
    const waveTwo = getWave(workflowId, 2);

    const waves = [waveOne, waveTwo];
    const rendered = formatWaves(ctx.db, workflowId, waves);
    expect(rendered).toContain("## Wave 1: Wave one");
    expect(rendered).toContain("## Wave 2: Wave two");
    expect(rendered).toContain("\n\n---\n\n");
  });

  it("formats empty wave list message", () => {
    const workflowId = ctx.stateManager.getState().activeWorkflowId;
    const rendered = formatWaves(ctx.db, workflowId, []);
    expect(rendered).toContain("No waves found for workflow");
    expect(rendered).toContain("Use goop_write_wave to create one.");
  });

  it("formats empty filtered wave list with wave numbers", () => {
    const workflowId = ctx.stateManager.getState().activeWorkflowId;
    const rendered = formatWaves(ctx.db, workflowId, [], [2, 3]);
    expect(rendered).toContain("No wave numbers [2, 3] found for workflow");
  });

  it("respects wave number filter when formatting waves", () => {
    const workflowId = ctx.stateManager.getState().activeWorkflowId;
    ctx.db.upsertWave(workflowId, {
      wave_number: 1,
      title: "Wave one",
      status: "done",
    });
    ctx.db.upsertWave(workflowId, {
      wave_number: 2,
      title: "Wave two",
      status: "in_progress",
    });
    ctx.db.upsertWaveTask({
      wave_id: getWave(workflowId, 2).id,
      workflow_id: workflowId,
      task_index: 1,
      description: "Filtered task",
      status: "in_progress",
    });

    const waves = ctx.db.getWaves(workflowId, [2]);
    const rendered = formatWaves(ctx.db, workflowId, waves, [2]);
    expect(rendered).toContain("## Wave 2: Wave two");
    expect(rendered).toContain("- 1. [in_progress] Filtered task");
    expect(rendered).not.toContain("## Wave 1: Wave one");
  });
});
