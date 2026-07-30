import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import { GoopSpecDB } from "../../features/db/index.js";
import {
  TASK_STATUSES,
  WAVE_STATUSES,
  type WaveStatus,
  normalizeStatus,
} from "../../features/db/types.js";
import type { PluginContext, ToolContext } from "../../test-utils.js";
import {
  createMockPluginContext,
  createMockToolContext,
  setupTestEnvironment,
} from "../../test-utils.js";
import { createGoopReadWaveTool } from "../goop-read-wave/index.js";
import { createGoopWriteWaveTool } from "./index.js";

describe("goop_write_wave tool", () => {
  let ctx: PluginContext;
  let toolCtx: ToolContext;
  let cleanup: () => void;

  beforeEach(() => {
    const env = setupTestEnvironment("goop-write-wave");
    cleanup = env.cleanup;
    ctx = createMockPluginContext({ testDir: env.testDir, db: env.db });
    toolCtx = createMockToolContext();
  });

  afterEach(() => cleanup());

  it("writes a wave with inline tasks and logs a wave_write event", async () => {
    const writeTool = createGoopWriteWaveTool(ctx);
    const result = await writeTool.execute(
      {
        wave_number: 2,
        title: "Section and wave tools",
        status: "in_progress",
        pr_branch: "feat/section-wave-tools",
        tasks: [
          {
            task_index: 1,
            description: "Build section tools",
            agent: "goop-executor-medium",
            status: "done",
          },
          { task_index: 2, description: "Build wave tools", agent: "goop-executor-medium" },
          { task_index: 3, description: "Register tools later", status: "pending" },
        ],
      },
      toolCtx,
    );

    expect(result).toContain("Written wave 2");
    expect(result).toContain("3 task(s)");

    const wave = ctx.db.getWave("default", 2);
    expect(wave).not.toBeNull();
    expect(wave?.title).toBe("Section and wave tools");
    expect(wave?.pr_branch).toBe("feat/section-wave-tools");

    const tasks = ctx.db.getWaveTasks(wave?.id ?? -1);
    expect(tasks.length).toBe(3);
    expect(tasks[0].status).toBe("done");

    const events = ctx.db.getEvents("default", "wave_write");
    expect(events.length).toBe(1);
    expect(JSON.parse(events[0].payload).wave_number).toBe(2);
  });

  it("updates one task status without rewriting wave metadata", async () => {
    const writeTool = createGoopWriteWaveTool(ctx);
    await writeTool.execute(
      {
        wave_number: 2,
        title: "Original title",
        tasks: [
          { task_index: 1, description: "First task" },
          { task_index: 2, description: "Second task" },
          { task_index: 3, description: "Third task" },
        ],
      },
      toolCtx,
    );

    const updateResult = await writeTool.execute(
      { wave_number: 2, task_update: { task_index: 2, status: "done" } },
      toolCtx,
    );

    expect(updateResult).toContain("Updated task 2");
    const wave = ctx.db.getWave("default", 2);
    const tasks = ctx.db.getWaveTasks(wave?.id ?? -1);
    expect(wave?.title).toBe("Original title");
    expect(tasks[1].status).toBe("done");
  });

  it("proves the progress view reflects task status updates", async () => {
    const writeTool = createGoopWriteWaveTool(ctx);
    await writeTool.execute(
      {
        wave_number: 2,
        title: "Progress wave",
        tasks: [
          { task_index: 1, description: "One" },
          { task_index: 2, description: "Two" },
          { task_index: 3, description: "Three" },
        ],
      },
      toolCtx,
    );
    await writeTool.execute(
      { wave_number: 2, task_update: { task_index: 2, status: "done" } },
      toolCtx,
    );

    const progress = ctx.db.getWaveProgress("default", 2);
    expect(progress).toHaveLength(1);
    expect(progress[0].completed_tasks).toBe(1);
    expect(progress[0].total_tasks).toBe(3);

    const tasks = ctx.db.getWaveTasks(progress[0].wave_id);
    expect(tasks[1].status).toBe("done");
  });
});

