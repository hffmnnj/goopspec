import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import {
  type PluginContext,
  createMockPluginContext,
  createMockToolContext,
  setupTestEnvironment,
} from "../../test-utils.js";
import { createGoopWriteWaveTool } from "../goop-write-wave/index.js";
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

  // Empty array is treated identically to omitting wave_numbers — both return
  // every wave for the workflow. Pin the boundary so a serialization layer
  // injecting [] cannot accidentally narrow the read.
  it("an empty wave_numbers array returns every wave, matching an omitted filter", async () => {
    const workflowId = ctx.stateManager.getState().activeWorkflowId;
    ctx.db.upsertWave(workflowId, { wave_number: 1, title: "Wave one", status: "done" });
    ctx.db.upsertWave(workflowId, { wave_number: 2, title: "Wave two", status: "pending" });

    const tool = createGoopReadWaveTool(ctx);
    const emptyResult = await tool.execute({ wave_numbers: [] }, createMockToolContext());
    const omittedResult = await tool.execute({}, createMockToolContext());

    expect(emptyResult).toContain("Wave 1: Wave one");
    expect(emptyResult).toContain("Wave 2: Wave two");
    expect(emptyResult).toBe(omittedResult);
  });

  // Contract pin: goop_read_wave reads TRACKING rows only, never workflow
  // documents. A spec/blueprint written to the DB does not surface here — that
  // is goop_read_db's job. This locks the redirect the description states.
  it("does not surface workflow documents (spec/blueprint) — those belong to goop_read_db", async () => {
    const workflowId = ctx.stateManager.getState().activeWorkflowId;
    ctx.db.upsertWave(workflowId, { wave_number: 1, title: "Wave one", status: "pending" });
    // Write a document row of a type goop_read_db would return.
    ctx.db.upsertDocument(workflowId, "spec", "# Spec prose\nVision goes here");

    const tool = createGoopReadWaveTool(ctx);
    const result = await tool.execute({}, createMockToolContext());

    expect(result).toContain("Wave 1: Wave one");
    expect(result).not.toContain("Spec prose");
    expect(result).not.toContain("Vision goes here");
  });
});

describe("goop_read_wave regression and durability", () => {
  let ctx: PluginContext;
  let cleanup: () => void;

  beforeEach(() => {
    const env = setupTestEnvironment("read-wave-regression");
    cleanup = env.cleanup;
    ctx = createMockPluginContext({ testDir: env.testDir, db: env.db });
  });

  afterEach(() => cleanup());

  it("rendered progress agrees with rendered rows for legacy 'complete' task status", async () => {
    // Defect A: a wave rendered "progress: 0/3" beside three [complete] rows.
    // The counter refused to count a status the renderer happily printed.
    // Using 'complete' (the legacy near-miss) exercises both the write-side
    // normalisation (complete -> completed) and the read-side unified
    // completion predicate so the counter and rows can never disagree.
    const writeTool = createGoopWriteWaveTool(ctx);
    await writeTool.execute(
      {
        wave_number: 1,
        title: "Phantom progress wave",
        tasks: [
          { task_index: 1, description: "Task one", status: "complete" },
          { task_index: 2, description: "Task two", status: "complete" },
          { task_index: 3, description: "Task three", status: "complete" },
        ],
      },
      createMockToolContext(),
    );

    const readTool = createGoopReadWaveTool(ctx);
    const result = await readTool.execute({}, createMockToolContext());

    expect(result).toContain("progress: 3/3 tasks complete");
  });

  it("durability: top-level status write is reflected by a subsequent read", async () => {
    const writeTool = createGoopWriteWaveTool(ctx);
    await writeTool.execute(
      {
        wave_number: 1,
        title: "Status wave",
        status: "complete",
        // Wave-completion gate (Wave 2) requires at least one passing or
        // explicit-skip verification row before a wave can transition to a
        // complete status. The durability scenario is a completed wave, so it
        // carries completion evidence.
        verifications: [{ check_name: "test", status: "pass" }],
      },
      createMockToolContext(),
    );

    const readTool = createGoopReadWaveTool(ctx);
    const result = await readTool.execute({}, createMockToolContext());

    expect(result).toContain("status: completed");
  });

  it("durability: items[] batch write is reflected by a subsequent read", async () => {
    const writeTool = createGoopWriteWaveTool(ctx);
    await writeTool.execute(
      {
        wave_number: 1,
        items: [
          {
            wave_number: 1,
            title: "Items wave",
            status: "complete",
            verifications: [{ check_name: "test", status: "pass" }],
          },
        ],
      },
      createMockToolContext(),
    );

    const readTool = createGoopReadWaveTool(ctx);
    const result = await readTool.execute({}, createMockToolContext());

    expect(result).toContain("status: completed");
  });
});

