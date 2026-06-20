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
      { action: "open", description: "Waiting on migration review", severity: "high", wave_id: 3 },
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
      { action: "resolve", id: openRows[0].id, resolution: "Reviewer approved migration" },
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
      { action: "open", description: "Waiting on migration review", severity: "high" },
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
      { action: "open", description: "Waiting on migration review", severity: "high" },
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
});
