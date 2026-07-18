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

    const content = doc?.content;
    expect(content).toBeDefined();

    // Must contain a ### heading
    expect(content).toMatch(/^### /);

    // Extract the ISO timestamp from the heading
    const match = content?.match(/^### ([^\n]+)/);
    expect(match).not.toBeNull();
    const timestamp = match?.[1];
    expect(timestamp).toBeDefined();
    const ts = new Date(timestamp ?? "");
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
    expect(doc?.content).toContain("Active workflow entry.");

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
    expect(customDoc?.content).toContain("Custom workflow entry.");

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

  // -----------------------------------------------------------------------
  // 7. Batch entries[]
  // -----------------------------------------------------------------------

  it("appends multiple chronicle entries in a single entries batch", async () => {
    const tool = createGoopAppendChronicleTool(ctx);

    const result = await tool.execute(
      { entries: ["First batch entry.", "Second batch entry."] },
      toolCtx,
    );

    expect(result).toContain("Batch append-chronicle: 2/2 succeeded");
    expect(result).toContain("[0] OK: appended (18 chars)");
    expect(result).toContain("[1] OK: appended (19 chars)");

    const doc = ctx.db.getDocument("default", "chronicle");
    expect(doc?.content).toContain("First batch entry.");
    expect(doc?.content).toContain("Second batch entry.");

    const events = ctx.db.getChronicleEvents("default");
    expect(events.map((e) => e.entry).sort()).toEqual([
      "First batch entry.",
      "Second batch entry.",
    ]);
  });

  it("fails the whole batch when a chronicle entry is too large", async () => {
    const tool = createGoopAppendChronicleTool(ctx);

    const hugeEntry = "x".repeat(1_000_000_000);
    const result = await tool.execute(
      { entries: ["First batch entry.", hugeEntry, "Third batch entry."] },
      toolCtx,
    );

    expect(result).toContain("Batch append-chronicle: 0/3 succeeded, 3 failed");
    expect(ctx.db.getChronicleEvents("default").length).toBe(0);
    expect(ctx.db.getDocument("default", "chronicle")).toBeNull();
  });

  // -----------------------------------------------------------------------
  // 8. Combined chronicle + ADL + memory (MH4)
  // -----------------------------------------------------------------------

  it("old-shape call with only entry is unchanged", async () => {
    const tool = createGoopAppendChronicleTool(ctx);
    const entry = "Old-shape entry.";
    const result = await tool.execute({ entry }, toolCtx);

    expect(result).toBe(`[OK] Chronicle entry appended (${entry.length} chars)`);
    expect(ctx.db.getChronicleEvents("default").length).toBe(1);
  });

  it("alsoLogAdl logs an ADL entry and dual-writes to decisions", async () => {
    const tool = createGoopAppendChronicleTool(ctx);
    const result = await tool.execute(
      {
        entry: "Chronicle with ADL.",
        alsoLogAdl: {
          type: "decision",
          rule: 4,
          description: "Decided to combine tools.",
          entry_action: "Extend goop_append_chronicle",
          files: ["src/tools/goop-append-chronicle/index.ts"],
        },
      },
      toolCtx,
    );

    expect(result).toContain("[OK] Chronicle entry appended");
    expect(result).toContain("[OK] ADL entry logged.");

    const adl = ctx.stateManager.getADL();
    expect(adl).toContain("Decided to combine tools.");
    expect(adl).toContain("Extend goop_append_chronicle");

    const decisions = ctx.db.getDecisions({ workflowId: "default", type: "decision" });
    expect(decisions.length).toBe(1);
    expect(decisions[0].description).toBe("Decided to combine tools.");
    expect(decisions[0].rule).toBe(4);
  });

  it("alsoSaveMemory saves a memory entry", async () => {
    const tool = createGoopAppendChronicleTool(ctx);
    const result = await tool.execute(
      {
        entry: "Chronicle with memory.",
        alsoSaveMemory: {
          title: "Combinator insight",
          content: "One call can append chronicle and save memory.",
          type: "observation",
          importance: 7,
          concepts: ["combinator", "chronicle"],
        },
      },
      toolCtx,
    );

    expect(result).toContain("[OK] Chronicle entry appended");
    expect(result).toContain("[OK] Memory saved.");

    const memories = await ctx.memory.search({ query: "combinator" });
    expect(memories.length).toBe(1);
    expect(memories[0].memory.title).toBe("Combinator insight");
    expect(memories[0].memory.importance).toBe(7);
    expect(memories[0].memory.concepts).toEqual(["combinator", "chronicle"]);
  });

  it("combined call appends chronicle, logs ADL, and saves memory", async () => {
    const tool = createGoopAppendChronicleTool(ctx);
    const result = await tool.execute(
      {
        entry: "Combined event log.",
        alsoLogAdl: {
          type: "observation",
          description: "All three stores written.",
          entry_action: "Use goop_append_chronicle combinator",
        },
        alsoSaveMemory: {
          title: "Three-store combinator",
          content: "Chronicle, ADL, and memory written in one call.",
          type: "note",
          importance: 6,
        },
      },
      toolCtx,
    );

    expect(result).toContain("[OK] Chronicle entry appended");
    expect(result).toContain("[OK] ADL entry logged.");
    expect(result).toContain("[OK] Memory saved.");

    const doc = ctx.db.getDocument("default", "chronicle");
    expect(doc?.content).toContain("Combined event log.");

    expect(ctx.stateManager.getADL()).toContain("All three stores written.");

    const memories = await ctx.memory.search({ query: "Three-store" });
    expect(memories.length).toBe(1);
    expect(memories[0].memory.type).toBe("note");
  });

  it("rejects auxiliary payloads with entries batch", async () => {
    const tool = createGoopAppendChronicleTool(ctx);
    const result = await tool.execute(
      {
        entries: ["Batch entry."],
        alsoSaveMemory: { title: "Not allowed", content: "x" },
      },
      toolCtx,
    );

    expect(result).toContain("Error");
    expect(result).toContain("cannot be used with entries batch");
  });

  it("reports partial failure when a sub-write throws", async () => {
    const brokenCtx = createMockPluginContext({ testDir, db: ctx.db });
    brokenCtx.memory.save = async () => {
      throw new Error("Memory store offline");
    };

    const tool = createGoopAppendChronicleTool(brokenCtx);
    const result = await tool.execute(
      {
        entry: "Chronicle succeeded; memory failed.",
        alsoSaveMemory: {
          title: "Doomed memory",
          content: "This save will fail.",
        },
      },
      toolCtx,
    );

    expect(result).toContain("[OK] Chronicle entry appended");
    expect(result).toContain("[FAIL] Memory: Memory store offline");
    expect(ctx.db.getChronicleEvents("default").length).toBe(1);
    expect(ctx.db.getDocument("default", "chronicle")).not.toBeNull();
  });

  it("reports ADL failure when appendADL throws", async () => {
    const brokenCtx = createMockPluginContext({ testDir, db: ctx.db });
    brokenCtx.stateManager.appendADL = () => {
      throw new Error("ADL disk full");
    };

    const tool = createGoopAppendChronicleTool(brokenCtx);
    const result = await tool.execute(
      {
        entry: "Chronicle succeeded; ADL failed.",
        alsoLogAdl: {
          type: "observation",
          description: "ADL will fail.",
          entry_action: "Test partial failure",
        },
      },
      toolCtx,
    );

    expect(result).toContain("[OK] Chronicle entry appended");
    expect(result).toContain("[FAIL] ADL: ADL disk full");
  });

  it("rejects out-of-range alsoSaveMemory importance without crashing", async () => {
    const tool = createGoopAppendChronicleTool(ctx);

    for (const badImportance of [0, 11, -1, Number.NaN]) {
      const result = await tool.execute(
        {
          entry: "Entry with bad importance.",
          alsoSaveMemory: {
            title: "Bad importance memory",
            content: "This importance value is invalid.",
            importance: badImportance,
          },
        },
        toolCtx,
      );

      expect(result).toContain("[OK] Chronicle entry appended");
      expect(result).toContain("[FAIL] Memory: Memory importance must be between 1 and 10.");
    }

    const memories = await ctx.memory.search({ query: "Bad importance memory" });
    expect(memories.length).toBe(0);
  });
});
