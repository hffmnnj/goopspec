import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import type { PluginContext, ToolContext } from "../../test-utils.js";
import {
  createMockPluginContext,
  createMockToolContext,
  setupTestEnvironment,
} from "../../test-utils.js";
import { createGoopRecordVerificationTool } from "./index.js";

describe("goop_record_verification tool", () => {
  let ctx: PluginContext;
  let toolCtx: ToolContext;
  let cleanup: () => void;

  beforeEach(() => {
    const env = setupTestEnvironment("goop-record-verification");
    cleanup = env.cleanup;
    ctx = createMockPluginContext({ testDir: env.testDir, db: env.db });
    toolCtx = createMockToolContext();
  });

  afterEach(() => cleanup());

  // -----------------------------------------------------------------------
  // Recording
  // -----------------------------------------------------------------------

  it("records typecheck pass and test fail results for a wave_id", async () => {
    const verificationTool = createGoopRecordVerificationTool(ctx);

    const passResult = await verificationTool.execute(
      { check_name: "typecheck", status: "pass", wave_id: 3, detail: "clean" },
      toolCtx,
    );
    const failResult = await verificationTool.execute(
      { check_name: "test", status: "fail", wave_id: 3, detail: "1 failed" },
      toolCtx,
    );

    expect(passResult).toContain("Recorded typecheck=pass");
    expect(failResult).toContain("Recorded test=fail");

    const verifications = ctx.db.getVerifications("default", 3);
    expect(verifications.length).toBe(2);
    expect(verifications.map((v) => v.check_name).sort()).toEqual(["test", "typecheck"]);
    const statuses = verifications.map((v) => String(v.status)).sort();
    expect(statuses).toEqual(["fail", "pass"]);
    expect(verifications.every((v) => v.wave_id === 3)).toBe(true);
  });

  // -----------------------------------------------------------------------
  // Event logging
  // -----------------------------------------------------------------------

  it("appends a verification_record event", async () => {
    const verificationTool = createGoopRecordVerificationTool(ctx);
    await verificationTool.execute(
      {
        check_name: "lint",
        status: "skip",
        wave_id: 4,
        detail: "not configured",
      },
      toolCtx,
    );

    const events = ctx.db.getEvents("default", "verification_record");
    expect(events.length).toBe(1);
    expect(events[0].event_type).toBe("verification_record");

    const payload = JSON.parse(events[0].payload);
    expect(payload.wave_id).toBe(4);
    expect(payload.check_name).toBe("lint");
    expect(payload.status).toBe("skip");
    expect(payload.timestamp).toBeGreaterThan(0);
  });

  // -----------------------------------------------------------------------
  // Batch items[]
  // -----------------------------------------------------------------------

  it("records multiple verifications in a single items batch", async () => {
    const verificationTool = createGoopRecordVerificationTool(ctx);

    const result = await verificationTool.execute(
      {
        items: [
          {
            check_name: "typecheck",
            status: "pass",
            wave_id: 2,
            detail: "clean",
          },
          {
            check_name: "test",
            status: "fail",
            wave_id: 2,
            detail: "1 failed",
          },
          { check_name: "lint", status: "skip" },
        ],
      },
      toolCtx,
    );

    expect(result).toContain("Batch record-verification: 3/3 succeeded");
    expect(result).toContain("[0] OK: Recorded typecheck=pass");
    expect(result).toContain("[1] OK: Recorded test=fail");
    expect(result).toContain("[2] OK: Recorded lint=skip");

    const verifications = ctx.db.getVerifications("default", 2);
    expect(verifications.length).toBe(2);
    expect(verifications.map((v) => v.check_name).sort()).toEqual(["test", "typecheck"]);

    const allVerifications = ctx.db.getVerifications("default");
    expect(allVerifications.some((v) => v.check_name === "lint" && v.wave_id === null)).toBe(true);
  });

  it("fails the whole batch when db transaction throws", async () => {
    const verificationTool = createGoopRecordVerificationTool(ctx);

    // Force the third item to fail by causing the DB to throw mid-batch via an oversized detail string.
    const oversizedDetail = "x".repeat(1_000_000_000);
    const result = await verificationTool.execute(
      {
        items: [
          { check_name: "typecheck", status: "pass", wave_id: 2 },
          { check_name: "test", status: "fail", wave_id: 2 },
          { check_name: "lint", status: "skip", detail: oversizedDetail },
        ],
      },
      toolCtx,
    );

    expect(result).toContain("Batch record-verification: 0/3 succeeded, 3 failed");
    expect(ctx.db.getVerifications("default").length).toBe(0);
  });
});
