import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import type { ToolResult } from "../../core/sdk-compat.js";
import {
  type PluginContext,
  createMockPluginContext,
  createMockToolContext,
  setupTestEnvironment,
} from "../../test-utils.js";
import { createGoopAcceptanceAuditTool } from "./index.js";

function parseResult(result: ToolResult | string): Record<string, unknown> {
  const text = typeof result === "string" ? result : result.output;
  const match = text.match(/<!--\n([\s\S]*?)\n-->/);
  if (!match) {
    throw new Error(`Could not parse result: ${text}`);
  }
  return JSON.parse(match[1]) as Record<string, unknown>;
}

describe("goop_acceptance_audit tool", () => {
  let ctx: PluginContext;
  let cleanup: () => void;

  beforeEach(() => {
    const env = setupTestEnvironment("acceptance-audit");
    cleanup = env.cleanup;
    ctx = createMockPluginContext({ testDir: env.testDir, db: env.db });
  });

  afterEach(() => cleanup());

  it("returns all three sections for the active workflow by default", async () => {
    const workflowId = ctx.stateManager.getState().activeWorkflowId;

    // Seed a blocker, verification, and wave so each section has content.
    ctx.db.upsertBlocker(workflowId, {
      description: "CI token expired",
      severity: "high",
      status: "open",
    });
    ctx.db.insertVerification(workflowId, {
      check_name: "typecheck",
      status: "passed",
      detail: "clean",
      wave_id: 1,
    });
    ctx.db.upsertWave(workflowId, {
      wave_number: 1,
      title: "Wave one",
      status: "in_progress",
    });

    const tool = createGoopAcceptanceAuditTool(ctx);
    const raw = await tool.execute({}, createMockToolContext());
    const parsed = parseResult(raw);

    expect(typeof parsed.blockers).toBe("string");
    expect(typeof parsed.verifications).toBe("string");
    expect(typeof parsed.waves).toBe("string");

    expect(parsed.blockers).toContain("CI token expired");
    expect(parsed.verifications).toContain("typecheck");
    expect(parsed.waves).toContain("Wave 1: Wave one");
  });

  it("honors wave_ids filter for verifications and waves", async () => {
    const workflowId = ctx.stateManager.getState().activeWorkflowId;

    ctx.db.insertVerification(workflowId, {
      check_name: "typecheck",
      status: "passed",
      wave_id: 1,
    });
    ctx.db.insertVerification(workflowId, {
      check_name: "test",
      status: "passed",
      wave_id: 2,
    });

    ctx.db.upsertWave(workflowId, { wave_number: 1, title: "Wave one", status: "done" });
    ctx.db.upsertWave(workflowId, { wave_number: 2, title: "Wave two", status: "in_progress" });

    const tool = createGoopAcceptanceAuditTool(ctx);
    const raw = await tool.execute({ wave_ids: [2] }, createMockToolContext());
    const parsed = parseResult(raw);

    expect(parsed.verifications).toContain("test");
    expect(parsed.verifications).not.toContain("typecheck");
    expect(parsed.waves).toContain("Wave 2: Wave two");
    expect(parsed.waves).not.toContain("Wave 1: Wave one");
  });

  it("toggles blocker scope with include_all_blockers", async () => {
    const workflowId = ctx.stateManager.getState().activeWorkflowId;

    ctx.db.upsertBlocker(workflowId, {
      description: "Open blocker",
      severity: "high",
      status: "open",
    });
    ctx.db.upsertBlocker(workflowId, {
      description: "Resolved blocker",
      severity: "low",
      status: "resolved",
      resolution: "fixed",
    });

    const tool = createGoopAcceptanceAuditTool(ctx);

    const openOnlyRaw = await tool.execute(
      { include_all_blockers: false },
      createMockToolContext(),
    );
    const openOnly = parseResult(openOnlyRaw);
    expect(openOnly.blockers).toContain("Open blocker");
    expect(openOnly.blockers).not.toContain("Resolved blocker");

    const allRaw = await tool.execute({ include_all_blockers: true }, createMockToolContext());
    const all = parseResult(allRaw);
    expect(all.blockers).toContain("Open blocker");
    expect(all.blockers).toContain("Resolved blocker");
  });

  it("returns empty workflow messages when no data exists", async () => {
    const tool = createGoopAcceptanceAuditTool(ctx);
    const raw = await tool.execute({}, createMockToolContext());
    const parsed = parseResult(raw);

    expect(parsed.blockers).toContain("No open blockers");
    expect(parsed.verifications).toContain("No verifications found");
    expect(parsed.waves).toContain("No waves found");
  });

  it("uses provided workflow_id when present", async () => {
    ctx.stateManager.createWorkflow("other-wf");
    ctx.db.upsertWave("other-wf", { wave_number: 1, title: "Other wave", status: "done" });

    const tool = createGoopAcceptanceAuditTool(ctx);
    const raw = await tool.execute({ workflow_id: "other-wf" }, createMockToolContext());
    const parsed = parseResult(raw);

    expect(parsed.waves).toContain("Wave 1: Other wave");
    expect(parsed.waves).not.toContain("No waves found");
  });
});
