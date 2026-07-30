import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { PluginContext, ToolContext } from "../../test-utils.js";
import {
  createMockPluginContext,
  createMockToolContext,
  setupTestEnvironment,
} from "../../test-utils.js";
import { createGoopBlockerTool } from "./index.js";

describe("goop_blocker tool", () => {
  let ctx: PluginContext;
  let toolCtx: ToolContext;
  let cleanup: () => void;

  beforeEach(() => {
    const env = setupTestEnvironment("goop-blocker");
    cleanup = env.cleanup;
    ctx = createMockPluginContext({ testDir: env.testDir, db: env.db });
    toolCtx = createMockToolContext();
  });

  afterEach(() => cleanup());

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  it("opens, lists, and resolves a blocker", async () => {
    const blockerTool = createGoopBlockerTool(ctx);

    const openResult = await blockerTool.execute(
      {
        action: "open",
        description: "Waiting on migration review",
        severity: "high",
        wave_id: 3,
      },
      toolCtx,
    );

    expect(openResult).toContain("Opened blocker #");

    const openRows = ctx.db.getBlockers("default", "open");
    expect(openRows.length).toBe(1);
    expect(openRows[0].description).toBe("Waiting on migration review");
    expect(openRows[0].severity).toBe("high");
    expect(openRows[0].status).toBe("open");

    const openList = await blockerTool.execute({ action: "list", status: "open" }, toolCtx);
    expect(openList).toContain(`#${openRows[0].id}`);
    expect(openList).toContain("high");
    expect(openList).toContain("Waiting on migration review");

    const resolveResult = await blockerTool.execute(
      {
        action: "resolve",
        id: openRows[0].id,
        resolution: "Reviewer approved migration",
      },
      toolCtx,
    );
    expect(resolveResult).toContain(`Resolved blocker #${openRows[0].id}`);

    const resolvedRows = ctx.db.getBlockers("default", "resolved");
    expect(resolvedRows.length).toBe(1);
    expect(resolvedRows[0].id).toBe(openRows[0].id);
    expect(resolvedRows[0].status).toBe("resolved");
    expect(resolvedRows[0].resolution).toBe("Reviewer approved migration");

    const resolvedList = await blockerTool.execute({ action: "list", status: "resolved" }, toolCtx);
    expect(resolvedList).toContain("resolved");
    expect(resolvedList).toContain("Reviewer approved migration");
  });

  it("refreshes STATUS.md immediately after opening a blocker", async () => {
    const blockerTool = createGoopBlockerTool(ctx);

    const openResult = await blockerTool.execute(
      {
        action: "open",
        description: "Waiting on migration review",
        severity: "high",
      },
      toolCtx,
    );

    expect(openResult).toContain("Opened blocker #");
    const statusPath = join(ctx.sdk.directory, ".goopspec", "default", "..", "STATUS.md");
    const status = readFileSync(statusPath, "utf-8");
    expect(status).toContain("### Open Blockers");
    expect(status).toContain("Waiting on migration review");
  });

  it("refreshes STATUS.md immediately after resolving a blocker", async () => {
    const blockerTool = createGoopBlockerTool(ctx);
    await blockerTool.execute(
      {
        action: "open",
        description: "Waiting on migration review",
        severity: "high",
      },
      toolCtx,
    );
    const id = ctx.db.getBlockers("default", "open")[0].id;

    const resolveResult = await blockerTool.execute(
      { action: "resolve", id, resolution: "Reviewer approved migration" },
      toolCtx,
    );

    expect(resolveResult).toContain(`Resolved blocker #${id}`);
    const statusPath = join(ctx.sdk.directory, ".goopspec", "default", "..", "STATUS.md");
    const status = readFileSync(statusPath, "utf-8");
    expect(status).not.toContain("### Open Blockers");
    expect(status).not.toContain("Waiting on migration review");
  });

  // -----------------------------------------------------------------------
  // Event logging
  // -----------------------------------------------------------------------

  it("appends blocker lifecycle events", async () => {
    const blockerTool = createGoopBlockerTool(ctx);
    await blockerTool.execute({ action: "open", description: "Need operator input" }, toolCtx);
    const id = ctx.db.getBlockers("default", "open")[0].id;
    await blockerTool.execute({ action: "resolve", id, resolution: "Input received" }, toolCtx);
    await blockerTool.execute({ action: "list" }, toolCtx);

    expect(ctx.db.getEvents("default", "blocker_open").length).toBe(1);
    expect(ctx.db.getEvents("default", "blocker_resolve").length).toBe(1);
    expect(ctx.db.getEvents("default", "blocker_list").length).toBe(1);
  });

  // -----------------------------------------------------------------------
  // Batch items[]
  // -----------------------------------------------------------------------

  it("empty items array falls through to single-action path", async () => {
    const blockerTool = createGoopBlockerTool(ctx);

    const result = await blockerTool.execute(
      {
        items: [],
        action: "open",
        description: "Fallback blocker",
        severity: "low",
        wave_id: 1,
      },
      toolCtx,
    );

    expect(result).toContain("Opened blocker #");

    const openBlockers = ctx.db.getBlockers("default", "open");
    expect(openBlockers.length).toBe(1);
    expect(openBlockers[0].description).toBe("Fallback blocker");
  });

  it("returns error when items array is empty and no action is provided", async () => {
    const blockerTool = createGoopBlockerTool(ctx);

    const result = await blockerTool.execute({ items: [] }, toolCtx);

    expect(result).toContain("Error in goop_blocker");
    expect(result).toContain("items[] array is empty");
    expect(result).not.toContain("succeeded");
  });

  it("opens and resolves multiple blockers in a single items batch", async () => {
    const blockerTool = createGoopBlockerTool(ctx);

    const result = await blockerTool.execute(
      {
        items: [
          {
            action: "open",
            description: "Batch blocker A",
            severity: "low",
            wave_id: 1,
          },
          { action: "open", description: "Batch blocker B", severity: "high" },
          { action: "list", status: "open" },
        ],
      },
      toolCtx,
    );

    expect(result).toContain("Batch blocker: 3/3 succeeded");
    expect(result).toContain("[0] OK: Opened blocker #");
    expect(result).toContain("[1] OK: Opened blocker #");
    expect(result).toContain("[2] OK: # Blockers");

    const openBlockers = ctx.db.getBlockers("default", "open");
    expect(openBlockers.length).toBe(2);
    expect(openBlockers.map((b) => b.description).sort()).toEqual([
      "Batch blocker A",
      "Batch blocker B",
    ]);
  });

  it("fails the whole batch when one item is invalid", async () => {
    const blockerTool = createGoopBlockerTool(ctx);

    const result = await blockerTool.execute(
      {
        items: [
          { action: "open", description: "First batch blocker" },
          { action: "resolve", id: 9999, resolution: "Missing blocker" },
        ],
      },
      toolCtx,
    );

    expect(result).toContain("Batch blocker: 0/2 succeeded, 2 failed");
    expect(ctx.db.getBlockers("default").length).toBe(0);
    expect(ctx.db.getEvents("default").length).toBe(0);
  });

  // -----------------------------------------------------------------------
  // Completed-wave guard
  // -----------------------------------------------------------------------

  it("warns but still opens a blocker against a wave marked 'done'", async () => {
    ctx.db.upsertWave("default", { wave_number: 2, status: "done" });
    const blockerTool = createGoopBlockerTool(ctx);

    const result = await blockerTool.execute(
      { action: "open", description: "Regression in wave 2", wave_id: 2 },
      toolCtx,
    );

    // The warning is present and actionable.
    expect(result).toContain("WARNING: Wave 2 is already marked complete");
    expect(result).toContain("status: 'done'");
    expect(result).toContain("late-discovered regression");
    expect(result).toContain("omit wave_id");

    // The blocker was still opened — the signal is preserved.
    expect(result).toContain("Opened blocker #");
    const openBlockers = ctx.db.getBlockers("default", "open");
    expect(openBlockers.length).toBe(1);
    expect(openBlockers[0].description).toBe("Regression in wave 2");
    expect(openBlockers[0].wave_id).toBe(2);
  });

  it("warns but still opens a blocker against a wave marked 'completed'", async () => {
    ctx.db.upsertWave("default", { wave_number: 1, status: "completed" });
    const blockerTool = createGoopBlockerTool(ctx);

    const result = await blockerTool.execute(
      { action: "open", description: "Late issue in wave 1", wave_id: 1 },
      toolCtx,
    );

    expect(result).toContain("WARNING: Wave 1 is already marked complete");
    expect(result).toContain("status: 'completed'");
    expect(result).toContain("Opened blocker #");
    expect(ctx.db.getBlockers("default", "open").length).toBe(1);
  });

  it("does not warn when opening a blocker against an in-progress wave", async () => {
    ctx.db.upsertWave("default", { wave_number: 3, status: "in_progress" });
    const blockerTool = createGoopBlockerTool(ctx);

    const result = await blockerTool.execute(
      { action: "open", description: "Blocked on wave 3", wave_id: 3 },
      toolCtx,
    );

    expect(result).not.toContain("WARNING");
    expect(result).toContain("Opened blocker #");
    expect(ctx.db.getBlockers("default", "open").length).toBe(1);
  });

  it("does not warn when opening a blocker without a wave_id", async () => {
    const blockerTool = createGoopBlockerTool(ctx);

    const result = await blockerTool.execute(
      { action: "open", description: "Workflow-level blocker" },
      toolCtx,
    );

    expect(result).not.toContain("WARNING");
    expect(result).toContain("Opened blocker #");
    expect(ctx.db.getBlockers("default", "open").length).toBe(1);
  });

  it("does not warn when the wave_id does not match any wave row", async () => {
    const blockerTool = createGoopBlockerTool(ctx);

    const result = await blockerTool.execute(
      { action: "open", description: "Phantom wave blocker", wave_id: 99 },
      toolCtx,
    );

    expect(result).not.toContain("WARNING");
    expect(result).toContain("Opened blocker #");
    expect(ctx.db.getBlockers("default", "open").length).toBe(1);
  });

  it("surfaces the completed-wave warning in batch items[] mode", async () => {
    ctx.db.upsertWave("default", { wave_number: 1, status: "completed" });
    const blockerTool = createGoopBlockerTool(ctx);

    const result = await blockerTool.execute(
      {
        items: [
          { action: "open", description: "Against completed wave", wave_id: 1 },
          { action: "open", description: "Against in-progress wave", wave_id: 2 },
        ],
      },
      toolCtx,
    );

    expect(result).toContain("Batch blocker: 2/2 succeeded");
    // First item carries the warning.
    expect(result).toContain("[0] OK: WARNING: Wave 1 is already marked complete");
    // Second item has no warning (wave 2 doesn't exist).
    expect(result).not.toContain("[1] OK: WARNING");
    expect(result).toContain("[1] OK: Opened blocker #");

    expect(ctx.db.getBlockers("default", "open").length).toBe(2);
  });
});