describe("goop_write_wave batch mode", () => {
  let ctx: PluginContext;
  let toolCtx: ToolContext;
  let cleanup: () => void;

  beforeEach(() => {
    const env = setupTestEnvironment("goop-write-wave-batch");
    cleanup = env.cleanup;
    ctx = createMockPluginContext({ testDir: env.testDir, db: env.db });
    toolCtx = createMockToolContext();
  });

  afterEach(() => cleanup());

  it("empty items array falls through to single-wave path", async () => {
    const tool = createGoopWriteWaveTool(ctx);
    const result = await tool.execute(
      { wave_number: 1, title: "Fallback Wave", items: [] },
      toolCtx,
    );
    expect(result).toContain("Written wave 1");
    expect(ctx.db.getWave("default", 1)?.title).toBe("Fallback Wave");
  });

  it("returns error when items array is empty and no wave fields are provided", async () => {
    const tool = createGoopWriteWaveTool(ctx);
    const result = await tool.execute({ wave_number: 1, items: [] }, toolCtx);
    expect(result).toContain("Error in goop_write_wave");
    expect(result).toContain("items[] array is empty");
    expect(result).not.toContain("succeeded");
  });

  it("writes single-element items array", async () => {
    const tool = createGoopWriteWaveTool(ctx);
    const result = await tool.execute(
      {
        wave_number: 1,
        items: [{ wave_number: 1, title: "Wave One" }],
      },
      toolCtx,
    );
    expect(result).toContain("1/1 succeeded");
    expect(ctx.db.getWave("default", 1)).not.toBeNull();
  });

  it("writes multi-element items array", async () => {
    const tool = createGoopWriteWaveTool(ctx);
    const result = await tool.execute(
      {
        wave_number: 1,
        items: [
          { wave_number: 1, title: "Wave One" },
          { wave_number: 2, title: "Wave Two", status: "pending" },
        ],
      },
      toolCtx,
    );
    expect(result).toContain("2/2 succeeded");
    expect(ctx.db.getWave("default", 1)).not.toBeNull();
    expect(ctx.db.getWave("default", 2)).not.toBeNull();
  });

  it("bulk task_updates applies multiple task status changes", async () => {
    const tool = createGoopWriteWaveTool(ctx);
    await tool.execute(
      {
        wave_number: 1,
        title: "Wave One",
        tasks: [
          { task_index: 1, description: "Task 1", status: "pending" },
          { task_index: 2, description: "Task 2", status: "pending" },
        ],
      },
      toolCtx,
    );

    const result = await tool.execute(
      {
        wave_number: 1,
        task_updates: [
          { task_index: 1, status: "complete" },
          { task_index: 2, status: "complete" },
        ],
      },
      toolCtx,
    );
    expect(result).toContain("2/2 succeeded");
  });

  it("task_updates returns message if wave not found", async () => {
    const tool = createGoopWriteWaveTool(ctx);
    const result = await tool.execute(
      {
        wave_number: 999,
        task_updates: [{ task_index: 1, status: "complete" }],
      },
      toolCtx,
    );
    expect(result).toContain("No wave 999");
  });

  it("backward-compat: single wave_number path works when items and task_updates absent", async () => {
    const tool = createGoopWriteWaveTool(ctx);
    const result = await tool.execute({ wave_number: 1, title: "Single Wave" }, toolCtx);
    expect(result).toContain("wave 1");
  });

  it("appends compact reminder when single wave is written with terminal status", async () => {
    const tool = createGoopWriteWaveTool(ctx);
    const result = await tool.execute(
      { wave_number: 1, title: "Done wave", status: "done" },
      toolCtx,
    );
    expect(result).toContain("Written wave 1");
    expect(result).toContain("goop_compact");
    expect(result).toContain("next_step");
  });

  it("does not append compact reminder when single wave status is non-terminal", async () => {
    const tool = createGoopWriteWaveTool(ctx);
    const pendingResult = await tool.execute(
      { wave_number: 1, title: "Pending wave", status: "pending" },
      toolCtx,
    );
    expect(pendingResult).toContain("Written wave 1");
    expect(pendingResult).not.toContain("goop_compact");

    const inProgressResult = await tool.execute(
      { wave_number: 2, title: "In progress wave", status: "in_progress" },
      toolCtx,
    );
    expect(inProgressResult).toContain("Written wave 2");
    expect(inProgressResult).not.toContain("goop_compact");

    const noStatusResult = await tool.execute({ wave_number: 3, title: "No status wave" }, toolCtx);
    expect(noStatusResult).toContain("Written wave 3");
    expect(noStatusResult).not.toContain("goop_compact");
  });

  it("does not append compact reminder for task_update path", async () => {
    const tool = createGoopWriteWaveTool(ctx);
    await tool.execute(
      {
        wave_number: 1,
        title: "Wave One",
        tasks: [{ task_index: 1, description: "Task 1", status: "pending" }],
      },
      toolCtx,
    );

    const result = await tool.execute(
      { wave_number: 1, task_update: { task_index: 1, status: "done" } },
      toolCtx,
    );
    expect(result).toContain("Updated task 1");
    expect(result).not.toContain("goop_compact");
  });

  it("appends compact reminder when items batch contains a terminal wave", async () => {
    const tool = createGoopWriteWaveTool(ctx);
    const result = await tool.execute(
      {
        wave_number: 1,
        items: [
          { wave_number: 1, title: "Pending batch wave", status: "pending" },
          { wave_number: 2, title: "Completed batch wave", status: "completed" },
        ],
      },
      toolCtx,
    );
    expect(result).toContain("2/2 succeeded");
    expect(result).toContain("goop_compact");
    expect(result).toContain("next_step");
  });

  it("does not append compact reminder when items batch has only non-terminal waves", async () => {
    const tool = createGoopWriteWaveTool(ctx);
    const result = await tool.execute(
      {
        wave_number: 1,
        items: [
          { wave_number: 1, title: "Pending batch wave", status: "pending" },
          { wave_number: 2, title: "In progress batch wave", status: "in_progress" },
        ],
      },
      toolCtx,
    );
    expect(result).toContain("2/2 succeeded");
    expect(result).not.toContain("goop_compact");
  });

  it("does not append compact reminder for task_updates batch path", async () => {
    const tool = createGoopWriteWaveTool(ctx);
    await tool.execute(
      {
        wave_number: 1,
        title: "Wave One",
        tasks: [
          { task_index: 1, description: "Task 1", status: "pending" },
          { task_index: 2, description: "Task 2", status: "pending" },
        ],
      },
      toolCtx,
    );

    const result = await tool.execute(
      {
        wave_number: 1,
        task_updates: [
          { task_index: 1, status: "completed" },
          { task_index: 2, status: "completed" },
        ],
      },
      toolCtx,
    );
    expect(result).toContain("2/2 succeeded");
    expect(result).not.toContain("goop_compact");
  });
});

