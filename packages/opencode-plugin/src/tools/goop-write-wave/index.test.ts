import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import { GoopSpecDB } from "../../features/db/index.js";
import type { PluginContext, ToolContext } from "../../test-utils.js";
import {
  createMockPluginContext,
  createMockToolContext,
  setupTestEnvironment,
} from "../../test-utils.js";
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

  it("returns empty result for empty items array", async () => {
    const tool = createGoopWriteWaveTool(ctx);
    const result = await tool.execute({ wave_number: 1, items: [] }, toolCtx);
    expect(result).toContain("0/0 succeeded");
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

  it("rejects verifications/traceability alongside task_updates", async () => {
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
        traceability: [{ requirement_key: "MH2" }],
      },
      toolCtx,
    );

    expect(result).toContain("not supported alongside task_updates");
  });
});
