import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync } from "node:fs";

import {
  createMockPluginContext,
  createMockToolContext,
  setupTestEnvironment,
} from "../../test-utils.js";
import type { PluginContext } from "../../test-utils.js";
import { createBackgroundCommandTool } from "./index.js";

describe("background_command tool", () => {
  let ctx: PluginContext;
  let cleanup: () => void;
  let testDir: string;

  beforeEach(() => {
    const env = setupTestEnvironment("bg-command");
    cleanup = env.cleanup;
    testDir = env.testDir;
    ctx = createMockPluginContext({ testDir });
  });

  afterEach(async () => {
    // Kill any spawned processes and clear timers before removing the test dir,
    // even if an assertion failed above.
    await ctx.backgroundJobs.disposeAll();
    cleanup();
  });

  /** Extract a job_<6hex> id from the tool's return string. */
  function extractJobId(result: unknown): string | null {
    if (typeof result !== "string") return null;
    const match = result.match(/job_[0-9a-f]{6}/);
    return match ? match[0] : null;
  }

  // -------------------------------------------------------------------------
  // Core behaviour
  // -------------------------------------------------------------------------

  it("returns a job_<6hex> id", async () => {
    const tool = createBackgroundCommandTool(ctx);
    const result = await tool.execute({ command: "sleep 30" }, createMockToolContext());
    const jobId = extractJobId(result);
    expect(jobId).not.toBeNull();
    expect(jobId).toMatch(/^job_[0-9a-f]{6}$/);
  });

  it("returns in well under 1s for a 10s command (non-blocking)", async () => {
    const tool = createBackgroundCommandTool(ctx);
    const start = Date.now();
    const result = await tool.execute({ command: "sleep 10" }, createMockToolContext());
    const elapsed = Date.now() - start;
    expect(result).toContain("Background job started");
    expect(elapsed).toBeLessThan(1000);
  });

  it("registers the job in ctx.backgroundJobs", async () => {
    const tool = createBackgroundCommandTool(ctx);
    const result = await tool.execute({ command: "sleep 30" }, createMockToolContext());
    const jobId = extractJobId(result);
    expect(jobId).not.toBeNull();

    const job = ctx.backgroundJobs.get(jobId as string);
    expect(job).toBeDefined();
    expect(job?.command).toBe("sleep 30");
    expect(job?.state).toBe("running");
    expect(ctx.backgroundJobs.list()).toHaveLength(1);
  });

  it("returns pid, cwd, and deadline in the result", async () => {
    const tool = createBackgroundCommandTool(ctx);
    const result = await tool.execute(
      { command: "sleep 30", cwd: testDir },
      createMockToolContext(),
    );
    expect(result).toContain("pid:");
    expect(result).toContain(`cwd:     ${testDir}`);
    expect(result).toContain("deadline:");
  });

  it("defaults cwd to ctx.sdk.directory when not provided", async () => {
    const tool = createBackgroundCommandTool(ctx);
    const result = await tool.execute({ command: "sleep 30" }, createMockToolContext());
    expect(result).toContain(`cwd:     ${ctx.sdk.directory}`);
  });

  it("uses the default 1800s timeout when timeout_seconds is omitted", async () => {
    const tool = createBackgroundCommandTool(ctx);
    const result = await tool.execute({ command: "sleep 30" }, createMockToolContext());
    const jobId = extractJobId(result);
    const job = ctx.backgroundJobs.get(jobId as string);
    expect(job).toBeDefined();
    if (!job) return; // narrows type; unreachable after the assertion above
    // deadline and startedAt are captured by separate Date.now() calls (tool vs
    // spawn helper), so allow a small skew rather than exact equality.
    const ttl = job.deadline - job.startedAt;
    expect(ttl).toBeGreaterThanOrEqual(1800 * 1000 - 1000);
    expect(ttl).toBeLessThanOrEqual(1800 * 1000 + 1000);
  });

  it("creates a log directory for the job", async () => {
    const tool = createBackgroundCommandTool(ctx);
    const result = await tool.execute({ command: "sleep 30" }, createMockToolContext());
    const jobId = extractJobId(result);
    const job = ctx.backgroundJobs.get(jobId as string);
    expect(existsSync(job?.logDir as string)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // timeout_seconds validation
  // -------------------------------------------------------------------------

  describe("timeout_seconds validation", () => {
    const cases: Array<{ name: string; value: number; expectInMsg: string }> = [
      { name: "0 (below minimum)", value: 0, expectInMsg: "received 0" },
      { name: "-1 (negative)", value: -1, expectInMsg: "received -1" },
      { name: "86401 (above maximum)", value: 86401, expectInMsg: "received 86401" },
      { name: "1.5 (non-integer)", value: 1.5, expectInMsg: "received non-integer 1.5" },
      { name: "NaN", value: Number.NaN, expectInMsg: "received NaN" },
    ];

    for (const c of cases) {
      it(`rejects ${c.name} with an explicit error and spawns nothing`, async () => {
        const tool = createBackgroundCommandTool(ctx);
        const result = await tool.execute(
          { command: "sleep 30", timeout_seconds: c.value },
          createMockToolContext(),
        );
        expect(result).toContain("Error");
        expect(result).toContain("between 1 and 86400");
        expect(result).toContain(c.expectInMsg);
        // Nothing was spawned.
        expect(ctx.backgroundJobs.list()).toHaveLength(0);
      });
    }

    it("each invalid value yields a distinct error string", async () => {
      const tool = createBackgroundCommandTool(ctx);
      const results = new Set<string>();
      for (const c of cases) {
        const result = await tool.execute(
          { command: "sleep 30", timeout_seconds: c.value },
          createMockToolContext(),
        );
        results.add(result as string);
      }
      expect(results.size).toBe(cases.length);
    });

    it("accepts the minimum boundary value 1", async () => {
      const tool = createBackgroundCommandTool(ctx);
      const result = await tool.execute(
        { command: "sleep 30", timeout_seconds: 1 },
        createMockToolContext(),
      );
      expect(result).toContain("Background job started");
      const job = ctx.backgroundJobs.list()[0];
      const ttl = job.deadline - job.startedAt;
      expect(ttl).toBeGreaterThanOrEqual(1000 - 100);
      expect(ttl).toBeLessThanOrEqual(1000 + 100);
    });

    it("accepts the maximum boundary value 86400", async () => {
      const tool = createBackgroundCommandTool(ctx);
      const result = await tool.execute(
        { command: "sleep 30", timeout_seconds: 86400 },
        createMockToolContext(),
      );
      expect(result).toContain("Background job started");
      const job = ctx.backgroundJobs.list()[0];
      const ttl = job.deadline - job.startedAt;
      expect(ttl).toBeGreaterThanOrEqual(86400 * 1000 - 1000);
      expect(ttl).toBeLessThanOrEqual(86400 * 1000 + 1000);
    });
  });

  // -------------------------------------------------------------------------
  // Description content (acceptance criterion)
  // -------------------------------------------------------------------------

  describe("description content", () => {
    it("states the default timeout is 30 minutes (1800 seconds)", () => {
      const tool = createBackgroundCommandTool(ctx);
      expect(tool.description).toContain("1800");
      expect(tool.description).toContain("30 minutes");
    });

    it("states the command is killed when the timeout expires", () => {
      const tool = createBackgroundCommandTool(ctx);
      expect(tool.description).toContain("killed");
      expect(tool.description).toContain("timeout expires");
    });

    it("mentions long-running work such as test suites or dev servers", () => {
      const tool = createBackgroundCommandTool(ctx);
      expect(tool.description).toContain("test suites");
      expect(tool.description).toContain("dev servers");
    });
  });

  // -------------------------------------------------------------------------
  // Spawn failure
  // -------------------------------------------------------------------------

  it("spawn failure yields a string, not a throw", async () => {
    const tool = createBackgroundCommandTool(ctx);
    const result = await tool.execute(
      { command: "echo hi", cwd: "/nonexistent/path/xyz" },
      createMockToolContext(),
    );
    expect(typeof result).toBe("string");
    expect(result).toContain("Error");
    expect(result).toContain("failed to start");
    // Nothing was registered.
    expect(ctx.backgroundJobs.list()).toHaveLength(0);
  });
});
