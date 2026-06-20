import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { PluginContext, ToolContext } from "../../test-utils.js";
import {
  createMockPluginContext,
  createMockToolContext,
  setupTestEnvironment,
} from "../../test-utils.js";
import { createGoopTimelineTool } from "./index.js";

function asString(value: unknown): string {
  if (typeof value === "string") return value;
  throw new Error("Expected tool result to be a string");
}

describe("goop_timeline tool", () => {
  let ctx: PluginContext;
  let toolCtx: ToolContext;
  let cleanup: () => void;
  let testDir: string;

  beforeEach(() => {
    const env = setupTestEnvironment("goop-timeline");
    cleanup = env.cleanup;
    testDir = env.testDir;
    ctx = createMockPluginContext({ testDir: env.testDir, db: env.db });
    toolCtx = createMockToolContext();
  });

  afterEach(() => cleanup());

  it("merges audit sources in chronological order and renders TIMELINE.md", async () => {
    ctx.db.appendEvent("default", "phase_transition", { phase: "execute" });
    ctx.db.appendChronicleEvent("default", "Chronicle entry\nsecond line");
    ctx.db.insertDecision("default", {
      type: "decision",
      description: "Use shared builder",
      action: "Add timeline helper",
    });
    ctx.db.insertVerification("default", {
      check_name: "typecheck",
      status: "passed",
    });

    const tool = createGoopTimelineTool(ctx);
    const result = asString(await tool.execute({}, toolCtx));

    expect(result).toContain("# Timeline");
    expect(result).toContain("[event] phase_transition");
    expect(result).toContain("[chronicle] Chronicle entry");
    expect(result).toContain("[decision] [decision] Use shared builder");
    expect(result).toContain("[verification] typecheck: passed");

    const lines = result.split("\n").filter((line) => line.startsWith("- "));
    const timestamps = lines.map((line) => Date.parse(line.slice(2, 26)));
    expect(timestamps).toEqual([...timestamps].sort((a, b) => a - b));

    const timelinePath = join(testDir, ".goopspec", "default", "TIMELINE.md");
    expect(existsSync(timelinePath)).toBe(true);
    expect(readFileSync(timelinePath, "utf-8")).toContain("[chronicle] Chronicle entry");
  });

  it("caps to the most recent limit and displays chronologically", async () => {
    ctx.db.appendEvent("default", "first", { order: 1 });
    ctx.db.appendChronicleEvent("default", "second");
    ctx.db.insertDecision("default", {
      description: "third",
      action: "record",
    });
    ctx.db.insertVerification("default", {
      check_name: "fourth",
      status: "passed",
    });

    const tool = createGoopTimelineTool(ctx);
    const result = asString(await tool.execute({ limit: 2 }, toolCtx));
    const lines = result.split("\n").filter((line) => line.startsWith("- "));

    expect(lines.length).toBe(2);
    expect(result).toContain("fourth: passed");
  });
});
