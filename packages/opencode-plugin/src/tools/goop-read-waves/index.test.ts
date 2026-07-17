import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import type { PluginContext, ToolContext } from "../../test-utils.js";
import {
  createMockPluginContext,
  createMockToolContext,
  setupTestEnvironment,
} from "../../test-utils.js";
import { createGoopWriteWaveTool } from "../goop-write-wave/index.js";
import { createGoopReadWavesTool } from "./index.js";

describe("goop_read_waves tool", () => {
  let ctx: PluginContext;
  let toolCtx: ToolContext;
  let cleanup: () => void;

  beforeEach(() => {
    const env = setupTestEnvironment("goop-read-waves");
    cleanup = env.cleanup;
    ctx = createMockPluginContext({ testDir: env.testDir, db: env.db });
    toolCtx = createMockToolContext();
  });

  afterEach(() => cleanup());

  it("reads one wave with tasks and progress by number", async () => {
    const writeTool = createGoopWriteWaveTool(ctx);
    await writeTool.execute(
      {
        wave_number: 2,
        title: "Section and wave tools",
        status: "in_progress",
        pr_branch: "feat/section-wave-tools",
        pr_url: "https://example.com/pr/2",
        tasks: [
          { task_index: 1, description: "Build section tools", status: "done" },
          { task_index: 2, description: "Build wave tools" },
          { task_index: 3, description: "Register later" },
        ],
      },
      toolCtx,
    );

    const readTool = createGoopReadWavesTool(ctx);
    const result = await readTool.execute({ wave_number: 2 }, toolCtx);

    expect(result).toContain("## Wave 2: Section and wave tools");
    expect(result).toContain("- status: in_progress");
    expect(result).toContain("- progress: 1/3 tasks complete");
    expect(result).toContain("- pr_branch: feat/section-wave-tools");
    expect(result).toContain("- pr_url: https://example.com/pr/2");
    expect(result).toContain("- 1. [done] Build section tools");
  });

  it("reads all waves ordered by wave_number and filters by status", async () => {
    const writeTool = createGoopWriteWaveTool(ctx);
    await writeTool.execute({ wave_number: 2, title: "Second", status: "pending" }, toolCtx);
    await writeTool.execute({ wave_number: 1, title: "First", status: "done" }, toolCtx);

    const readTool = createGoopReadWavesTool(ctx);
    const allResult = String(await readTool.execute({}, toolCtx));
    expect(allResult.indexOf("## Wave 1: First")).toBeLessThan(
      allResult.indexOf("## Wave 2: Second"),
    );

    const filteredResult = await readTool.execute({ status: "done" }, toolCtx);
    expect(filteredResult).toContain("## Wave 1: First");
    expect(filteredResult).not.toContain("## Wave 2: Second");
  });

  it("returns a clear not-found message when no waves match", async () => {
    const readTool = createGoopReadWavesTool(ctx);
    const result = await readTool.execute({ wave_number: 99 }, toolCtx);

    expect(result).toContain("No wave 99 found");
    expect(result).toContain("goop_write_wave");
  });

  it("shows updated completion ratio after a task_update", async () => {
    const writeTool = createGoopWriteWaveTool(ctx);
    await writeTool.execute(
      {
        wave_number: 2,
        title: "Progress update",
        tasks: [
          { task_index: 1, description: "One" },
          { task_index: 2, description: "Two" },
          { task_index: 3, description: "Three" },
        ],
      },
      toolCtx,
    );
    await writeTool.execute(
      { wave_number: 2, task_update: { task_index: 1, status: "done" } },
      toolCtx,
    );

    const readTool = createGoopReadWavesTool(ctx);
    const result = await readTool.execute({ wave_number: 2 }, toolCtx);

    expect(result).toContain("- progress: 1/3 tasks complete");
    expect(result).toContain("- 1. [done] One");
  });

  // -----------------------------------------------------------------------
  // Batch mode
  // -----------------------------------------------------------------------

  it("reads multiple waves in one call using wave_numbers", async () => {
    const writeTool = createGoopWriteWaveTool(ctx);
    await writeTool.execute({ wave_number: 1, title: "First", status: "done" }, toolCtx);
    await writeTool.execute({ wave_number: 2, title: "Second", status: "in_progress" }, toolCtx);
    await writeTool.execute({ wave_number: 3, title: "Third", status: "pending" }, toolCtx);

    const readTool = createGoopReadWavesTool(ctx);
    const result = String(await readTool.execute({ wave_numbers: [1, 3] }, toolCtx));

    expect(result).toContain("## Wave 1: First");
    expect(result).toContain("## Wave 3: Third");
    expect(result).not.toContain("## Wave 2: Second");
  });

  it("falls back to all waves when wave_numbers is empty", async () => {
    const writeTool = createGoopWriteWaveTool(ctx);
    await writeTool.execute({ wave_number: 1, title: "First", status: "done" }, toolCtx);

    const readTool = createGoopReadWavesTool(ctx);
    const result = String(await readTool.execute({ wave_numbers: [] }, toolCtx));

    expect(result).toContain("## Wave 1: First");
  });
});
