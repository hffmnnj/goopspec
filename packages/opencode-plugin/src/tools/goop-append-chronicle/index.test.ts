import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

import type { PluginContext, ToolContext } from "../../test-utils.js";
import {
  createMockPluginContext,
  createMockToolContext,
  setupTestEnvironment,
} from "../../test-utils.js";
import { createGoopAppendChronicleTool } from "./index.js";

describe("goop_append_chronicle tool", () => {
  let ctx: PluginContext;
  let toolCtx: ToolContext;
  let cleanup: () => void;
  let testDir: string;

  beforeEach(() => {
    const env = setupTestEnvironment("goop-append-chronicle");
    cleanup = env.cleanup;
    testDir = env.testDir;
    ctx = createMockPluginContext({ testDir: env.testDir, db: env.db });
    toolCtx = createMockToolContext();
  });

  afterEach(() => cleanup());

  // -----------------------------------------------------------------------
  // 1. ISO timestamp heading format
  // -----------------------------------------------------------------------

  it("appends entry with ISO timestamp heading format", async () => {
    const tool = createGoopAppendChronicleTool(ctx);
    const before = new Date();
    await tool.execute({ entry: "Wave 1 complete." }, toolCtx);
    const after = new Date();

    const doc = ctx.db.getDocument("default", "chronicle");
    expect(doc).not.toBeNull();

    const content = doc!.content;

    // Must contain a ### heading
    expect(content).toMatch(/^### /);

    // Extract the ISO timestamp from the heading
    const match = content.match(/^### ([^\n]+)/);
    expect(match).not.toBeNull();
    const ts = new Date(match![1]);
    expect(ts.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
    expect(ts.getTime()).toBeLessThanOrEqual(after.getTime() + 1000);

    // Entry text follows the heading
    expect(content).toContain("Wave 1 complete.");
  });

  // -----------------------------------------------------------------------
  // 2. chronicle_events row insertion
  // -----------------------------------------------------------------------

  it("inserts a row into chronicle_events table", async () => {
    const tool = createGoopAppendChronicleTool(ctx);
    await tool.execute({ entry: "Task 2.2 done." }, toolCtx);

    const events = ctx.db.getChronicleEvents("default");
    expect(events.length).toBe(1);
    expect(events[0].entry).toBe("Task 2.2 done.");
    expect(events[0].workflow_id).toBe("default");
  });

  // -----------------------------------------------------------------------
  // 3. Return value — correct char count
  // -----------------------------------------------------------------------

  it("returns [OK] Chronicle entry appended (N chars) with correct char count", async () => {
    const tool = createGoopAppendChronicleTool(ctx);
    const entry = "Short entry.";
    const result = await tool.execute({ entry }, toolCtx);

    expect(result).toBe(`[OK] Chronicle entry appended (${entry.length} chars)`);
  });

  // -----------------------------------------------------------------------
  // 4. Uses active workflow when workflow_id is omitted
  // -----------------------------------------------------------------------

  it("uses the active workflow when workflow_id arg is omitted", async () => {
    const tool = createGoopAppendChronicleTool(ctx);
    // Active workflow is "default" (set by createMockPluginContext)
    await tool.execute({ entry: "Active workflow entry." }, toolCtx);

    const doc = ctx.db.getDocument("default", "chronicle");
    expect(doc).not.toBeNull();
    expect(doc!.content).toContain("Active workflow entry.");

    // Should NOT have written to any other workflow
    const otherDoc = ctx.db.getDocument("other-wf", "chronicle");
    expect(otherDoc).toBeNull();
  });

  // -----------------------------------------------------------------------
  // 5. Uses provided workflow_id when specified
  // -----------------------------------------------------------------------

  it("uses the provided workflow_id when specified", async () => {
    const tool = createGoopAppendChronicleTool(ctx);
    await tool.execute({ entry: "Custom workflow entry.", workflow_id: "custom-wf" }, toolCtx);

    // Document written to custom-wf
    const customDoc = ctx.db.getDocument("custom-wf", "chronicle");
    expect(customDoc).not.toBeNull();
    expect(customDoc!.content).toContain("Custom workflow entry.");

    // chronicle_events row belongs to custom-wf
    const events = ctx.db.getChronicleEvents("custom-wf");
    expect(events.length).toBe(1);
    expect(events[0].workflow_id).toBe("custom-wf");

    // Active workflow (default) should be untouched
    const defaultDoc = ctx.db.getDocument("default", "chronicle");
    expect(defaultDoc).toBeNull();
  });

  // -----------------------------------------------------------------------
  // 6. Sidecar file created/updated at correct path
  // -----------------------------------------------------------------------

  it("creates/updates CHRONICLE.md sidecar in the correct path", async () => {
    const tool = createGoopAppendChronicleTool(ctx);
    await tool.execute({ entry: "Sidecar test entry." }, toolCtx);

    const sidecarPath = join(testDir, ".goopspec", "default", "CHRONICLE.md");
    expect(existsSync(sidecarPath)).toBe(true);

    const content = await Bun.file(sidecarPath).text();
    expect(content).toContain("Sidecar test entry.");
    expect(content).toMatch(/^### /);
  });
});