describe("goop_read_wave verification and traceability surfacing", () => {
  let ctx: PluginContext;
  let cleanup: () => void;

  beforeEach(() => {
    const env = setupTestEnvironment("read-wave-surface");
    cleanup = env.cleanup;
    ctx = createMockPluginContext({ testDir: env.testDir, db: env.db });
  });

  afterEach(() => cleanup());

  it("round-trip: verifications and traceability written via items[] are readable via goop_read_wave", async () => {
    const writeTool = createGoopWriteWaveTool(ctx);
    await writeTool.execute(
      {
        wave_number: 1,
        items: [
          {
            wave_number: 1,
            title: "Round-trip wave",
            status: "in_progress",
            verifications: [
              { check_name: "typecheck", status: "pass", detail: "No errors" },
              { check_name: "lint", status: "fail", detail: "2 issues" },
            ],
            traceability: [
              { requirement_key: "MH1", task_index: 1, status: "covered" },
              { requirement_key: "MH2", status: "pending" },
            ],
          },
        ],
      },
      createMockToolContext(),
    );

    const readTool = createGoopReadWaveTool(ctx);
    const result = await readTool.execute({}, createMockToolContext());

    // Verifications appear with check name, status, and detail. The read side
    // renders the DB's canonical status vocabulary (passed/failed/skipped),
    // not the tool-input vocabulary (pass/fail/skip) — recordVerification
    // normalises at the insertion seam.
    expect(result).toContain("### Verifications");
    expect(result).toContain("typecheck: passed — No errors");
    expect(result).toContain("lint: failed — 2 issues");

    // Traceability appears with requirement key and resolved wave/task target
    expect(result).toContain("### Traceability");
    expect(result).toContain("MH1 -> wave 1, task 1 [covered]");
    expect(result).toContain("MH2 -> wave 1 [pending]");
  });

  it("does not render empty verification or traceability headings for a wave with no side-payload rows", async () => {
    const workflowId = ctx.stateManager.getState().activeWorkflowId;
    ctx.db.upsertWave(workflowId, { wave_number: 1, title: "Clean wave", status: "pending" });

    const tool = createGoopReadWaveTool(ctx);
    const result = await tool.execute({}, createMockToolContext());

    expect(result).toContain("## Wave 1: Clean wave");
    expect(result).not.toContain("### Verifications");
    expect(result).not.toContain("### Traceability");
  });

  it("wave_numbers filter does not leak verifications or traceability from unrequested waves", async () => {
    const writeTool = createGoopWriteWaveTool(ctx);
    await writeTool.execute(
      {
        wave_number: 1,
        items: [
          {
            wave_number: 1,
            title: "Wave one",
            verifications: [{ check_name: "test", status: "pass" }],
            traceability: [{ requirement_key: "MH1", status: "covered" }],
          },
          {
            wave_number: 2,
            title: "Wave two",
            verifications: [{ check_name: "lint", status: "fail" }],
            traceability: [{ requirement_key: "MH2", status: "pending" }],
          },
        ],
      },
      createMockToolContext(),
    );

    const readTool = createGoopReadWaveTool(ctx);
    const result = await readTool.execute({ wave_numbers: [1] }, createMockToolContext());

    // Wave 1 data appears
    expect(result).toContain("## Wave 1: Wave one");
    expect(result).toContain("test: passed");
    expect(result).toContain("MH1 -> wave 1 [covered]");

    // Wave 2 data does NOT leak
    expect(result).not.toContain("## Wave 2: Wave two");
    expect(result).not.toContain("lint: failed");
    expect(result).not.toContain("MH2");
  });
});