describe("goop_write_wave combinator mode", () => {
  let ctx: PluginContext;
  let toolCtx: ToolContext;
  let cleanup: () => void;

  beforeEach(() => {
    const env = setupTestEnvironment("goop-write-wave-combinator");
    cleanup = env.cleanup;
    ctx = createMockPluginContext({ testDir: env.testDir, db: env.db });
    toolCtx = createMockToolContext();
  });

  afterEach(() => cleanup());

  it("records verifications in the same call as a wave write", async () => {
    const tool = createGoopWriteWaveTool(ctx);
    const result = await tool.execute(
      {
        wave_number: 2,
        title: "Combinator wave",
        status: "in_progress",
        verifications: [
          { check_name: "typecheck", status: "pass", detail: "no errors" },
          { check_name: "test", status: "pass", wave_id: 2 },
        ],
      },
      toolCtx,
    );

    expect(result).toContain("Written wave 2");
    expect(result).toContain("Verifications:");
    expect(result).toContain("typecheck=pass");
    expect(result).toContain("test=pass");

    const wave = ctx.db.getWave("default", 2);
    const rows = ctx.db.getVerifications("default", wave?.id ?? -1);
    expect(rows.length).toBe(1);
    expect(rows[0].check_name).toBe("typecheck");
    expect(rows[0].wave_id).toBe(wave?.id ?? null);

    const events = ctx.db.getEvents("default", "verification_record");
    expect(events.length).toBe(2);
  });

  it("writes traceability rows in the same call as a wave write", async () => {
    const tool = createGoopWriteWaveTool(ctx);
    const result = await tool.execute(
      {
        wave_number: 2,
        title: "Combinator wave",
        traceability: [
          { requirement_key: "MH2", task_index: 1, status: "covered" },
          { requirement_key: "MH11", wave_number: 2, status: "covered" },
        ],
      },
      toolCtx,
    );

    expect(result).toContain("Written wave 2");
    expect(result).toContain("Traceability:");
    expect(result).toContain("MH2");
    expect(result).toContain("MH11");

    const rows = ctx.db.getTraceability("default");
    expect(rows.length).toBe(2);
    expect(rows.map((r) => r.requirement_key).sort()).toEqual(["MH11", "MH2"]);

    const events = ctx.db.getEvents("default", "traceability_write");
    expect(events.length).toBe(2);
  });

  it("combined call updates wave, tasks, verifications, and traceability", async () => {
    const tool = createGoopWriteWaveTool(ctx);
    const result = await tool.execute(
      {
        wave_number: 3,
        title: "Combined wave",
        status: "completed",
        tasks: [{ task_index: 1, description: "Combined task", status: "done" }],
        verifications: [{ check_name: "lint", status: "pass" }],
        traceability: [{ requirement_key: "MH2", task_index: 1, status: "covered" }],
      },
      toolCtx,
    );

    expect(result).toContain("Written wave 3");
    expect(result).toContain("Verifications:");
    expect(result).toContain("Traceability:");

    const wave = ctx.db.getWave("default", 3);
    expect(wave).not.toBeNull();
    expect(wave?.status).toBe("completed");

    const tasks = ctx.db.getWaveTasks(wave?.id ?? -1);
    expect(tasks.length).toBe(1);
    expect(tasks[0].status).toBe("done");

    const verifications = ctx.db.getVerifications("default", wave?.id ?? -1);
    expect(verifications.length).toBe(1);
    expect(verifications[0].check_name).toBe("lint");
    expect(verifications[0].wave_id).toBe(wave?.id ?? null);

    const traceability = ctx.db.getTraceability("default");
    expect(traceability.some((r) => r.requirement_key === "MH2" && r.wave_number === 3)).toBe(true);
  });

  it("resolves verification wave_id to the wave's internal DB id, not the wave_number", async () => {
    const realDb = new GoopSpecDB(":memory:");
    const mockCtx = createMockPluginContext({ db: realDb });
    const mockTool = createGoopWriteWaveTool(mockCtx);

    // Seed multiple waves so the AUTOINCREMENT internal id for wave_number 1 is > 1.
    realDb.upsertWorkflow("default", {});
    for (let i = 0; i < 5; i++) {
      realDb.upsertWave("default", {
        wave_number: i + 100,
        title: "Placeholder wave",
        status: "pending",
      });
    }
    realDb.upsertWave("default", {
      wave_number: 1,
      title: "Preseed wave",
      status: "pending",
    });
    const wave = realDb.getWave("default", 1);
    expect(wave).not.toBeNull();
    const internalWaveId = wave?.id ?? -1;
    expect(internalWaveId).toBeGreaterThan(1);

    const result = await mockTool.execute(
      {
        wave_number: 1,
        title: "Regression wave",
        verifications: [
          { check_name: "test", status: "pass", detail: "post-fix regression check" },
          { check_name: "typecheck", status: "pass", wave_id: internalWaveId },
        ],
      },
      toolCtx,
    );

    expect(result).toContain("Written wave 1");
    expect(result).toContain("Verifications:");

    const rows = realDb.getVerifications("default", internalWaveId);
    expect(rows.length).toBe(2);
    expect(rows.map((r) => r.check_name).sort()).toEqual(["test", "typecheck"]);
    expect(rows.every((r) => r.wave_id === internalWaveId)).toBe(true);

    // Sanity check: querying by the human-facing wave_number (1) finds nothing because the
    // internal id is different.
    const wrongRows = realDb.getVerifications("default", 1);
    expect(wrongRows.length).toBe(0);

    realDb.close();
  });

  it("rejects verifications/traceability in items[] batch mode", async () => {
    const tool = createGoopWriteWaveTool(ctx);
    const result = await tool.execute(
      {
        wave_number: 1,
        items: [{ wave_number: 1, title: "Batch wave" }],
        verifications: [{ check_name: "test", status: "pass" }],
      },
      toolCtx,
    );

    expect(result).toContain("not supported in items[] batch mode");
  });

  it("processes verifications and traceability alongside task_updates in one call", async () => {
    const tool = createGoopWriteWaveTool(ctx);
    await tool.execute(
      {
        wave_number: 1,
        title: "Wave One",
        tasks: [{ task_index: 1, description: "Task 1", status: "pending" }],
      },
      toolCtx,
    );

    const result = await tool.execute(
      {
        wave_number: 1,
        task_updates: [{ task_index: 1, status: "completed" }],
        verifications: [{ check_name: "test", status: "pass" }],
        traceability: [{ requirement_key: "MH2" }],
      },
      toolCtx,
    );

    expect(result).toContain("1/1 succeeded");
    expect(result).toContain("Verifications:");
    expect(result).toContain("test=pass");
    expect(result).toContain("Traceability:");
    expect(result).toContain("MH2");

    // Verify both payloads landed in the DB.
    const wave = ctx.db.getWave("default", 1);
    const tasks = ctx.db.getWaveTasks(wave?.id ?? -1);
    expect(tasks[0].status).toBe("completed");

    const verifications = ctx.db.getVerifications("default", wave?.id ?? -1);
    expect(verifications.length).toBe(1);
    expect(verifications[0].check_name).toBe("test");

    const traceability = ctx.db.getTraceability("default");
    expect(traceability.some((r) => r.requirement_key === "MH2")).toBe(true);
  });

  it("rolls back verifications when a task_update fails alongside (atomicity)", async () => {
    const tool = createGoopWriteWaveTool(ctx);
    await tool.execute(
      {
        wave_number: 1,
        title: "Wave One",
        tasks: [{ task_index: 1, description: "Task 1", status: "pending" }],
      },
      toolCtx,
    );

    // task_index 99 does not exist — the task_update will fail.
    const result = await tool.execute(
      {
        wave_number: 1,
        task_updates: [{ task_index: 99, status: "completed" }],
        verifications: [{ check_name: "test", status: "pass" }],
        traceability: [{ requirement_key: "MH2" }],
      },
      toolCtx,
    );

    expect(result).toContain("0/1 succeeded");
    expect(result).toContain("FAIL");
    expect(result).toContain("task 99 not found");
    expect(result).not.toContain("Verifications:");
    expect(result).not.toContain("Traceability:");

    // Verify nothing was written.
    const wave = ctx.db.getWave("default", 1);
    const verifications = ctx.db.getVerifications("default", wave?.id ?? -1);
    expect(verifications.length).toBe(0);

    const traceability = ctx.db.getTraceability("default");
    expect(traceability.length).toBe(0);
  });

  it("processes multiple task_updates with verifications atomically", async () => {
    const tool = createGoopWriteWaveTool(ctx);
    await tool.execute(
      {
        wave_number: 1,
        title: "Wave One",
        tasks: [
          { task_index: 1, description: "Task 1", status: "pending" },
          { task_index: 2, description: "Task 2", status: "pending" },
        ],
      },
      toolCtx,
    );

    const result = await tool.execute(
      {
        wave_number: 1,
        task_updates: [
          { task_index: 1, status: "completed" },
          { task_index: 2, status: "completed" },
        ],
        verifications: [
          { check_name: "typecheck", status: "pass" },
          { check_name: "test", status: "pass" },
        ],
      },
      toolCtx,
    );

    expect(result).toContain("2/2 succeeded");
    expect(result).toContain("Verifications:");
    expect(result).toContain("typecheck=pass");
    expect(result).toContain("test=pass");

    const wave = ctx.db.getWave("default", 1);
    const verifications = ctx.db.getVerifications("default", wave?.id ?? -1);
    expect(verifications.length).toBe(2);
  });
});

