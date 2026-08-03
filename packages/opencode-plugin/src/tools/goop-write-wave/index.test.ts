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
      {
        wave_number: 1,
        title: "Done wave",
        status: "done",
        verifications: [{ check_name: "test", status: "pass" }],
      },
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
          {
            wave_number: 2,
            title: "Completed batch wave",
            status: "completed",
            verifications: [{ check_name: "test", status: "pass" }],
          },
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

  it("reports per-item side-payload writes in items[] batch mode", async () => {
    const tool = createGoopWriteWaveTool(ctx);
    const result = await tool.execute(
      {
        wave_number: 1,
        items: [
          {
            wave_number: 1,
            title: "Batch wave",
            verifications: [{ check_name: "test", status: "pass" }],
            traceability: [{ requirement_key: "MH1" }],
          },
        ],
      },
      toolCtx,
    );

    expect(result).toContain("wrote 1 verification(s) and 1 traceability row(s)");
  });

  it("rejects top-level verifications alongside items[] without persisting them", async () => {
    const tool = createGoopWriteWaveTool(ctx);
    const result = await tool.execute(
      {
        wave_number: 1,
        items: [{ wave_number: 1, title: "Batch wave" }],
        verifications: [{ check_name: "test", status: "pass" }],
      },
      toolCtx,
    );

    expect(result).toContain("verifications cannot be supplied alongside items[] batch mode");
    expect(ctx.db.getWave("default", 1)).toBeNull();
    expect(ctx.db.getVerifications("default", 1)).toHaveLength(0);
  });

  it("rejects top-level traceability alongside items[] without persisting it", async () => {
    const tool = createGoopWriteWaveTool(ctx);
    const result = await tool.execute(
      {
        wave_number: 1,
        items: [{ wave_number: 1, title: "Batch wave" }],
        traceability: [{ requirement_key: "MH1" }],
      },
      toolCtx,
    );

    expect(result).toContain("traceability cannot be supplied alongside items[] batch mode");
    expect(ctx.db.getWave("default", 1)).toBeNull();
    expect(ctx.db.getTraceability("default")).toHaveLength(0);
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

  it("distinguishes traceability rows with the same requirement_key but different task_index", async () => {
    const tool = createGoopWriteWaveTool(ctx);
    const result = await tool.execute(
      {
        wave_number: 2,
        title: "Traceability distinction wave",
        traceability: [
          { requirement_key: "MH8", task_index: 1, status: "covered" },
          { requirement_key: "MH8", task_index: 2, status: "covered" },
        ],
      },
      toolCtx,
    );

    expect(result).toContain("Traceability:");
    // Each line must uniquely identify the row it wrote — same requirement_key
    // but different task_index must produce distinguishable confirmation lines.
    expect(result).toContain("Wrote traceability for MH8 on wave 2 (task 1).");
    expect(result).toContain("Wrote traceability for MH8 on wave 2 (task 2).");

    const rows = ctx.db.getTraceability("default");
    expect(rows.length).toBe(2);
    expect(rows.every((r) => r.requirement_key === "MH8")).toBe(true);
    expect(rows.map((r) => r.task_index).sort()).toEqual([1, 2]);
  });

  it("traceability confirmation reports the resolved wave_number, not the context default", async () => {
    const tool = createGoopWriteWaveTool(ctx);
    // Create wave 5 so the traceability row can target it by explicit wave_number.
    await tool.execute({ wave_number: 5, title: "Target wave" }, toolCtx);

    const result = await tool.execute(
      {
        wave_number: 3,
        title: "Context wave",
        traceability: [
          { requirement_key: "MH8", wave_number: 5, task_index: 1, status: "covered" },
        ],
      },
      toolCtx,
    );

    expect(result).toContain("Traceability:");
    // The item explicitly targets wave 5, overriding the context's wave 3.
    // The message must report the resolved wave (5), not the context's wave (3).
    expect(result).toContain("Wrote traceability for MH8 on wave 5 (task 1).");
    expect(result).not.toContain("Wrote traceability for MH8 on wave 3");
  });

  it("verification confirmation reports wave_number and internal row id", async () => {
    const tool = createGoopWriteWaveTool(ctx);
    const result = await tool.execute(
      {
        wave_number: 2,
        title: "Verification correlation wave",
        verifications: [{ check_name: "typecheck", status: "pass" }],
      },
      toolCtx,
    );

    expect(result).toContain("Verifications:");
    // The message must report the human-facing wave_number (not just the
    // internal row id) so the caller can correlate the confirmation.
    const wave = ctx.db.getWave("default", 2);
    expect(result).toContain(`wave 2 (row id ${wave?.id}).`);
  });

  it("side-payload-only response has no leading blank line", async () => {
    const tool = createGoopWriteWaveTool(ctx);
    // Pre-create the wave so the side-payload-only call can resolve it.
    await tool.execute({ wave_number: 1, title: "Pre-existing wave" }, toolCtx);

    const result = await tool.execute(
      {
        wave_number: 1,
        verifications: [{ check_name: "typecheck", status: "pass" }],
        traceability: [{ requirement_key: "MH1", status: "covered" }],
      },
      toolCtx,
    );

    // The 185efea fix removed the leading blank line by filtering empty strings
    // out of sections[]. The response must start with "Verifications:", not "\n".
    const text = typeof result === "string" ? result : String(result);
    expect(text.startsWith("\n")).toBe(false);
    expect(text.startsWith("Verifications:")).toBe(true);
  });
});

