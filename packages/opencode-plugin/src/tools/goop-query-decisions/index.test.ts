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
});