describe("goop_write_wave status validation", () => {
  let ctx: PluginContext;
  let toolCtx: ToolContext;
  let cleanup: () => void;

  beforeEach(() => {
    const env = setupTestEnvironment("goop-write-wave-status");
    cleanup = env.cleanup;
    ctx = createMockPluginContext({ testDir: env.testDir, db: env.db });
    toolCtx = createMockToolContext();
  });

  afterEach(() => cleanup());

  // -------------------------------------------------------------------------
  // Direct unit tests for normalizeStatus
  // -------------------------------------------------------------------------

  it("normalizeStatus accepts exact match", () => {
    expect(normalizeStatus("pending", WAVE_STATUSES)).toEqual({ ok: true, status: "pending" });
    expect(normalizeStatus("in_progress", WAVE_STATUSES)).toEqual({
      ok: true,
      status: "in_progress",
    });
    expect(normalizeStatus("done", WAVE_STATUSES)).toEqual({ ok: true, status: "done" });
    expect(normalizeStatus("completed", WAVE_STATUSES)).toEqual({ ok: true, status: "completed" });
  });

  it("normalizeStatus corrects complete to completed", () => {
    expect(normalizeStatus("complete", WAVE_STATUSES)).toEqual({ ok: true, status: "completed" });
  });

  it("normalizeStatus corrects in-progress to in_progress", () => {
    expect(normalizeStatus("in-progress", WAVE_STATUSES)).toEqual({
      ok: true,
      status: "in_progress",
    });
  });

  it("normalizeStatus is case-insensitive and trims whitespace", () => {
    expect(normalizeStatus("DONE", WAVE_STATUSES)).toEqual({ ok: true, status: "done" });
    expect(normalizeStatus(" Completed ", WAVE_STATUSES)).toEqual({
      ok: true,
      status: "completed",
    });
    expect(normalizeStatus("IN-PROGRESS", TASK_STATUSES)).toEqual({
      ok: true,
      status: "in_progress",
    });
  });

  it("normalizeStatus rejects unknown values with the valid set in the error", () => {
    const r = normalizeStatus("bogus", WAVE_STATUSES);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain("Invalid status 'bogus'");
      expect(r.error).toContain("pending, in_progress, done, completed");
    }
  });

  // -------------------------------------------------------------------------
  // Integration: normalisation through the tool (one test per status path)
  // -------------------------------------------------------------------------

  it("normalises complete to completed for top-level status", async () => {
    const tool = createGoopWriteWaveTool(ctx);
    await tool.execute({ wave_number: 1, title: "W1", status: "complete" }, toolCtx);
    expect(ctx.db.getWave("default", 1)?.status).toBe("completed");
  });

  it("normalises complete to completed for tasks[].status", async () => {
    const tool = createGoopWriteWaveTool(ctx);
    await tool.execute(
      {
        wave_number: 1,
        title: "W1",
        tasks: [{ task_index: 0, description: "T0", status: "complete" }],
      },
      toolCtx,
    );
    const wave = ctx.db.getWave("default", 1);
    const tasks = ctx.db.getWaveTasks(wave?.id ?? -1);
    expect(tasks[0].status).toBe("completed");
  });

  it("normalises complete to completed for items[].status", async () => {
    const tool = createGoopWriteWaveTool(ctx);
    await tool.execute(
      {
        wave_number: 1,
        items: [{ wave_number: 1, title: "W1", status: "complete" }],
      },
      toolCtx,
    );
    expect(ctx.db.getWave("default", 1)?.status).toBe("completed");
  });

  it("normalises complete to completed for items[].tasks[].status", async () => {
    const tool = createGoopWriteWaveTool(ctx);
    await tool.execute(
      {
        wave_number: 1,
        items: [
          {
            wave_number: 1,
            title: "W1",
            tasks: [{ task_index: 0, description: "T0", status: "complete" }],
          },
        ],
      },
      toolCtx,
    );
    const wave = ctx.db.getWave("default", 1);
    const tasks = ctx.db.getWaveTasks(wave?.id ?? -1);
    expect(tasks[0].status).toBe("completed");
  });

  it("normalises complete to completed for task_update.status", async () => {
    const tool = createGoopWriteWaveTool(ctx);
    await tool.execute(
      {
        wave_number: 1,
        title: "W1",
        tasks: [{ task_index: 0, description: "T0", status: "pending" }],
      },
      toolCtx,
    );
    await tool.execute(
      { wave_number: 1, task_update: { task_index: 0, status: "complete" } },
      toolCtx,
    );
    const wave = ctx.db.getWave("default", 1);
    const tasks = ctx.db.getWaveTasks(wave?.id ?? -1);
    expect(tasks[0].status).toBe("completed");
  });

  it("normalises complete to completed for task_updates[].status", async () => {
    const tool = createGoopWriteWaveTool(ctx);
    await tool.execute(
      {
        wave_number: 1,
        title: "W1",
        tasks: [{ task_index: 0, description: "T0", status: "pending" }],
      },
      toolCtx,
    );
    await tool.execute(
      {
        wave_number: 1,
        task_updates: [{ task_index: 0, status: "complete" }],
      },
      toolCtx,
    );
    const wave = ctx.db.getWave("default", 1);
    const tasks = ctx.db.getWaveTasks(wave?.id ?? -1);
    expect(tasks[0].status).toBe("completed");
  });

  it("normalises in-progress to in_progress for top-level status", async () => {
    const tool = createGoopWriteWaveTool(ctx);
    await tool.execute({ wave_number: 1, title: "W1", status: "in-progress" }, toolCtx);
    expect(ctx.db.getWave("default", 1)?.status).toBe("in_progress");
  });

  // -------------------------------------------------------------------------
  // Integration: rejection through the tool (one test per status path)
  // -------------------------------------------------------------------------

  it("rejects unknown top-level status without writing to DB", async () => {
    const tool = createGoopWriteWaveTool(ctx);
    const result = await tool.execute({ wave_number: 1, title: "W1", status: "bogus" }, toolCtx);
    expect(result).toContain("Error in goop_write_wave");
    expect(result).toContain("Invalid status 'bogus'");
    expect(result).toContain("pending, in_progress, done, completed");
    expect(ctx.db.getWave("default", 1)).toBeNull();
  });

  it("rejects unknown tasks[].status without writing to DB", async () => {
    const tool = createGoopWriteWaveTool(ctx);
    const result = await tool.execute(
      {
        wave_number: 1,
        title: "W1",
        tasks: [{ task_index: 0, description: "T0", status: "bogus" }],
      },
      toolCtx,
    );
    expect(result).toContain("Error in goop_write_wave");
    expect(result).toContain("Invalid status 'bogus'");
    expect(ctx.db.getWave("default", 1)).toBeNull();
  });

  it("rejects unknown items[].status without writing to DB", async () => {
    const tool = createGoopWriteWaveTool(ctx);
    const result = await tool.execute(
      {
        wave_number: 1,
        items: [{ wave_number: 1, title: "W1", status: "bogus" }],
      },
      toolCtx,
    );
    expect(result).toContain("Error in goop_write_wave");
    expect(result).toContain("Invalid status 'bogus'");
    expect(ctx.db.getWave("default", 1)).toBeNull();
  });

  it("rejects unknown items[].tasks[].status without writing to DB", async () => {
    const tool = createGoopWriteWaveTool(ctx);
    const result = await tool.execute(
      {
        wave_number: 1,
        items: [
          {
            wave_number: 1,
            title: "W1",
            tasks: [{ task_index: 0, description: "T0", status: "bogus" }],
          },
        ],
      },
      toolCtx,
    );
    expect(result).toContain("Error in goop_write_wave");
    expect(result).toContain("Invalid status 'bogus'");
    expect(ctx.db.getWave("default", 1)).toBeNull();
  });

  it("rejects unknown task_update.status without writing to DB", async () => {
    const tool = createGoopWriteWaveTool(ctx);
    await tool.execute(
      {
        wave_number: 1,
        title: "W1",
        tasks: [{ task_index: 0, description: "T0", status: "pending" }],
      },
      toolCtx,
    );
    const result = await tool.execute(
      { wave_number: 1, task_update: { task_index: 0, status: "bogus" } },
      toolCtx,
    );
    expect(result).toContain("Error in goop_write_wave");
    expect(result).toContain("Invalid status 'bogus'");
    const wave = ctx.db.getWave("default", 1);
    const tasks = ctx.db.getWaveTasks(wave?.id ?? -1);
    expect(tasks[0].status).toBe("pending");
  });

  it("rejects unknown task_updates[].status without writing to DB", async () => {
    const tool = createGoopWriteWaveTool(ctx);
    await tool.execute(
      {
        wave_number: 1,
        title: "W1",
        tasks: [{ task_index: 0, description: "T0", status: "pending" }],
      },
      toolCtx,
    );
    const result = await tool.execute(
      {
        wave_number: 1,
        task_updates: [{ task_index: 0, status: "bogus" }],
      },
      toolCtx,
    );
    expect(result).toContain("Error in goop_write_wave");
    expect(result).toContain("Invalid status 'bogus'");
    const wave = ctx.db.getWave("default", 1);
    const tasks = ctx.db.getWaveTasks(wave?.id ?? -1);
    expect(tasks[0].status).toBe("pending");
  });
});

