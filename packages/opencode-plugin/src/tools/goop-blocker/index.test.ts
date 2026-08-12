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

// ---------------------------------------------------------------------------
// Mode contract pins: which argument each action actually consults.
// goop_blocker's `status` field is the subtle one — it is forced to "open" on
// open and "resolved" on resolve, so a caller-supplied status has no effect
// there and is honored only as a list filter. These lock that behavior.
// ---------------------------------------------------------------------------

describe("goop_blocker mode-selection contract", () => {
  let ctx: PluginContext;
  let toolCtx: ToolContext;
  let cleanup: () => void;

  beforeEach(() => {
    const env = setupTestEnvironment("goop-blocker-modes");
    cleanup = env.cleanup;
    ctx = createMockPluginContext({ testDir: env.testDir, db: env.db });
    toolCtx = createMockToolContext();
  });

  afterEach(() => cleanup());

  it("open ignores a caller-supplied status and forces 'open'", async () => {
    const tool = createGoopBlockerTool(ctx);

    const result = await tool.execute(
      { action: "open", description: "Forced-status blocker", status: "resolved" },
      toolCtx,
    );

    expect(result).toContain("Opened blocker #");
    const rows = ctx.db.getBlockers("default", "open");
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("open");
    expect(ctx.db.getBlockers("default", "resolved")).toHaveLength(0);
  });

  it("resolve ignores a caller-supplied status and forces 'resolved'", async () => {
    const tool = createGoopBlockerTool(ctx);
    await tool.execute({ action: "open", description: "To resolve" }, toolCtx);
    const id = ctx.db.getBlockers("default", "open")[0].id;

    const result = await tool.execute(
      { action: "resolve", id, status: "open" },
      toolCtx,
    );

    expect(result).toContain(`Resolved blocker #${id}`);
    expect(ctx.db.getBlockers("default", "resolved")).toHaveLength(1);
    expect(ctx.db.getBlockers("default", "open")).toHaveLength(0);
  });

  it("list honors status as a filter (open vs resolved)", async () => {
    const tool = createGoopBlockerTool(ctx);
    await tool.execute({ action: "open", description: "First" }, toolCtx);
    await tool.execute({ action: "open", description: "Second" }, toolCtx);
    const firstId = ctx.db
      .getBlockers("default", "open")
      .find((blocker) => blocker.description === "First")?.id;
    if (firstId === undefined) throw new Error("First blocker not found in setup");
    await tool.execute({ action: "resolve", id: firstId, resolution: "done" }, toolCtx);

    const openList = await tool.execute({ action: "list", status: "open" }, toolCtx);
    expect(openList).toContain("Second");
    expect(openList).not.toContain("First");

    const resolvedList = await tool.execute({ action: "list", status: "resolved" }, toolCtx);
    expect(resolvedList).toContain("First");
    expect(resolvedList).not.toContain("Second");
  });

  it("open without description returns an actionable error naming the field", async () => {
    const tool = createGoopBlockerTool(ctx);

    const result = await tool.execute({ action: "open" }, toolCtx);

    expect(result).toContain("Error in goop_blocker");
    expect(result).toContain('`description` is required for action "open"');
    expect(result).toContain('{ action: "open", description: "what is blocked" }');
    expect(ctx.db.getBlockers("default")).toHaveLength(0);
  });

  it("resolve without id returns an actionable error naming the field", async () => {
    const tool = createGoopBlockerTool(ctx);

    const result = await tool.execute({ action: "resolve", resolution: "no id" }, toolCtx);

    expect(result).toContain("Error in goop_blocker");
    expect(result).toContain('`id` is required for action "resolve"');
    expect(result).toContain('{ action: "resolve", id: 123 }');
    expect(ctx.db.getBlockers("default")).toHaveLength(0);
  });

  it("resolve on an unknown id returns an error naming the id and workflow", async () => {
    const tool = createGoopBlockerTool(ctx);

    const result = await tool.execute({ action: "resolve", id: 9999 }, toolCtx);

    expect(result).toContain("Error in goop_blocker");
    expect(result).toContain("9999");
    expect(result).toContain("not found");
  });
});

// ---------------------------------------------------------------------------
// Semantic omission and invalid authored text (Wave 3 Task 3.3)
//
// Host injection fills optional fields the caller never authored with type
// defaults ("" for strings, 0 for numbers). None of those empty forms carries
// authored intent on goop_blocker:
//   - action "" must never select a lifecycle operation
//   - description ""/severity ""/status ""/resolution ""/workflow_id "" are
//     treated as absent so they cannot overwrite stored text, force a default,
//     or address the wrong workflow
//   - id 0 / wave_id 0 can never address a real blocker row or wave (both are
//     1-based), so they are treated as absent too
// Whitespace-only strings are the tool's own defect class: they survive the
// shared boundary by design (they may be authored), so the tool rejects them
// with actionable guidance rather than storing them.
// ---------------------------------------------------------------------------

