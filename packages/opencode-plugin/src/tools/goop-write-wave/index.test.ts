import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import type { PluginContext, ToolContext } from "../../test-utils.js";
import {
  createMockPluginContext,
  createMockToolContext,
  setupTestEnvironment,
} from "../../test-utils.js";
import { createGoopReadWavesTool } from "../goop-read-waves/index.js";
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

  it("proves the progress view reflects task status updates through read output", async () => {
    const writeTool = createGoopWriteWaveTool(ctx);
    const readTool = createGoopReadWavesTool(ctx);
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

    const result = await readTool.execute({ wave_number: 2 }, toolCtx);
    expect(result).toContain("- progress: 1/3 tasks complete");
    expect(result).toContain("- 2. [done] Two");
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