describe("goop_write_wave write integrity", () => {
  let ctx: PluginContext;
  let toolCtx: ToolContext;
  let cleanup: () => void;

  beforeEach(() => {
    const env = setupTestEnvironment("goop-write-wave-integrity");
    cleanup = env.cleanup;
    ctx = createMockPluginContext({ testDir: env.testDir, db: env.db });
    toolCtx = createMockToolContext();
  });

  afterEach(() => cleanup());

  it("writes top-level status and task_update together without dropping either", async () => {
    const writeTool = createGoopWriteWaveTool(ctx);
    await writeTool.execute(
      {
        wave_number: 1,
        title: "Integrity wave",
        tasks: [{ task_index: 1, description: "First task", status: "pending" }],
      },
      toolCtx,
    );

    const result = await writeTool.execute(
      {
        wave_number: 1,
        status: "in_progress",
        task_update: { task_index: 1, status: "in_progress" },
      },
      toolCtx,
    );

    const wave = ctx.db.getWave("default", 1);
    expect(result).toContain("Written wave 1");
    expect(result).toContain("Updated task 1");
    expect(wave?.status).toBe("in_progress");
    expect(ctx.db.getWaveTasks(wave?.id ?? -1)[0].status).toBe("in_progress");
  });

  it("rejects top-level fields incompatible with batch modes before writing", async () => {
    const writeTool = createGoopWriteWaveTool(ctx);

    const itemsResult = await writeTool.execute(
      {
        wave_number: 1,
        status: "in_progress",
        items: [{ wave_number: 1, title: "Batch wave" }],
      },
      toolCtx,
    );
    expect(itemsResult).toContain("status cannot be supplied alongside items[] batch mode");
    expect(ctx.db.getWave("default", 1)).toBeNull();

    await writeTool.execute(
      {
        wave_number: 2,
        title: "Task batch wave",
        tasks: [{ task_index: 1, description: "Task" }],
      },
      toolCtx,
    );
    const taskUpdatesResult = await writeTool.execute(
      {
        wave_number: 2,
        status: "in_progress",
        task_updates: [{ task_index: 1, status: "in_progress" }],
      },
      toolCtx,
    );
    expect(taskUpdatesResult).toContain(
      "status cannot be supplied alongside task_updates batch mode",
    );
    expect(ctx.db.getWave("default", 2)?.status).toBe("pending");
  });

  it("rejects terminal status regressions unless explicitly overridden", async () => {
    const writeTool = createGoopWriteWaveTool(ctx);
    await writeTool.execute(
      {
        wave_number: 1,
        title: "Completed wave",
        status: "done",
        tasks: [{ task_index: 1, description: "Completed task", status: "completed" }],
      },
      toolCtx,
    );

    const waveRegression = await writeTool.execute({ wave_number: 1, status: "pending" }, toolCtx);
    const taskRegression = await writeTool.execute(
      { wave_number: 1, task_update: { task_index: 1, status: "pending" } },
      toolCtx,
    );
    expect(waveRegression).toContain("allow_status_regression: true");
    expect(taskRegression).toContain("allow_status_regression: true");

    const overrideResult = await writeTool.execute(
      { wave_number: 1, status: "pending", allow_status_regression: true },
      toolCtx,
    );
    expect(overrideResult).toContain("Written wave 1");
    expect(ctx.db.getWave("default", 1)?.status).toBe("pending");
  });

  it("protects legacy 'complete' status from regression to pending", async () => {
    const writeTool = createGoopWriteWaveTool(ctx);
    await writeTool.execute({ wave_number: 1, title: "Legacy wave", status: "done" }, toolCtx);

    // Simulate a legacy 'complete' status in the DB (pre-normalisation data
    // that would have been written before the status normalisation boundary).
    const realGetWave = ctx.db.getWave.bind(ctx.db);
    ctx.db.getWave = (workflowId: string, waveNumber: number) => {
      const wave = realGetWave(workflowId, waveNumber);
      if (wave && waveNumber === 1) {
        return { ...wave, status: "complete" as WaveStatus };
      }
      return wave;
    };

    // Regression to pending should be rejected — 'complete' is terminal.
    const result = await writeTool.execute({ wave_number: 1, status: "pending" }, toolCtx);
    expect(result).toContain("allow_status_regression: true");
    expect(result).toContain("'complete'");

    // With explicit override, regression is allowed.
    const overrideResult = await writeTool.execute(
      { wave_number: 1, status: "pending", allow_status_regression: true },
      toolCtx,
    );
    expect(overrideResult).toContain("Written wave 1");

    // Restore the real getWave and verify the DB now has 'pending'.
    ctx.db.getWave = realGetWave;
    expect(ctx.db.getWave("default", 1)?.status).toBe("pending");
  });

  it("rolls back the wave write when an inline task write fails", async () => {
    const writeTool = createGoopWriteWaveTool(ctx);
    const upsertWaveTask = ctx.db.upsertWaveTask.bind(ctx.db);
    let writes = 0;
    ctx.db.upsertWaveTask = (task) => {
      writes += 1;
      if (writes === 2) throw new Error("simulated task write failure");
      upsertWaveTask(task);
    };

    const result = await writeTool.execute(
      {
        wave_number: 1,
        title: "Atomic wave",
        status: "done",
        tasks: [
          { task_index: 1, description: "First task" },
          { task_index: 2, description: "Second task" },
        ],
      },
      toolCtx,
    );

    expect(result).toContain("simulated task write failure");
    expect(ctx.db.getWave("default", 1)).toBeNull();
  });

  it("rejects a task update for a missing task instead of reporting success", async () => {
    const writeTool = createGoopWriteWaveTool(ctx);
    await writeTool.execute({ wave_number: 1, title: "Wave" }, toolCtx);

    const result = await writeTool.execute(
      { wave_number: 1, task_update: { task_index: 99, status: "done" } },
      toolCtx,
    );

    expect(result).toContain("task 99 not found on wave 1");
  });
});

