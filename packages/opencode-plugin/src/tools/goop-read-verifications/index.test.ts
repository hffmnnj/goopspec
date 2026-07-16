import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import type { PluginContext, ToolContext } from "../../test-utils.js";
import {
  createMockPluginContext,
  createMockToolContext,
  setupTestEnvironment,
} from "../../test-utils.js";
import { createGoopReadVerificationsTool } from "./index.js";

describe("goop_read_verifications tool", () => {
  let ctx: PluginContext;
  let toolCtx: ToolContext;
  let cleanup: () => void;

  beforeEach(() => {
    const env = setupTestEnvironment("goop-read-verifications");
    cleanup = env.cleanup;
    ctx = createMockPluginContext({ testDir: env.testDir, db: env.db });
    toolCtx = createMockToolContext();
  });

  afterEach(() => cleanup());

  // -----------------------------------------------------------------------
  // Summary output
  // -----------------------------------------------------------------------

  it("reads back mixed wave results and reports failing summary", async () => {
    ctx.db.insertVerification("default", {
      wave_id: 3,
      check_name: "typecheck",
      status: "pass",
      detail: "clean",
    });
    ctx.db.insertVerification("default", {
      wave_id: 3,
      check_name: "test",
      status: "fail",
      detail: "1 failed",
    });

    const readTool = createGoopReadVerificationsTool(ctx);
    const result = await readTool.execute({ wave_id: 3 }, toolCtx);

    expect(result).toContain("Status: 1 failing");
    expect(result).toContain("### Wave 3");
    expect(result).toContain("typecheck: pass");
    expect(result).toContain("test: fail");
    expect(result).toContain("1 failed");
    expect(result).toContain("wave_id=3");
  });

  it("reports all green when a wave has only passing checks", async () => {
    ctx.db.insertVerification("default", {
      wave_id: 4,
      check_name: "typecheck",
      status: "pass",
    });
    ctx.db.insertVerification("default", {
      wave_id: 4,
      check_name: "test",
      status: "pass",
      detail: "all passed",
    });

    const readTool = createGoopReadVerificationsTool(ctx);
    const result = await readTool.execute({ wave_id: 4 }, toolCtx);

    expect(result).toContain("Status: all green");
    expect(result).toContain("typecheck: pass");
    expect(result).toContain("test: pass");
    expect(result).not.toContain("failing");
  });

  // -----------------------------------------------------------------------
  // Empty state
  // -----------------------------------------------------------------------

  it("returns a clear not-found message when empty", async () => {
    const readTool = createGoopReadVerificationsTool(ctx);
    const result = await readTool.execute({ wave_id: 99 }, toolCtx);

    expect(result).toBe("No verifications found for workflow 'default'.");
  });

  // -----------------------------------------------------------------------
  // Batch mode
  // -----------------------------------------------------------------------

  it("reads verifications across multiple wave_ids when batch arg is provided", async () => {
    ctx.db.insertVerification("default", {
      wave_id: 2,
      check_name: "typecheck",
      status: "pass",
    });
    ctx.db.insertVerification("default", {
      wave_id: 3,
      check_name: "test",
      status: "fail",
    });
    ctx.db.insertVerification("default", {
      wave_id: 5,
      check_name: "lint",
      status: "pass",
    });

    const readTool = createGoopReadVerificationsTool(ctx);
    const result = await readTool.execute({ wave_ids: [2, 5] }, toolCtx);

    expect(result).toContain("typecheck: pass");
    expect(result).toContain("Wave 2");
    expect(result).toContain("lint: pass");
    expect(result).toContain("Wave 5");
    expect(result).not.toContain("test: fail");
    expect(result).not.toContain("Wave 3");
  });

  it("falls back to all verifications when wave_ids is empty", async () => {
    ctx.db.insertVerification("default", {
      wave_id: 2,
      check_name: "typecheck",
      status: "pass",
    });

    const readTool = createGoopReadVerificationsTool(ctx);
    const result = await readTool.execute({ wave_ids: [] }, toolCtx);

    expect(result).toContain("typecheck: pass");
    expect(result).toContain("Wave 2");
  });
});
