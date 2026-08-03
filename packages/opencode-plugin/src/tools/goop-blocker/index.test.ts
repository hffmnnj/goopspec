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

  // -----------------------------------------------------------------------
  // Severity enum alignment
  // -----------------------------------------------------------------------

  it("opens a blocker with severity 'critical' and reads it back", async () => {
    const blockerTool = createGoopBlockerTool(ctx);

    const openResult = await blockerTool.execute(
      {
        action: "open",
        description: "Critical infrastructure failure",
        severity: "critical",
        wave_id: 1,
      },
      toolCtx,
    );

    expect(openResult).toContain("Opened blocker #");

    const openBlockers = ctx.db.getBlockers("default", "open");
    expect(openBlockers.length).toBe(1);
    expect(openBlockers[0].description).toBe("Critical infrastructure failure");
    expect(openBlockers[0].severity).toBe("critical");
    expect(openBlockers[0].status).toBe("open");
  });

  // -----------------------------------------------------------------------
  // Ambiguity rejection (W4.T3 — top-level operation fields alongside items[])
  // -----------------------------------------------------------------------

  it("rejects a meaningful top-level action alongside items[], with zero mutation", async () => {
    const blockerTool = createGoopBlockerTool(ctx);

    const result = await blockerTool.execute(
      {
        action: "open",
        description: "Leaked top-level open",
        items: [{ action: "open", description: "Batch A" }],
      },
      toolCtx,
    );

    expect(result).toContain("Error in goop_blocker");
    expect(result).toContain("action");
    expect(result).toContain("items[]");
    expect(ctx.db.getBlockers("default").length).toBe(0);
  });

  it("rejects a meaningful top-level description alongside items[], with zero mutation", async () => {
    const blockerTool = createGoopBlockerTool(ctx);

    const result = await blockerTool.execute(
      {
        description: "Leaked description",
        items: [{ action: "open", description: "Batch A" }],
      },
      toolCtx,
    );

    expect(result).toContain("Error in goop_blocker");
    expect(result).toContain("description");
    expect(ctx.db.getBlockers("default").length).toBe(0);
  });

  it("still accepts workflow_id alongside items[] because it is genuinely consumed as the default", async () => {
    const blockerTool = createGoopBlockerTool(ctx);

    const result = await blockerTool.execute(
      {
        workflow_id: "custom-wf",
        items: [{ action: "open", description: "Scoped blocker" }],
      },
      toolCtx,
    );

    expect(result).toContain("1/1 succeeded");
    expect(ctx.db.getBlockers("custom-wf", "open")).toHaveLength(1);
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

// ---------------------------------------------------------------------------
// Positive fixture inventory — valid call shapes (W4 Task 1)
//
// goop_blocker is an action-based lifecycle tool, structurally distinct
// from the content-document tools. It has no `content`, `mode`,
// `old_string`, `new_string`, or `replace_all` fields. The generic shapes:
//   - "full-document write" → action: 'open' (the create analog)
//   - "append mode" → N/A. No `mode`/content fields.
//   - "patch mode" → N/A. No patch fields; lifecycle transitions use
//     action: 'resolve' (which upserts with status: 'resolved'), not
//     substring patching.
//   - "replace-all patch" → N/A.
//   - "items[] batch" → applies.
//   - "blank-document patch workaround" → N/A.
//
// The tool's OWN valid shapes are action: open / resolve / list, plus the
// items[] batch combining them. All are locked below.
// ---------------------------------------------------------------------------

describe("goop_blocker positive fixture inventory — valid call shapes (W4.T1)", () => {
  let ctx: PluginContext;
  let toolCtx: ToolContext;
  let cleanup: () => void;

  beforeEach(() => {
    const env = setupTestEnvironment("goop-blocker-inventory");
    cleanup = env.cleanup;
    ctx = createMockPluginContext({ testDir: env.testDir, db: env.db });
    toolCtx = createMockToolContext();
  });

  afterEach(() => cleanup());

  it("SHAPE: action open (action + description + optional severity)", async () => {
    const tool = createGoopBlockerTool(ctx);
    const result = await tool.execute(
      { action: "open", description: "Inventory blocker", severity: "medium" },
      toolCtx,
    );
    expect(result).toContain("Opened blocker #");
    expect(ctx.db.getBlockers("default", "open")).toHaveLength(1);
  });

  it("SHAPE (tool-specific): action resolve (action + id + resolution)", async () => {
    const tool = createGoopBlockerTool(ctx);
    await tool.execute({ action: "open", description: "To resolve" }, toolCtx);
    const id = ctx.db.getBlockers("default", "open")[0].id;

    const result = await tool.execute(
      { action: "resolve", id, resolution: "Resolved in inventory" },
      toolCtx,
    );
    expect(result).toContain(`Resolved blocker #${id}`);
    expect(ctx.db.getBlockers("default", "resolved")).toHaveLength(1);
  });

  it("SHAPE (tool-specific): action list (action + optional status filter)", async () => {
    const tool = createGoopBlockerTool(ctx);
    await tool.execute({ action: "open", description: "Listed blocker" }, toolCtx);

    const result = await tool.execute({ action: "list", status: "open" }, toolCtx);
    expect(result).toContain("# Blockers");
    expect(result).toContain("Listed blocker");
  });

  it("SHAPE: items[] batch (mixed open + list)", async () => {
    const tool = createGoopBlockerTool(ctx);
    const result = await tool.execute(
      {
        items: [
          { action: "open", description: "Batch A" },
          { action: "open", description: "Batch B" },
          { action: "list", status: "open" },
        ],
      },
      toolCtx,
    );
    expect(result).toContain("3/3 succeeded");
    expect(ctx.db.getBlockers("default", "open")).toHaveLength(2);
  });
});