describe("goop_blocker semantic omission and invalid text (W3.T3)", () => {
  let ctx: PluginContext;
  let toolCtx: ToolContext;
  let cleanup: () => void;

  beforeEach(() => {
    const env = setupTestEnvironment("goop-blocker-w3t3");
    cleanup = env.cleanup;
    ctx = createMockPluginContext({ testDir: env.testDir, db: env.db });
    toolCtx = createMockToolContext();
  });

  afterEach(() => cleanup());

  it("treats an empty-string action as omitted (never selects an action)", async () => {
    const tool = createGoopBlockerTool(ctx);

    const result = await tool.execute({ action: "" }, toolCtx);

    expect(result).toContain("Error in goop_blocker");
    expect(result).toContain("no action or items were provided");
    expect(result).not.toContain("Unknown action");
    expect(ctx.db.getBlockers("default")).toHaveLength(0);
  });

  it("distinguishes an explicitly empty items array from a no-args call", async () => {
    const tool = createGoopBlockerTool(ctx);

    const emptyBatch = await tool.execute({ items: [] }, toolCtx);
    expect(emptyBatch).toContain("Error in goop_blocker");
    expect(emptyBatch).toContain("items[] array is empty");
    expect(emptyBatch).not.toContain("no action or items were provided");

    const noArgs = await tool.execute({}, toolCtx);
    expect(noArgs).toContain("Error in goop_blocker");
    expect(noArgs).toContain("no action or items were provided");
    expect(noArgs).not.toContain("items[] array is empty");

    expect(ctx.db.getBlockers("default")).toHaveLength(0);
  });

  it("rejects a whitespace-only description with actionable guidance", async () => {
    const tool = createGoopBlockerTool(ctx);

    const result = await tool.execute({ action: "open", description: "   " }, toolCtx);

    expect(result).toContain("Error in goop_blocker");
    expect(result).toContain("whitespace-only");
    expect(result).toContain('{ action: "open", description: "what is blocked" }');
    expect(ctx.db.getBlockers("default")).toHaveLength(0);
  });

  it("fails the whole batch when an item has a whitespace-only description, rolling back rows and events", async () => {
    const tool = createGoopBlockerTool(ctx);

    const result = await tool.execute(
      {
        items: [
          { action: "open", description: "Valid first blocker" },
          { action: "open", description: "   " },
        ],
      },
      toolCtx,
    );

    expect(result).toContain("Batch blocker: 0/2 succeeded, 2 failed");
    expect(ctx.db.getBlockers("default")).toHaveLength(0);
    expect(ctx.db.getEvents("default")).toHaveLength(0);
  });

  it("keeps the existing description when resolve amends with an empty string", async () => {
    const tool = createGoopBlockerTool(ctx);
    await tool.execute({ action: "open", description: "Original text" }, toolCtx);
    const id = ctx.db.getBlockers("default", "open")[0].id;

    const result = await tool.execute(
      { action: "resolve", id, description: "", resolution: "done" },
      toolCtx,
    );

    expect(result).toContain(`Resolved blocker #${id}`);
    const row = ctx.db.getBlockers("default", "resolved")[0];
    expect(row.description).toBe("Original text");
  });

  it("rejects a whitespace-only description when amending on resolve", async () => {
    const tool = createGoopBlockerTool(ctx);
    await tool.execute({ action: "open", description: "Keep text" }, toolCtx);
    const id = ctx.db.getBlockers("default", "open")[0].id;

    const result = await tool.execute({ action: "resolve", id, description: "   " }, toolCtx);

    expect(result).toContain("Error in goop_blocker");
    expect(result).toContain("whitespace-only");
    expect(ctx.db.getBlockers("default", "open")).toHaveLength(1);
    expect(ctx.db.getBlockers("default", "resolved")).toHaveLength(0);
  });

  it("treats an empty-string workflow_id as omitted (uses the active workflow)", async () => {
    const tool = createGoopBlockerTool(ctx);

    const result = await tool.execute(
      { action: "open", description: "Active workflow blocker", workflow_id: "" },
      toolCtx,
    );

    expect(result).toContain("Opened blocker #");
    expect(result).toContain("'default'");
    const rows = ctx.db.getBlockers("default", "open");
    expect(rows).toHaveLength(1);
    expect(rows[0].description).toBe("Active workflow blocker");
    expect(ctx.db.getBlockers("", "open")).toHaveLength(0);
  });

  it("per-item empty workflow_id inherits the enclosing workflow in batch mode", async () => {
    const tool = createGoopBlockerTool(ctx);

    const result = await tool.execute(
      {
        workflow_id: "custom-wf",
        items: [{ action: "open", description: "Inherited scope", workflow_id: "" }],
      },
      toolCtx,
    );

    expect(result).toContain("Batch blocker: 1/1 succeeded");
    expect(ctx.db.getBlockers("custom-wf", "open")).toHaveLength(1);
    expect(ctx.db.getBlockers("", "open")).toHaveLength(0);
  });

  it("treats an empty-string severity as omitted (defaults to medium)", async () => {
    const tool = createGoopBlockerTool(ctx);

    const result = await tool.execute({ action: "open", description: "Default severity", severity: "" }, toolCtx);

    expect(result).toContain("Opened blocker #");
    const row = ctx.db.getBlockers("default", "open")[0];
    expect(row.severity).toBe("medium");
  });

  it("treats an empty-string status filter as omitted (lists every blocker)", async () => {
    const tool = createGoopBlockerTool(ctx);
    await tool.execute({ action: "open", description: "Visible" }, toolCtx);

    const result = await tool.execute({ action: "list", status: "" }, toolCtx);

    expect(result).toContain("# Blockers");
    expect(result).toContain("Visible");
    expect(result).not.toContain("No blockers found");
  });

  it("treats id 0 as omitted on resolve (required-id error, no lookup)", async () => {
    const tool = createGoopBlockerTool(ctx);

    const result = await tool.execute({ action: "resolve", id: 0 }, toolCtx);

    expect(result).toContain("Error in goop_blocker");
    expect(result).toContain('`id` is required for action "resolve"');
    expect(result).not.toContain("Blocker #0 not found");
    expect(ctx.db.getBlockers("default")).toHaveLength(0);
  });

  it("treats wave_id 0 as omitted on open (no wave attached, no warning)", async () => {
    // A completed wave 0 exists on purpose: if the tool consulted wave_id 0 it
    // would warn. Treating 0 as the numeric empty must skip the lookup entirely.
    ctx.db.upsertWave("default", { wave_number: 0, status: "completed" });
    const tool = createGoopBlockerTool(ctx);

    const result = await tool.execute({ action: "open", description: "No wave", wave_id: 0 }, toolCtx);

    expect(result).not.toContain("WARNING");
    expect(result).toContain("Opened blocker #");
    const row = ctx.db.getBlockers("default", "open")[0];
    expect(row.wave_id).toBeNull();
  });

  it("handles negative and unknown ids consistently (both error, neither mutates)", async () => {
    const tool = createGoopBlockerTool(ctx);

    const negative = await tool.execute({ action: "resolve", id: -1 }, toolCtx);
    const unknown = await tool.execute({ action: "resolve", id: 9999 }, toolCtx);

    expect(negative).toContain("Blocker #-1 not found for workflow 'default'");
    expect(unknown).toContain("Blocker #9999 not found for workflow 'default'");
    expect(ctx.db.getBlockers("default")).toHaveLength(0);
    expect(ctx.db.getEvents("default")).toHaveLength(0);
  });

  it("treats an empty-string resolution as omitted (stores null)", async () => {
    const tool = createGoopBlockerTool(ctx);
    await tool.execute({ action: "open", description: "To resolve empty" }, toolCtx);
    const id = ctx.db.getBlockers("default", "open")[0].id;

    const result = await tool.execute({ action: "resolve", id, resolution: "" }, toolCtx);

    expect(result).toContain(`Resolved blocker #${id}`);
    const row = ctx.db.getBlockers("default", "resolved")[0];
    expect(row.resolution).toBeNull();
  });

  it("rejects a whitespace-only resolution and leaves the blocker open", async () => {
    const tool = createGoopBlockerTool(ctx);
    await tool.execute({ action: "open", description: "Keep open" }, toolCtx);
    const id = ctx.db.getBlockers("default", "open")[0].id;

    const result = await tool.execute({ action: "resolve", id, resolution: "   " }, toolCtx);

    expect(result).toContain("Error in goop_blocker");
    expect(result).toContain("whitespace-only");
    expect(ctx.db.getBlockers("default", "open")).toHaveLength(1);
    expect(ctx.db.getBlockers("default", "resolved")).toHaveLength(0);
    expect(ctx.db.getEvents("default", "blocker_resolve")).toHaveLength(0);
  });

  it("still opens a blocker against a completed wave when wave_id is a real number", async () => {
    // Guard: the numeric-empty handling must not blunt the completed-wave
    // warning for genuine wave numbers.
    ctx.db.upsertWave("default", { wave_number: 2, status: "done" });
    const tool = createGoopBlockerTool(ctx);

    const result = await tool.execute(
      { action: "open", description: "Regression in wave 2", wave_id: 2 },
      toolCtx,
    );

    expect(result).toContain("WARNING: Wave 2 is already marked complete");
    expect(result).toContain("Opened blocker #");
  });
});
