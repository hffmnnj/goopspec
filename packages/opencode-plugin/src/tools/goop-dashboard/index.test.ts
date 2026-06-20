import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { PluginContext, ToolContext } from "../../test-utils.js";
import {
  createDefaultWorkflowState,
  createMockPluginContext,
  createMockToolContext,
  setupTestEnvironment,
} from "../../test-utils.js";
import { createGoopDashboardTool } from "./index.js";

function asString(value: unknown): string {
  if (typeof value === "string") return value;
  throw new Error("Expected tool result to be a string");
}

describe("goop_dashboard tool", () => {
  let ctx: PluginContext;
  let toolCtx: ToolContext;
  let cleanup: () => void;
  let testDir: string;

  beforeEach(() => {
    const env = setupTestEnvironment("goop-dashboard");
    cleanup = env.cleanup;
    testDir = env.testDir;
    ctx = createMockPluginContext({
      testDir: env.testDir,
      db: env.db,
      state: {
        activeWorkflowId: "active-wf",
        workflows: {
          "active-wf": createDefaultWorkflowState({
            phase: "execute",
            currentWave: 2,
            totalWaves: 5,
          }),
          "stale-wf": createDefaultWorkflowState({
            phase: "plan",
            currentWave: 0,
            totalWaves: 3,
          }),
        },
      },
    });
    toolCtx = createMockToolContext();
  });

  afterEach(() => cleanup());

  it("renders all workflows with state progress, blocker counts, active marker, and root DASHBOARD.md", async () => {
    ctx.db.upsertWave("active-wf", { wave_number: 1, status: "completed" });
    ctx.db.upsertWave("active-wf", { wave_number: 2, status: "in_progress" });
    ctx.db.upsertBlocker("active-wf", { description: "Need review", severity: "high" });
    ctx.db.upsertWave("stale-wf", { wave_number: 1, status: "pending" });
    ctx.db.upsertBlocker("stale-wf", {
      description: "Already handled",
      status: "resolved",
    });

    const tool = createGoopDashboardTool(ctx);
    const result = asString(await tool.execute({}, toolCtx));

    expect(result).toContain("# Workflow Dashboard");
    expect(result).toContain("| Workflow | Phase | Wave | Open Blockers | Last Activity |");
    expect(result).toContain("▶ active-wf");
    expect(result).toContain("| ▶ active-wf | execute | 2/5 | 1 |");
    expect(result).toContain("| stale-wf | plan | 0/3 | 0 |");
    expect(result).toContain("T");

    const dashboardPath = join(testDir, ".goopspec", "DASHBOARD.md");
    expect(existsSync(dashboardPath)).toBe(true);
    expect(readFileSync(dashboardPath, "utf-8")).toBe(result);
  });
});
