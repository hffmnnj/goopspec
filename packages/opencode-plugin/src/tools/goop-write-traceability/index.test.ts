import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import type { PluginContext, ToolContext } from "../../test-utils.js";
import {
  createMockPluginContext,
  createMockToolContext,
  setupTestEnvironment,
} from "../../test-utils.js";
import { createGoopWriteTraceabilityTool } from "./index.js";

describe("goop_write_traceability tool", () => {
  let ctx: PluginContext;
  let toolCtx: ToolContext;
  let cleanup: () => void;

  beforeEach(() => {
    const env = setupTestEnvironment("goop-write-traceability");
    cleanup = env.cleanup;
    ctx = createMockPluginContext({ testDir: env.testDir, db: env.db });
    toolCtx = createMockToolContext();
  });

  afterEach(() => cleanup());

  // -----------------------------------------------------------------------
  // Writes
  // -----------------------------------------------------------------------

  it("writes traceability rows and updates matching rows without duplicating", async () => {
    const traceabilityTool = createGoopWriteTraceabilityTool(ctx);

    await traceabilityTool.execute(
      { requirement_key: "MH14", wave_number: 3, task_index: 3, status: "pending" },
      toolCtx,
    );
    await traceabilityTool.execute(
      { requirement_key: "MH15", wave_number: 3, task_index: 3, status: "pending" },
      toolCtx,
    );
    await traceabilityTool.execute(
      { requirement_key: "MH11", wave_number: 1, task_index: 2, status: "done" },
      toolCtx,
    );

    const initialRows = ctx.db.getTraceability("default");
    expect(initialRows.length).toBe(3);
    expect(initialRows.map((row) => row.requirement_key).sort()).toEqual(["MH11", "MH14", "MH15"]);
    expect(initialRows.find((row) => row.requirement_key === "MH14")?.wave_number).toBe(3);
    expect(initialRows.find((row) => row.requirement_key === "MH14")?.task_index).toBe(3);

    const updateResult = await traceabilityTool.execute(
      { requirement_key: "MH14", wave_number: 3, task_index: 3, status: "done" },
      toolCtx,
    );
    expect(updateResult).toContain("Wrote traceability for MH14");

    const updatedRows = ctx.db.getTraceability("default");
    expect(updatedRows.length).toBe(3);
    expect(updatedRows.find((row) => row.requirement_key === "MH14")?.status).toBe("done");
  });

  // -----------------------------------------------------------------------
  // Event logging
  // -----------------------------------------------------------------------

  it("appends a traceability_write event", async () => {
    const traceabilityTool = createGoopWriteTraceabilityTool(ctx);
    await traceabilityTool.execute(
      { requirement_key: "MH14", wave_number: 3, task_index: 3, status: "done" },
      toolCtx,
    );

    const events = ctx.db.getEvents("default", "traceability_write");
    expect(events.length).toBe(1);
    expect(events[0].event_type).toBe("traceability_write");

    const payload = JSON.parse(events[0].payload);
    expect(payload.requirement_key).toBe("MH14");
    expect(payload.wave_number).toBe(3);
    expect(payload.task_index).toBe(3);
    expect(payload.status).toBe("done");
    expect(payload.timestamp).toBeGreaterThan(0);
  });
});
