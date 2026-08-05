import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import type { PluginContext, ToolContext } from "../../test-utils.js";
import {
  createMockPluginContext,
  createMockToolContext,
  setupTestEnvironment,
} from "../../test-utils.js";
import { createGoopAdlTool } from "../goop-adl/index.js";
import { createGoopQueryDecisionsTool } from "./index.js";

describe("goop_query_decisions tool", () => {
  let ctx: PluginContext;
  let toolCtx: ToolContext;
  let cleanup: () => void;

  beforeEach(() => {
    const env = setupTestEnvironment("goop-query-decisions");
    cleanup = env.cleanup;
    ctx = createMockPluginContext({ testDir: env.testDir, db: env.db });
    toolCtx = createMockToolContext();
  });

  afterEach(() => cleanup());

  async function insertTwoAdlEntries(): Promise<void> {
    const adlTool = createGoopAdlTool(ctx);

    await adlTool.execute(
      {
        action: "append",
        type: "decision",
        description: "Stop for architectural choice",
        entry_action: "Presented trade-off options before proceeding",
        rule: 4,
        files: ["src/features/db/index.ts"],
      },
      toolCtx,
    );

    await adlTool.execute(
      {
        action: "append",
        type: "observation",
        description: "Existing tests remain the compatibility gate",
        entry_action: "Kept ADL return values unchanged",
        files: ["src/tools/goop-adl/index.test.ts"],
      },
      toolCtx,
    );
  }

  it("filters ADL dual-written decisions by rule", async () => {
    await insertTwoAdlEntries();

    const queryTool = createGoopQueryDecisionsTool(ctx);
    const result = (await queryTool.execute({ rule: 4 }, toolCtx)) as string;

    expect(result).toContain("# Decisions");
    expect(result).toContain("Rule: 4");
    expect(result).toContain("Type: decision");
    expect(result).toContain("Stop for architectural choice");
    expect(result).not.toContain("Existing tests remain the compatibility gate");
    expect(result.match(/^- \*\*/gm)?.length).toBe(1);
  });

  it("returns all ADL dual-written decisions when no filter is provided", async () => {
    await insertTwoAdlEntries();

    const queryTool = createGoopQueryDecisionsTool(ctx);
    const result = (await queryTool.execute({}, toolCtx)) as string;

    expect(result).toContain("Stop for architectural choice");
    expect(result).toContain("Existing tests remain the compatibility gate");
    expect(result.match(/^- \*\*/gm)?.length).toBe(2);
  });

  // -----------------------------------------------------------------------
  // Batch mode
  // -----------------------------------------------------------------------

  async function insertDecisionBatch(): Promise<void> {
    const adlTool = createGoopAdlTool(ctx);

    await adlTool.execute(
      {
        action: "append",
        type: "decision",
        description: "Rule 2 decision",
        entry_action: "Added safeguard",
        rule: 2,
      },
      toolCtx,
    );

    await adlTool.execute(
      {
        action: "append",
        type: "decision",
        description: "Rule 3 decision",
        entry_action: "Unblocked issue",
        rule: 3,
      },
      toolCtx,
    );

    await adlTool.execute(
      {
        action: "append",
        type: "observation",
        description: "Observation entry",
        entry_action: "Noted behavior",
      },
      toolCtx,
    );
  }

  it("filters decisions by array of rules", async () => {
    await insertDecisionBatch();

    const queryTool = createGoopQueryDecisionsTool(ctx);
    const result = (await queryTool.execute({ rules: [2, 3] }, toolCtx)) as string;

    expect(result).toContain("Rule 2 decision");
    expect(result).toContain("Rule 3 decision");
    expect(result).not.toContain("Observation entry");
    expect(result.match(/^- \*\*/gm)?.length).toBe(2);
  });

  it("filters decisions by array of types", async () => {
    await insertDecisionBatch();

    const queryTool = createGoopQueryDecisionsTool(ctx);
    const result = (await queryTool.execute({ types: ["decision"] }, toolCtx)) as string;

    expect(result).toContain("Rule 2 decision");
    expect(result).toContain("Rule 3 decision");
    expect(result).not.toContain("Observation entry");
  });

  // ---------------------------------------------------------------------------
  // Scoping contract: omitting workflow_id searches across ALL workflows.
  // getDecisions adds no workflow_id clause when the field is absent, so the
  // default is cross-workflow — NOT the active workflow. This is the easy
  // mistake the description redirects callers away from.
  // ---------------------------------------------------------------------------

  it("omitting workflow_id searches across all workflows, not just the active one", async () => {
    const adlTool = createGoopAdlTool(ctx);
    await adlTool.execute(
      {
        action: "append",
        type: "decision",
        description: "Decision in default workflow",
        entry_action: "recorded",
      },
      toolCtx,
    );

    // Seed a decision in a second workflow directly via the DB (goop_adl has
    // no workflow_id argument and always writes to the active workflow).
    ctx.db.insertDecision("second-wf", {
      type: "decision",
      description: "Decision in second workflow",
      action: "recorded",
    });

    const queryTool = createGoopQueryDecisionsTool(ctx);

    // No workflow_id: both workflows' decisions appear (cross-workflow default).
    const crossResult = (await queryTool.execute({}, toolCtx)) as string;
    expect(crossResult).toContain("Decision in default workflow");
    expect(crossResult).toContain("Decision in second workflow");

    // Scoping to the active workflow hides the other workflow's decisions.
    const scopedResult = (await queryTool.execute({ workflow_id: "default" }, toolCtx)) as string;
    expect(scopedResult).toContain("Decision in default workflow");
    expect(scopedResult).not.toContain("Decision in second workflow");
  });

  it("rules[] takes precedence over a singular rule, and types[] over a singular type", async () => {
    const adlTool = createGoopAdlTool(ctx);
    await adlTool.execute(
      { action: "append", type: "decision", description: "rule 2", entry_action: "a", rule: 2 },
      toolCtx,
    );
    await adlTool.execute(
      { action: "append", type: "observation", description: "rule 3 obs", entry_action: "b", rule: 3 },
      toolCtx,
    );

    const queryTool = createGoopQueryDecisionsTool(ctx);

    // rule points at 2, but rules:[3] wins and only rule-3 rows return.
    const rulesResult = (await queryTool.execute({ rule: 2, rules: [3] }, toolCtx)) as string;
    expect(rulesResult).toContain("rule 3 obs");
    expect(rulesResult).not.toContain("Rule: 2");

    // type points at decision, but types:["observation"] wins.
    const typesResult = (await queryTool.execute(
      { type: "decision", types: ["observation"] },
      toolCtx,
    )) as string;
    expect(typesResult).toContain("rule 3 obs");
    expect(typesResult).not.toContain("Rule: 2");
  });
});
