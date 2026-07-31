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

  it("empty entries array falls through to single-entry path", async () => {
    const tool = createGoopAppendChronicleTool(ctx);
    const result = await tool.execute({ entry: "Fallback entry.", entries: [] }, toolCtx);

    expect(result).toBe("[OK] Chronicle entry appended (15 chars)");
    expect(ctx.db.getChronicleEvents("default").length).toBe(1);
    expect(ctx.db.getChronicleEvents("default")[0].entry).toBe("Fallback entry.");
  });

  it("returns error when entries array is empty and no entry is provided", async () => {
    const tool = createGoopAppendChronicleTool(ctx);
    const result = await tool.execute({ entries: [] }, toolCtx);

    expect(result).toContain("Error in goop_append_chronicle");
    expect(result).toContain("entries[] array is empty");
    expect(result).not.toContain("succeeded");
  });

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

  it("applies alsoLogAdl alongside entries batch and persists one ADL entry", async () => {
    const tool = createGoopAppendChronicleTool(ctx);
    const result = await tool.execute(
      {
        entries: ["Entry A.", "Entry B.", "Entry C."],
        alsoLogAdl: {
          type: "decision",
          description: "One ADL entry for the whole batch.",
          entry_action: "Batch aux test",
        },
      },
      toolCtx,
    );

    expect(result).toContain("Batch append-chronicle: 3/3 succeeded");
    expect(result).toContain("[OK] ADL entry logged.");

    // All three chronicle entries persisted.
    expect(ctx.db.getChronicleEvents("default").length).toBe(3);

    // ADL applied exactly once — not once per entry.
    const adl = ctx.stateManager.getADL();
    const occurrences = (adl.match(/One ADL entry for the whole batch/g) ?? []).length;
    expect(occurrences).toBe(1);

    // Decisions table also has exactly one row.
    const decisions = ctx.db.getDecisions({ workflowId: "default", type: "decision" });
    expect(decisions.length).toBe(1);
    expect(decisions[0].description).toBe("One ADL entry for the whole batch.");
  });

  it("applies alsoSaveMemory alongside entries batch and persists one memory", async () => {
    const tool = createGoopAppendChronicleTool(ctx);
    const result = await tool.execute(
      {
        entries: ["Batch entry one.", "Batch entry two."],
        alsoSaveMemory: { title: "Batch memory", content: "Saved with batch." },
      },
      toolCtx,
    );

    expect(result).toContain("Batch append-chronicle: 2/2 succeeded");
    expect(result).toContain("[OK] Memory saved.");

    // Both chronicle entries persisted.
    expect(ctx.db.getChronicleEvents("default").length).toBe(2);

    // Memory persisted exactly once for the whole batch.
    const memories = await ctx.memory.search({ query: "Batch memory" });
    expect(memories.length).toBe(1);
    expect(memories[0].memory.title).toBe("Batch memory");
  });

  it("applies both alsoLogAdl and alsoSaveMemory alongside entries batch", async () => {
    const tool = createGoopAppendChronicleTool(ctx);
    const result = await tool.execute(
      {
        entries: ["Batch with both."],
        alsoLogAdl: {
          type: "observation",
          description: "Both aux payloads with batch.",
          entry_action: "Batch both test",
        },
        alsoSaveMemory: {
          title: "Batch both memory",
          content: "ADL and memory with batch.",
        },
      },
      toolCtx,
    );

    expect(result).toContain("Batch append-chronicle: 1/1 succeeded");
    expect(result).toContain("[OK] ADL entry logged.");
    expect(result).toContain("[OK] Memory saved.");

    // Chronicle persisted.
    expect(ctx.db.getChronicleEvents("default").length).toBe(1);

    // ADL persisted.
    expect(ctx.stateManager.getADL()).toContain("Both aux payloads with batch.");
    const decisions = ctx.db.getDecisions({ workflowId: "default", type: "observation" });
    expect(decisions.length).toBe(1);

    // Memory persisted.
    const memories = await ctx.memory.search({ query: "Batch both" });
    expect(memories.length).toBe(1);
    expect(memories[0].memory.title).toBe("Batch both memory");
  });

  it("does not apply aux payloads when the entries batch rolls back", async () => {
    const tool = createGoopAppendChronicleTool(ctx);
    const hugeEntry = "x".repeat(1_000_000_000);
    const result = await tool.execute(
      {
        entries: ["OK entry.", hugeEntry],
        alsoLogAdl: {
          type: "decision",
          description: "Should not be logged.",
          entry_action: "Rollback test",
        },
        alsoSaveMemory: { title: "Should not be saved", content: "x" },
      },
      toolCtx,
    );

    // Batch failed and rolled back.
    expect(result).toContain("Batch append-chronicle: 0/2 succeeded, 2 failed");
    expect(result).not.toContain("[OK] ADL entry logged.");
    expect(result).not.toContain("[OK] Memory saved.");

    // No chronicle, no ADL, no memory persisted — no orphaned aux writes.
    expect(ctx.db.getChronicleEvents("default").length).toBe(0);
    expect(ctx.stateManager.getADL()).not.toContain("Should not be logged.");
    const memories = await ctx.memory.search({ query: "Should not be saved" });
    expect(memories.length).toBe(0);
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

  // -----------------------------------------------------------------------
  // 9. Empty aux object treated as omitted (not a failure)
  // -----------------------------------------------------------------------

  it("treats an empty alsoLogAdl object as omitted, not a failure", async () => {
    const tool = createGoopAppendChronicleTool(ctx);
    const entry = "Chronicle with empty ADL.";
    // An empty object bypasses schema validation at runtime; cast to test it.
    const result = await tool.execute({ entry, alsoLogAdl: {} as never }, toolCtx);

    // Chronicle succeeded; no ADL line at all (omitted, not failed).
    expect(result).toBe(`[OK] Chronicle entry appended (${entry.length} chars)`);
    expect(result).not.toContain("ADL");

    // Chronicle persisted; no ADL entry persisted.
    expect(ctx.db.getChronicleEvents("default").length).toBe(1);
    expect(ctx.db.getDecisions({ workflowId: "default" }).length).toBe(0);
  });

  it("treats an empty alsoSaveMemory object as omitted, not a failure", async () => {
    const tool = createGoopAppendChronicleTool(ctx);
    const entry = "Chronicle with empty memory.";
    const result = await tool.execute({ entry, alsoSaveMemory: {} as never }, toolCtx);

    expect(result).toBe(`[OK] Chronicle entry appended (${entry.length} chars)`);
    expect(result).not.toContain("Memory");

    expect(ctx.db.getChronicleEvents("default").length).toBe(1);
    const memories = await ctx.memory.search({ query: "empty memory" });
    expect(memories.length).toBe(0);
  });

  it("treats an all-fields-absent alsoLogAdl object as omitted", async () => {
    const tool = createGoopAppendChronicleTool(ctx);
    const entry = "Chronicle with nullish ADL fields.";
    const result = await tool.execute(
      {
        entry,
        alsoLogAdl: {
          type: undefined,
          description: undefined,
          entry_action: undefined,
          rule: undefined,
          files: [],
        } as never,
      },
      toolCtx,
    );

    expect(result).toBe(`[OK] Chronicle entry appended (${entry.length} chars)`);
    expect(result).not.toContain("ADL");
    expect(ctx.db.getDecisions({ workflowId: "default" }).length).toBe(0);
  });

  it("treats empty aux payloads as omitted alongside entries batch", async () => {
    const tool = createGoopAppendChronicleTool(ctx);
    const result = await tool.execute(
      {
        entries: ["Batch entry one.", "Batch entry two."],
        alsoLogAdl: {} as never,
        alsoSaveMemory: {} as never,
      },
      toolCtx,
    );

    // Batch succeeded; no aux lines (omitted, not failed).
    expect(result).toContain("Batch append-chronicle: 2/2 succeeded");
    expect(result).not.toContain("ADL");
    expect(result).not.toContain("Memory");

    expect(ctx.db.getChronicleEvents("default").length).toBe(2);
    expect(ctx.db.getDecisions({ workflowId: "default" }).length).toBe(0);
    const memories = await ctx.memory.search({ query: "batch" });
    expect(memories.length).toBe(0);
  });

  it("reports partial success for a malformed (non-empty) alsoLogAdl", async () => {
    const tool = createGoopAppendChronicleTool(ctx);
    const entry = "Chronicle with malformed ADL.";
    // Has a type but is missing description/entry_action — genuinely malformed,
    // not empty, so it must be rejected as a partial failure.
    const result = await tool.execute(
      {
        entry,
        alsoLogAdl: { type: "decision" } as never,
      },
      toolCtx,
    );

    // Chronicle succeeded; ADL rejected — partial success, not overall failure.
    expect(result).toContain("[OK] Chronicle entry appended");
    expect(result).toContain("[FAIL] ADL: Missing ADL 'description'.");
    expect(ctx.db.getChronicleEvents("default").length).toBe(1);
    expect(ctx.db.getDecisions({ workflowId: "default" }).length).toBe(0);
  });
});