describe("goop_write_wave multi-item batch targeting and rollback", () => {
  let ctx: PluginContext;
  let toolCtx: ToolContext;
  let cleanup: () => void;

  beforeEach(() => {
    const env = setupTestEnvironment("goop-write-wave-multi-item");
    cleanup = env.cleanup;
    ctx = createMockPluginContext({ testDir: env.testDir, db: env.db });
    toolCtx = createMockToolContext();
  });

  afterEach(() => cleanup());

  it("multi-item batch binds each item's traceability to its own wave when row-level wave_number is omitted", async () => {
    const tool = createGoopWriteWaveTool(ctx);
    await tool.execute(
      {
        wave_number: 1,
        items: [
          {
            wave_number: 1,
            title: "Wave One",
            traceability: [{ requirement_key: "MH1", status: "covered" }],
          },
          {
            wave_number: 2,
            title: "Wave Two",
            traceability: [{ requirement_key: "MH2", status: "covered" }],
          },
        ],
      },
      toolCtx,
    );

    // Read rows back and assert each requirement is bound to its item's wave —
    // not the other item's. A bug in the inheritance rule silently binds
    // requirements to the wrong wave and stays invisible until someone audits
    // traceability.
    const rows = ctx.db.getTraceability("default");
    expect(rows).toHaveLength(2);

    const mh1 = rows.find((r) => r.requirement_key === "MH1");
    const mh2 = rows.find((r) => r.requirement_key === "MH2");
    expect(mh1?.wave_number).toBe(1);
    expect(mh2?.wave_number).toBe(2);
    expect(mh1?.wave_number).not.toBe(2);
    expect(mh2?.wave_number).not.toBe(1);
  });

  it("explicit row-level wave_number overrides the inherited item wave_number for traceability in a multi-item batch", async () => {
    const tool = createGoopWriteWaveTool(ctx);
    // Pre-create wave 3 so the explicit override target exists.
    await tool.execute({ wave_number: 3, title: "Override target wave" }, toolCtx);

    await tool.execute(
      {
        wave_number: 1,
        items: [
          {
            wave_number: 1,
            title: "Wave One",
            traceability: [{ requirement_key: "MH1", wave_number: 3, status: "covered" }],
          },
          {
            wave_number: 2,
            title: "Wave Two",
            traceability: [{ requirement_key: "MH2", status: "covered" }],
          },
        ],
      },
      toolCtx,
    );

    const rows = ctx.db.getTraceability("default");
    expect(rows).toHaveLength(2);

    const mh1 = rows.find((r) => r.requirement_key === "MH1");
    const mh2 = rows.find((r) => r.requirement_key === "MH2");
    // MH1 explicitly targets wave 3, overriding its item's wave_number 1.
    expect(mh1?.wave_number).toBe(3);
    // MH2 inherits its item's wave_number 2.
    expect(mh2?.wave_number).toBe(2);
  });

  it("per-item verification omitting wave_id defaults to the enclosing item's wave row id", async () => {
    const tool = createGoopWriteWaveTool(ctx);
    await tool.execute(
      {
        wave_number: 1,
        items: [
          {
            wave_number: 1,
            title: "Wave One",
            verifications: [{ check_name: "test", status: "pass" }],
          },
          {
            wave_number: 2,
            title: "Wave Two",
            verifications: [{ check_name: "lint", status: "pass" }],
          },
        ],
      },
      toolCtx,
    );

    const wave1 = ctx.db.getWave("default", 1);
    const wave2 = ctx.db.getWave("default", 2);
    expect(wave1).not.toBeNull();
    expect(wave2).not.toBeNull();

    // Assert the persisted row target, not the message text — a message can be
    // right while the rows are wrong.
    const verifications = ctx.db.getVerifications("default");
    expect(verifications).toHaveLength(2);

    const testRow = verifications.find((v) => v.check_name === "test");
    const lintRow = verifications.find((v) => v.check_name === "lint");
    expect(testRow?.wave_id).toBe(wave1?.id);
    expect(lintRow?.wave_id).toBe(wave2?.id);
    expect(testRow?.wave_id).not.toBe(wave2?.id);
    expect(lintRow?.wave_id).not.toBe(wave1?.id);
  });

  it("explicit per-item wave_id overrides the inherited wave row id for a verification", async () => {
    const tool = createGoopWriteWaveTool(ctx);
    // Pre-create wave 2 so we can reference its internal row id.
    await tool.execute({ wave_number: 2, title: "Override target wave" }, toolCtx);
    const wave2 = ctx.db.getWave("default", 2);
    expect(wave2).not.toBeNull();
    const wave2Id = wave2?.id ?? -1;
    expect(wave2Id).toBeGreaterThan(0);

    await tool.execute(
      {
        wave_number: 1,
        items: [
          {
            wave_number: 1,
            title: "Wave One",
            verifications: [{ check_name: "test", status: "pass", wave_id: wave2Id }],
          },
        ],
      },
      toolCtx,
    );

    const wave1 = ctx.db.getWave("default", 1);
    const verifications = ctx.db.getVerifications("default");
    expect(verifications).toHaveLength(1);
    // The verification must be bound to wave 2's row id (explicit), not wave 1's
    // (inherited). Asserting the persisted row, not the confirmation message.
    expect(verifications[0].wave_id).toBe(wave2Id);
    expect(verifications[0].wave_id).not.toBe(wave1?.id);
  });

  it("later item failure rolls back earlier items' waves, verifications, and traceability in a multi-item batch", async () => {
    const tool = createGoopWriteWaveTool(ctx);
    // Pre-seed wave 2 as terminal so item 2's "pending" status regresses and
    // throws — a genuine invalid input, not a mock.
    await tool.execute(
      {
        wave_number: 2,
        title: "Pre-seeded done wave",
        status: "done",
        verifications: [{ check_name: "test", status: "pass" }],
      },
      toolCtx,
    );
    const wave2Before = ctx.db.getWave("default", 2);
    const wave2Id = wave2Before?.id ?? -1;

    const result = await tool.execute(
      {
        wave_number: 1,
        items: [
          {
            wave_number: 1,
            title: "Item one",
            status: "in_progress",
            verifications: [{ check_name: "test", status: "pass" }],
            traceability: [{ requirement_key: "MH1", status: "covered" }],
          },
          {
            wave_number: 2,
            title: "Item two",
            status: "pending", // regresses wave 2 from "done" to "pending" -> throws
          },
        ],
      },
      toolCtx,
    );

    // The batch must report total failure — nothing succeeded.
    expect(result).toContain("0/2 succeeded");
    expect(result).toContain("FAIL");

    // Wave 1 was created only inside the batch transaction — rollback must
    // remove it. Earlier items had already written side-payloads before the
    // failure, so this proves they were undone.
    expect(ctx.db.getWave("default", 1)).toBeNull();

    // Wave 2 was pre-seeded outside the batch — it must survive unchanged.
    const wave2 = ctx.db.getWave("default", 2);
    expect(wave2).not.toBeNull();
    expect(wave2?.status).toBe("done");

    // No verification/traceability rows from the batch may survive — only the
    // pre-seed's own verification (written outside the batch) remains.
    const verifications = ctx.db.getVerifications("default");
    expect(verifications).toHaveLength(1);
    expect(verifications[0].wave_id).toBe(wave2Id);
    expect(ctx.db.getTraceability("default")).toHaveLength(0);
  });

  it("rolled-back batch leaves no orphan events for side-payloads written before the failure", async () => {
    const tool = createGoopWriteWaveTool(ctx);
    // Pre-seed wave 2 as terminal so item 2's "pending" status regresses and
    // throws.
    await tool.execute(
      {
        wave_number: 2,
        title: "Pre-seeded done wave",
        status: "done",
        verifications: [{ check_name: "test", status: "pass" }],
      },
      toolCtx,
    );

    // Before the batch, only the pre-seed's wave_write and verification_record
    // events exist (the pre-seed now carries a verification row to satisfy
    // the wave-completion gate).
    const eventsBefore = ctx.db.getEvents("default");
    expect(eventsBefore).toHaveLength(2);

    await tool.execute(
      {
        wave_number: 1,
        items: [
          {
            wave_number: 1,
            title: "Item one",
            status: "in_progress",
            verifications: [{ check_name: "test", status: "pass" }],
            traceability: [{ requirement_key: "MH1", status: "covered" }],
          },
          {
            wave_number: 2,
            title: "Item two",
            status: "pending", // regresses -> throws
          },
        ],
      },
      toolCtx,
    );

    // After the rolled-back batch, the total event count must be unchanged —
    // events are appended inside the transaction so a rollback leaves none.
    const eventsAfter = ctx.db.getEvents("default");
    expect(eventsAfter).toHaveLength(eventsBefore.length);

    // No verification_record or traceability_write events from the BATCH may
    // survive — the pre-seed's own verification_record (written before the
    // batch, outside its transaction) is the only one that persists.
    expect(ctx.db.getEvents("default", "verification_record")).toHaveLength(1);
    expect(ctx.db.getEvents("default", "traceability_write")).toHaveLength(0);

    // Only the pre-seed's wave_write event remains — the batch's wave_write
    // for item 1 was rolled back with the rest of the transaction.
    expect(ctx.db.getEvents("default", "wave_write")).toHaveLength(1);
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
    await tool.execute(
      {
        wave_number: 1,
        title: "W1",
        status: "complete",
        verifications: [{ check_name: "test", status: "pass" }],
      },
      toolCtx,
    );
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
        items: [
          {
            wave_number: 1,
            title: "W1",
            status: "complete",
            verifications: [{ check_name: "test", status: "pass" }],
          },
        ],
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

  it("preserves omitted metadata across status, task, and items[] task updates", async () => {
    const writeTool = createGoopWriteWaveTool(ctx);
    const metadata = {
      title: "Metadata must survive",
      pr_branch: "fix/metadata-preservation",
      pr_url: "https://example.test/metadata-preservation",
    };

    await writeTool.execute(
      {
        wave_number: 1,
        ...metadata,
        tasks: [{ task_index: 1, description: "Existing task", status: "pending" }],
      },
      toolCtx,
    );

    await writeTool.execute({ wave_number: 1, status: "in_progress" }, toolCtx);
    let wave = ctx.db.getWave("default", 1);
    expect(wave).toMatchObject(metadata);

    await writeTool.execute(
      { wave_number: 1, task_update: { task_index: 1, status: "in_progress" } },
      toolCtx,
    );
    wave = ctx.db.getWave("default", 1);
    expect(wave).toMatchObject(metadata);

    await writeTool.execute(
      {
        wave_number: 1,
        items: [{ wave_number: 1, tasks: [{ task_index: 1, status: "completed" }] }],
      },
      toolCtx,
    );
    wave = ctx.db.getWave("default", 1);
    expect(wave).toMatchObject(metadata);
    expect(ctx.db.getWaveTasks(wave?.id ?? -1)[0].status).toBe("completed");

    await writeTool.execute({ wave_number: 1, title: "", pr_branch: "", pr_url: "" }, toolCtx);
    expect(ctx.db.getWave("default", 1)).toMatchObject({
      title: "",
      pr_branch: "",
      pr_url: "",
    });
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
        verifications: [{ check_name: "test", status: "pass" }],
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
    await writeTool.execute(
      {
        wave_number: 1,
        title: "Legacy wave",
        status: "done",
        verifications: [{ check_name: "test", status: "pass" }],
      },
      toolCtx,
    );

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

  // -------------------------------------------------------------------------
  // Atomicity tripwire: a verification/traceability failure must roll back the
  // entire single-wave transaction (the 804e1af fix). Without these tests, a
  // future refactor could silently move side-payload writes back outside the
  // transaction with nothing to catch it.
  // -------------------------------------------------------------------------

  it("rolls back wave and task writes when a verification write fails on the single-wave path", async () => {
    const writeTool = createGoopWriteWaveTool(ctx);
    // Pre-create the wave so we can assert the update rolls back to the original state.
    await writeTool.execute(
      {
        wave_number: 1,
        title: "Original title",
        tasks: [{ task_index: 1, description: "Pre-existing task", status: "pending" }],
      },
      toolCtx,
    );

    // Override insertVerification to throw — simulates a DB-layer failure during
    // the verification side-payload write on the single-wave path.
    ctx.db.insertVerification = (() => {
      throw new Error("simulated verification write failure");
    }) as GoopSpecDB["insertVerification"];

    const result = await writeTool.execute(
      {
        wave_number: 1,
        title: "Updated title",
        status: "in_progress",
        tasks: [
          { task_index: 1, description: "Updated task", status: "in_progress" },
          { task_index: 2, description: "New task", status: "pending" },
        ],
        verifications: [{ check_name: "typecheck", status: "pass" }],
      },
      toolCtx,
    );

    // The error must surface — not silently succeed.
    expect(result).toBe("Error in goop_write_wave: simulated verification write failure");
    // The response must NOT contain side-payload confirmation lines — they were rolled back.
    expect(result).not.toContain("Verifications:");
    expect(result).not.toContain("Traceability:");

    // The wave title must have rolled back to the original — the update was undone.
    const wave = ctx.db.getWave("default", 1);
    expect(wave).not.toBeNull();
    expect(wave?.title).toBe("Original title");
    expect(wave?.status).toBe("pending");

    // The task update must have rolled back — task 1 still has its original state,
    // and task 2 was never created.
    const tasks = ctx.db.getWaveTasks(wave?.id ?? -1);
    expect(tasks.length).toBe(1);
    expect(tasks[0].description).toBe("Pre-existing task");
    expect(tasks[0].status).toBe("pending");

    // No verification rows should exist — the insert was rolled back.
    const verifications = ctx.db.getVerifications("default");
    expect(verifications.length).toBe(0);
  });

  it("rolls back wave and task writes when a traceability write fails on the single-wave path", async () => {
    const writeTool = createGoopWriteWaveTool(ctx);
    await writeTool.execute(
      {
        wave_number: 1,
        title: "Original title",
        tasks: [{ task_index: 1, description: "Pre-existing task", status: "pending" }],
      },
      toolCtx,
    );

    ctx.db.upsertTraceability = () => {
      throw new Error("simulated traceability write failure");
    };

    const result = await writeTool.execute(
      {
        wave_number: 1,
        title: "Updated title",
        status: "in_progress",
        tasks: [
          { task_index: 1, description: "Updated task", status: "in_progress" },
          { task_index: 2, description: "New task", status: "pending" },
        ],
        traceability: [{ requirement_key: "MH1", status: "covered" }],
      },
      toolCtx,
    );

    expect(result).toBe("Error in goop_write_wave: simulated traceability write failure");
    expect(result).not.toContain("Verifications:");
    expect(result).not.toContain("Traceability:");

    const wave = ctx.db.getWave("default", 1);
    expect(wave).not.toBeNull();
    expect(wave?.title).toBe("Original title");
    expect(wave?.status).toBe("pending");

    const tasks = ctx.db.getWaveTasks(wave?.id ?? -1);
    expect(tasks.length).toBe(1);
    expect(tasks[0].description).toBe("Pre-existing task");
    expect(tasks[0].status).toBe("pending");

    const traceability = ctx.db.getTraceability("default");
    expect(traceability.length).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Regression tripwire: the original bug reported "with 0 task(s)" on a
  // metadata-only write, implying tasks were wiped. This test names the exact
  // scenario a user hit so a future reader understands the failure it prevents.
  // -------------------------------------------------------------------------

  it("regression tripwire: metadata-only write on a wave with pre-existing tasks does not report '0 task(s)' and preserves tasks", async () => {
    const writeTool = createGoopWriteWaveTool(ctx);
    await writeTool.execute(
      {
        wave_number: 1,
        title: "Seeded wave",
        tasks: [
          { task_index: 1, description: "First task", status: "pending" },
          { task_index: 2, description: "Second task", status: "pending" },
        ],
      },
      toolCtx,
    );

    const result = await writeTool.execute({ wave_number: 1, status: "in_progress" }, toolCtx);

    // The original bug reported "with 0 task(s)" on a metadata-only write,
    // implying tasks were wiped. The response must NOT contain that substring.
    expect(result).not.toContain("0 task(s)");
    // The exact response must acknowledge that existing tasks were left unchanged.
    expect(result).toBe("Written wave 1 for workflow 'default'; existing tasks left unchanged.");

    // The tasks must still exist in the DB — not wiped by the metadata-only write.
    const wave = ctx.db.getWave("default", 1);
    const tasks = ctx.db.getWaveTasks(wave?.id ?? -1);
    expect(tasks.length).toBe(2);
    expect(tasks[0].description).toBe("First task");
    expect(tasks[1].description).toBe("Second task");
  });

  // -------------------------------------------------------------------------
  // Message case coverage: exact-string assertions for the three mutation
  // messages from 185efea. Existing tests use toContain; these pin the exact
  // string so a wording change is caught immediately.
  // -------------------------------------------------------------------------

  it("message: wave write with tasks reports 'with N task(s)' exactly", async () => {
    const writeTool = createGoopWriteWaveTool(ctx);
    const result = await writeTool.execute(
      {
        wave_number: 1,
        title: "Message wave",
        status: "in_progress",
        tasks: [
          { task_index: 1, description: "Task 1" },
          { task_index: 2, description: "Task 2" },
        ],
      },
      toolCtx,
    );
    expect(result).toBe("Written wave 1 for workflow 'default' with 2 task(s).");
  });

  it("message: task_update reports 'Updated task K on wave N to ...' exactly", async () => {
    const writeTool = createGoopWriteWaveTool(ctx);
    await writeTool.execute(
      {
        wave_number: 1,
        title: "Seeded wave",
        tasks: [{ task_index: 1, description: "Task 1", status: "pending" }],
      },
      toolCtx,
    );
    const result = await writeTool.execute(
      { wave_number: 1, task_update: { task_index: 1, status: "done" } },
      toolCtx,
    );
    expect(result).toBe("Updated task 1 on wave 1 to 'done' for workflow 'default'.");
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
      {
        wave_number: 1,
        title: "Idempotent wave",
        status: "complete",
        verifications: [{ check_name: "test", status: "pass" }],
      },
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
    await writeTool.execute(
      {
        wave_number: 1,
        title: "Original",
        status: "complete",
        verifications: [{ check_name: "test", status: "pass" }],
      },
      toolCtx,
    );

    await writeTool.execute({ wave_number: 1, title: "Updated title" }, toolCtx);

    const readTool = createGoopReadWaveTool(ctx);
    const result = await readTool.execute({}, toolCtx);
    expect(result).toContain("status: completed");
    expect(result).toContain("Updated title");
  });
});

describe("goop_write_wave conditional wave_number", () => {
  let ctx: PluginContext;
  let toolCtx: ToolContext;
  let cleanup: () => void;

  beforeEach(() => {
    const env = setupTestEnvironment("write-wave-conditional");
    cleanup = env.cleanup;
    ctx = createMockPluginContext({ testDir: env.testDir, db: env.db });
    toolCtx = createMockToolContext();
  });

  afterEach(() => cleanup());

  it("traceability-only call with no top-level wave_number succeeds when every row carries its own", async () => {
    const tool = createGoopWriteWaveTool(ctx);
    // Pre-create the target waves so the rows reference valid waves.
    await tool.execute({ wave_number: 1, title: "Wave One" }, toolCtx);
    await tool.execute({ wave_number: 2, title: "Wave Two" }, toolCtx);

    const result = await tool.execute(
      {
        traceability: [
          { requirement_key: "MH1", wave_number: 1, status: "covered" },
          { requirement_key: "MH2", wave_number: 2, status: "covered" },
        ],
      },
      toolCtx,
    );

    expect(result).toContain("Traceability:");
    expect(result).toContain("MH1");
    expect(result).toContain("MH2");

    // Assert against persisted rows, not the returned string.
    const rows = ctx.db.getTraceability("default");
    expect(rows).toHaveLength(2);

    const mh1 = rows.find((r) => r.requirement_key === "MH1");
    const mh2 = rows.find((r) => r.requirement_key === "MH2");
    expect(mh1?.wave_number).toBe(1);
    expect(mh2?.wave_number).toBe(2);
    // No row should have a null target — the anti-null-target invariant.
    expect(rows.every((r) => r.wave_number !== null)).toBe(true);
  });

  it("traceability-only call with no top-level wave_number is rejected when a row omits it, and zero rows are persisted", async () => {
    const tool = createGoopWriteWaveTool(ctx);

    const result = await tool.execute(
      {
        traceability: [
          { requirement_key: "MH1", wave_number: 1, status: "covered" },
          { requirement_key: "MH2", status: "covered" }, // omits wave_number
        ],
      },
      toolCtx,
    );

    expect(result).toContain("Error in goop_write_wave");
    expect(result).toContain("traceability row 1");
    expect(result).toContain("MH2");
    expect(result).toContain("no top-level wave_number was provided");

    // Anti-null-target: zero rows must be persisted — the guard rejects
    // before any write, so no null-target row can reach the DB.
    expect(ctx.db.getTraceability("default")).toHaveLength(0);
  });

  it("wave write with no wave_number is rejected", async () => {
    const tool = createGoopWriteWaveTool(ctx);
    const result = await tool.execute({ title: "No wave number" }, toolCtx);

    expect(result).toContain("Error in goop_write_wave");
    expect(result).toContain("wave_number is required");
    expect(result).toContain("only traceability-only calls may omit it");
    expect(ctx.db.getWave("default", 1)).toBeNull();
  });

  it("task write with no wave_number is rejected", async () => {
    const tool = createGoopWriteWaveTool(ctx);
    const result = await tool.execute({ task_update: { task_index: 1, status: "done" } }, toolCtx);

    expect(result).toContain("Error in goop_write_wave");
    expect(result).toContain("wave_number is required");
    expect(result).toContain("only traceability-only calls may omit it");
  });

  it("items[] batch with no wave_number is rejected", async () => {
    const tool = createGoopWriteWaveTool(ctx);
    const result = await tool.execute(
      { items: [{ wave_number: 1, title: "Batch wave" }] },
      toolCtx,
    );

    expect(result).toContain("Error in goop_write_wave");
    expect(result).toContain("wave_number is required");
    expect(ctx.db.getWave("default", 1)).toBeNull();
  });

  it("verifications with no wave_number is rejected", async () => {
    const tool = createGoopWriteWaveTool(ctx);
    const result = await tool.execute(
      { verifications: [{ check_name: "test", status: "pass" }] },
      toolCtx,
    );

    expect(result).toContain("Error in goop_write_wave");
    expect(result).toContain("wave_number is required");
  });

  it("traceability-only with no rows and no wave_number is rejected", async () => {
    const tool = createGoopWriteWaveTool(ctx);
    const result = await tool.execute({ traceability: [] }, toolCtx);

    expect(result).toContain("Error in goop_write_wave");
    expect(result).toContain("wave_number is required");
    expect(result).toContain("no traceability rows");
  });

  it("traceability-only call with no top-level wave_number writes traceability_write events", async () => {
    const tool = createGoopWriteWaveTool(ctx);
    await tool.execute({ wave_number: 1, title: "Wave One" }, toolCtx);

    await tool.execute(
      {
        traceability: [{ requirement_key: "MH1", wave_number: 1, status: "covered" }],
      },
      toolCtx,
    );

    const events = ctx.db.getEvents("default", "traceability_write");
    expect(events).toHaveLength(1);
    expect(JSON.parse(events[0].payload).wave_number).toBe(1);
  });
});

describe("goop_write_wave wave-completion verification gate", () => {
  let ctx: PluginContext;
  let toolCtx: ToolContext;
  let cleanup: () => void;

  beforeEach(() => {
    const env = setupTestEnvironment("goop-write-wave-verify-gate");
    cleanup = env.cleanup;
    ctx = createMockPluginContext({ testDir: env.testDir, db: env.db });
    toolCtx = createMockToolContext();
  });

  afterEach(() => cleanup());

  it("blocks single-wave completion when the wave has zero verification rows", async () => {
    const tool = createGoopWriteWaveTool(ctx);
    const result = await tool.execute(
      { wave_number: 1, title: "Unverified wave", status: "done" },
      toolCtx,
    );

    expect(result).toContain("Error in goop_write_wave");
    expect(result).toContain("cannot be marked complete");
    expect(result).toContain("goop-wave-verifier");
    // The whole call rolled back — the wave was never created.
    expect(ctx.db.getWave("default", 1)).toBeNull();
  });

  it("blocks single-wave completion when the wave's only verification row is failed", async () => {
    const tool = createGoopWriteWaveTool(ctx);
    // Record a fail as a prior, non-completing call so the wave exists with a
    // failing row before the completion attempt.
    await tool.execute(
      {
        wave_number: 1,
        title: "Failing wave",
        status: "in_progress",
        verifications: [{ check_name: "test", status: "fail" }],
      },
      toolCtx,
    );

    const result = await tool.execute({ wave_number: 1, status: "done" }, toolCtx);

    expect(result).toContain("Error in goop_write_wave");
    expect(result).toContain("goop-wave-verifier");
    expect(ctx.db.getWave("default", 1)?.status).toBe("in_progress");
  });

  it("blocks single-wave completion on mixed pass/fail rows", async () => {
    const tool = createGoopWriteWaveTool(ctx);
    await tool.execute(
      {
        wave_number: 1,
        title: "Mixed wave",
        status: "in_progress",
        verifications: [
          { check_name: "typecheck", status: "pass" },
          { check_name: "test", status: "fail" },
        ],
      },
      toolCtx,
    );

    const result = await tool.execute({ wave_number: 1, status: "completed" }, toolCtx);

    expect(result).toContain("Error in goop_write_wave");
    expect(ctx.db.getWave("default", 1)?.status).toBe("in_progress");
  });

  it("unblocks single-wave completion with a pass-only row", async () => {
    const tool = createGoopWriteWaveTool(ctx);
    const result = await tool.execute(
      {
        wave_number: 1,
        title: "Pass wave",
        status: "done",
        verifications: [{ check_name: "test", status: "pass" }],
      },
      toolCtx,
    );

    expect(result).toContain("Written wave 1");
    expect(ctx.db.getWave("default", 1)?.status).toBe("done");
  });

  it("unblocks single-wave completion with an explicit skip-only row (auditable escape)", async () => {
    const tool = createGoopWriteWaveTool(ctx);
    const result = await tool.execute(
      {
        wave_number: 1,
        title: "Skip wave",
        status: "done",
        verifications: [{ check_name: "custom", status: "skip" }],
      },
      toolCtx,
    );

    expect(result).toContain("Written wave 1");
    expect(ctx.db.getWave("default", 1)?.status).toBe("done");
  });

  it("rejects a failing verification supplied in the same call as completion, rolling back the row too", async () => {
    const tool = createGoopWriteWaveTool(ctx);
    const result = await tool.execute(
      {
        wave_number: 1,
        title: "Same-call fail",
        status: "done",
        verifications: [{ check_name: "test", status: "fail" }],
      },
      toolCtx,
    );

    expect(result).toContain("Error in goop_write_wave");
    expect(result).toContain("goop-wave-verifier");
    // No partial writes: neither the wave nor the failing verification row survive.
    expect(ctx.db.getWave("default", 1)).toBeNull();
    expect(ctx.db.getVerifications("default")).toHaveLength(0);
  });

  it("persists the DB's canonical vocabulary, not the tool's pass|fail|skip input", async () => {
    const tool = createGoopWriteWaveTool(ctx);
    await tool.execute(
      {
        wave_number: 1,
        title: "Canonical status wave",
        status: "done",
        verifications: [{ check_name: "test", status: "pass" }],
      },
      toolCtx,
    );

    const wave = ctx.db.getWave("default", 1);
    const rows = ctx.db.getVerifications("default", wave?.id ?? -1);
    expect(rows).toHaveLength(1);
    // Stored value must be the DB's "passed", never the tool's raw "pass".
    expect(rows[0].status).toBe("passed");
  });

  it("persists 'failed' and 'skipped' as canonical DB statuses too", async () => {
    const tool = createGoopWriteWaveTool(ctx);
    await tool.execute(
      {
        wave_number: 1,
        title: "Mixed canonical wave",
        status: "in_progress",
        verifications: [
          { check_name: "typecheck", status: "fail" },
          { check_name: "custom", status: "skip" },
        ],
      },
      toolCtx,
    );

    const wave = ctx.db.getWave("default", 1);
    const rows = ctx.db.getVerifications("default", wave?.id ?? -1);
    expect(rows.map((r) => r.status).sort()).toEqual(["failed", "skipped"]);
  });

  it("blocks items[] batch completion when the item's wave has zero verification rows", async () => {
    const tool = createGoopWriteWaveTool(ctx);
    const result = await tool.execute(
      {
        wave_number: 1,
        items: [{ wave_number: 1, title: "Unverified batch wave", status: "completed" }],
      },
      toolCtx,
    );

    expect(result).toContain("0/1 succeeded");
    expect(result).toContain("goop-wave-verifier");
    expect(ctx.db.getWave("default", 1)).toBeNull();
  });

  it("unblocks items[] batch completion with a same-call pass row", async () => {
    const tool = createGoopWriteWaveTool(ctx);
    const result = await tool.execute(
      {
        wave_number: 1,
        items: [
          {
            wave_number: 1,
            title: "Verified batch wave",
            status: "completed",
            verifications: [{ check_name: "test", status: "pass" }],
          },
        ],
      },
      toolCtx,
    );

    expect(result).toContain("1/1 succeeded");
    expect(ctx.db.getWave("default", 1)?.status).toBe("completed");
  });

  it("in a multi-item batch, one item's unverified completion rolls back the whole batch including a sibling's verified completion", async () => {
    const tool = createGoopWriteWaveTool(ctx);
    const result = await tool.execute(
      {
        wave_number: 1,
        items: [
          {
            wave_number: 1,
            title: "Verified wave",
            status: "completed",
            verifications: [{ check_name: "test", status: "pass" }],
          },
          {
            wave_number: 2,
            title: "Unverified wave",
            status: "completed",
          },
        ],
      },
      toolCtx,
    );

    expect(result).toContain("0/2 succeeded");
    // Atomic: neither wave survives even though item 1 was individually verified.
    expect(ctx.db.getWave("default", 1)).toBeNull();
    expect(ctx.db.getWave("default", 2)).toBeNull();
  });

  it("does not gate task-level completion or metadata-only writes", async () => {
    const tool = createGoopWriteWaveTool(ctx);
    // A wave stays non-terminal; only its task is marked done. No verification
    // row exists anywhere, and this must still succeed — the gate only
    // applies to the wave's own status transitioning to a complete value.
    await tool.execute(
      {
        wave_number: 1,
        title: "Task-only wave",
        tasks: [{ task_index: 1, description: "Task", status: "pending" }],
      },
      toolCtx,
    );

    const result = await tool.execute(
      { wave_number: 1, task_update: { task_index: 1, status: "done" } },
      toolCtx,
    );

    expect(result).toContain("Updated task 1");
    expect(ctx.db.getWave("default", 1)?.status).not.toBe("done");
  });

  it("a later passing row for the SAME check supersedes an earlier failing row for that check — completion unblocks (append-only)", async () => {
    const tool = createGoopWriteWaveTool(ctx);
    await tool.execute(
      {
        wave_number: 1,
        title: "Append-only wave",
        status: "in_progress",
        verifications: [{ check_name: "test", status: "fail" }],
      },
      toolCtx,
    );
    await tool.execute(
      {
        wave_number: 1,
        verifications: [{ check_name: "test", status: "pass" }],
      },
      toolCtx,
    );

    // Both rows still exist for the wave — the later pass does not delete
    // the earlier fail — but the effective status for "test" is now its
    // latest row (pass), so completion succeeds.
    const result = await tool.execute({ wave_number: 1, status: "done" }, toolCtx);
    expect(result).toContain("Written wave 1");
    expect(ctx.db.getWave("default", 1)?.status).toBe("done");

    const wave = ctx.db.getWave("default", 1);
    const rows = ctx.db.getVerifications("default", wave?.id ?? -1);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.status).sort()).toEqual(["failed", "passed"]);
  });

  it("a later passing row for a DIFFERENT check does not supersede another check's unresolved fail — completion stays blocked", async () => {
    const tool = createGoopWriteWaveTool(ctx);
    await tool.execute(
      {
        wave_number: 1,
        title: "Different-check wave",
        status: "in_progress",
        verifications: [{ check_name: "test", status: "fail" }],
      },
      toolCtx,
    );
    await tool.execute(
      {
        wave_number: 1,
        verifications: [{ check_name: "typecheck", status: "pass" }],
      },
      toolCtx,
    );

    const result = await tool.execute({ wave_number: 1, status: "done" }, toolCtx);
    expect(result).toContain("Error in goop_write_wave");
    expect(result).toContain("goop-wave-verifier");
    expect(ctx.db.getWave("default", 1)?.status).toBe("in_progress");
  });

  it("a later skip row for the SAME check supersedes an earlier failing row for that check — completion unblocks", async () => {
    const tool = createGoopWriteWaveTool(ctx);
    await tool.execute(
      {
        wave_number: 1,
        title: "Skip-remediation wave",
        status: "in_progress",
        verifications: [{ check_name: "test", status: "fail" }],
      },
      toolCtx,
    );
    await tool.execute(
      {
        wave_number: 1,
        verifications: [{ check_name: "test", status: "skip" }],
      },
      toolCtx,
    );

    const result = await tool.execute({ wave_number: 1, status: "done" }, toolCtx);
    expect(result).toContain("Written wave 1");
    expect(ctx.db.getWave("default", 1)?.status).toBe("done");
  });
});