describe("goop_write_wave durability, idempotence, and preservation", () => {
  let ctx: PluginContext;
  let toolCtx: ToolContext;
  let cleanup: () => void;

  beforeEach(() => {
    const env = setupTestEnvironment("write-wave-durability");
    cleanup = env.cleanup;
    ctx = createMockPluginContext({ testDir: env.testDir, db: env.db });
    toolCtx = createMockToolContext();
  });

  afterEach(() => cleanup());

  it("durability: task_update write is reflected by a subsequent goop_read_wave", async () => {
    const writeTool = createGoopWriteWaveTool(ctx);
    await writeTool.execute(
      {
        wave_number: 1,
        title: "Task update wave",
        tasks: [{ task_index: 1, description: "Only task", status: "pending" }],
      },
      toolCtx,
    );

    await writeTool.execute(
      { wave_number: 1, task_update: { task_index: 1, status: "complete" } },
      toolCtx,
    );

    const readTool = createGoopReadWaveTool(ctx);
    const result = await readTool.execute({}, toolCtx);

    expect(result).toContain("[completed]");
    expect(result).toContain("progress: 1/1 tasks complete");
  });

  it("durability: task_updates[] batch write is reflected by a subsequent goop_read_wave", async () => {
    const writeTool = createGoopWriteWaveTool(ctx);
    await writeTool.execute(
      {
        wave_number: 1,
        title: "Task updates wave",
        tasks: [
          { task_index: 1, description: "Task one", status: "pending" },
          { task_index: 2, description: "Task two", status: "pending" },
        ],
      },
      toolCtx,
    );

    await writeTool.execute(
      {
        wave_number: 1,
        task_updates: [
          { task_index: 1, status: "complete" },
          { task_index: 2, status: "complete" },
        ],
      },
      toolCtx,
    );

    const readTool = createGoopReadWaveTool(ctx);
    const result = await readTool.execute({}, toolCtx);

    expect(result).toContain("progress: 2/2 tasks complete");
  });

  it("idempotence: writing the same terminal status twice is a no-op the second time", async () => {
    const writeTool = createGoopWriteWaveTool(ctx);
    const first = await writeTool.execute(
      { wave_number: 1, title: "Idempotent wave", status: "complete" },
      toolCtx,
    );
    expect(first).toContain("Written wave 1");

    const second = await writeTool.execute({ wave_number: 1, status: "complete" }, toolCtx);
    expect(second).toContain("Written wave 1");

    const readTool = createGoopReadWaveTool(ctx);
    const result = await readTool.execute({}, toolCtx);
    expect(result).toContain("status: completed");
  });

  it("preservation: a later write omitting status leaves an existing terminal status intact", async () => {
    const writeTool = createGoopWriteWaveTool(ctx);
    await writeTool.execute({ wave_number: 1, title: "Original", status: "complete" }, toolCtx);

    await writeTool.execute({ wave_number: 1, title: "Updated title" }, toolCtx);

    const readTool = createGoopReadWaveTool(ctx);
    const result = await readTool.execute({}, toolCtx);
    expect(result).toContain("status: completed");
    expect(result).toContain("Updated title");
  });
});
