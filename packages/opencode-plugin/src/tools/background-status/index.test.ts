import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { spawnBackgroundJob } from "../../features/background-jobs/spawn.js";
import type { JobRecord, JobState } from "../../features/background-jobs/types.js";
import {
  createMockPluginContext,
  createMockToolContext,
  delay,
  setupTestEnvironment,
} from "../../test-utils.js";
import type { PluginContext } from "../../test-utils.js";
import { createBackgroundStatusTool } from "./index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Poll the registry until a job reaches the target state, or time out. */
async function waitForJobState(
  ctx: PluginContext,
  jobId: string,
  target: JobState,
  timeoutMs = 3000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const job = ctx.backgroundJobs.get(jobId);
    if (job && job.state === target) return;
    await delay(20);
  }
  throw new Error(`Job ${jobId} did not reach state "${target}" within ${timeoutMs}ms`);
}

/** Build a fake JobRecord pointing at a logDir the test controls. */
function makeFakeJob(id: string, logDir: string, overrides: Partial<JobRecord> = {}): JobRecord {
  return {
    id,
    pid: 99999,
    pgid: 99999,
    command: "fake-command",
    cwd: "/tmp",
    logDir,
    state: "running",
    exitCode: null,
    startedAt: Date.now(),
    deadline: Date.now() + 30000,
    ...overrides,
  };
}

/** Create a log dir under the test scaffold and return its path. */
function makeLogDir(ctx: PluginContext, id: string): string {
  const logDir = join(ctx.sdk.directory, ".goopspec", "background-jobs", id);
  mkdirSync(logDir, { recursive: true });
  return logDir;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("background_status tool", () => {
  let ctx: PluginContext;
  let cleanup: () => void;
  const realJobs: JobRecord[] = [];

  beforeEach(() => {
    const env = setupTestEnvironment("background-status");
    cleanup = env.cleanup;
    ctx = createMockPluginContext({ testDir: env.testDir });
  });

  afterEach(() => {
    // Kill any real processes that are still running, even on assertion failure.
    for (const job of realJobs) {
      try {
        if (job.state === "running") {
          process.kill(-job.pgid, "SIGKILL");
        }
      } catch {
        // already dead — nothing to clean up
      }
    }
    realJobs.length = 0;
    cleanup();
  });

  // -------------------------------------------------------------------------
  // LOAD-BEARING: the core tmux failure this workflow exists to fix
  // -------------------------------------------------------------------------

  it("returns captured output for an already-exited job", async () => {
    const job = spawnBackgroundJob(ctx.backgroundJobs, {
      id: "job_exited_test",
      command: "echo 'hello world'",
      cwd: ctx.sdk.directory,
      projectDir: ctx.sdk.directory,
      deadline: Date.now() + 30000,
    });
    realJobs.push(job);

    await waitForJobState(ctx, job.id, "exited");

    const tool = createBackgroundStatusTool(ctx);
    const result = await tool.execute({ job_id: job.id }, createMockToolContext());

    expect(result).toContain("exited");
    expect(result).toContain("hello world");
    expect(result).toContain("**Exit code:** 0");
  });

  // -------------------------------------------------------------------------
  // Truncation
  // -------------------------------------------------------------------------

  it("marks output as truncated when the log exceeds tail_bytes", async () => {
    const logDir = makeLogDir(ctx, "job_truncated_test");
    writeFileSync(join(logDir, "stdout.log"), "x".repeat(10000));
    writeFileSync(join(logDir, "stderr.log"), "");

    ctx.backgroundJobs.register(
      makeFakeJob("job_truncated_test", logDir, {
        command: "printf 'x%.0s' {1..10000}",
        state: "exited",
        exitCode: 0,
      }),
    );

    const tool = createBackgroundStatusTool(ctx);
    const result = await tool.execute(
      { job_id: "job_truncated_test", tail_bytes: 100 },
      createMockToolContext(),
    );

    expect(result).toContain("10000 bytes total");
    expect(result).toContain("truncated");
    expect(result).toContain("showing last 100");
  });

  it("uses the default tail_bytes of 4096 when not specified", async () => {
    const logDir = makeLogDir(ctx, "job_default_tail");
    writeFileSync(join(logDir, "stdout.log"), "y".repeat(5000));

    ctx.backgroundJobs.register(
      makeFakeJob("job_default_tail", logDir, {
        command: "yes | head -c 5000",
        state: "exited",
        exitCode: 0,
      }),
    );

    const tool = createBackgroundStatusTool(ctx);
    const result = await tool.execute({ job_id: "job_default_tail" }, createMockToolContext());

    expect(result).toContain("5000 bytes total");
    expect(result).toContain("truncated");
    expect(result).toContain("showing last 4096");
  });

  it("does not mark output as truncated when the log fits in tail_bytes", async () => {
    const logDir = makeLogDir(ctx, "job_small_log");
    writeFileSync(join(logDir, "stdout.log"), "small output");

    ctx.backgroundJobs.register(
      makeFakeJob("job_small_log", logDir, { state: "exited", exitCode: 0 }),
    );

    const tool = createBackgroundStatusTool(ctx);
    const result = await tool.execute(
      { job_id: "job_small_log", tail_bytes: 4096 },
      createMockToolContext(),
    );

    expect(result).toContain("12 bytes total");
    expect(result).not.toContain("truncated");
    expect(result).toContain("small output");
  });

  // -------------------------------------------------------------------------
  // Expiry sweep
  // -------------------------------------------------------------------------

  it("flips a running job to timed-out when its deadline has passed", async () => {
    const logDir = makeLogDir(ctx, "job_timeout_test");

    ctx.backgroundJobs.register(
      makeFakeJob("job_timeout_test", logDir, {
        command: "sleep 100",
        startedAt: Date.now() - 60000,
        deadline: Date.now() - 1000,
      }),
    );

    const tool = createBackgroundStatusTool(ctx);
    const result = await tool.execute({ job_id: "job_timeout_test" }, createMockToolContext());

    expect(result).toContain("timed-out");
    expect(ctx.backgroundJobs.get("job_timeout_test")?.state).toBe("timed-out");
  });

  it("does not overwrite an already-terminal state during the sweep", async () => {
    const logDir = makeLogDir(ctx, "job_exited_past_deadline");

    ctx.backgroundJobs.register(
      makeFakeJob("job_exited_past_deadline", logDir, {
        command: "echo done",
        state: "exited",
        exitCode: 0,
        deadline: Date.now() - 5000,
      }),
    );

    const tool = createBackgroundStatusTool(ctx);
    const result = await tool.execute(
      { job_id: "job_exited_past_deadline" },
      createMockToolContext(),
    );

    expect(result).toContain("exited");
    expect(result).not.toContain("timed-out");
    expect(ctx.backgroundJobs.get("job_exited_past_deadline")?.state).toBe("exited");
  });

  // -------------------------------------------------------------------------
  // List view
  // -------------------------------------------------------------------------

  it("lists all jobs when no job_id is provided", async () => {
    const logDirA = makeLogDir(ctx, "job_list_a");
    const logDirB = makeLogDir(ctx, "job_list_b");

    ctx.backgroundJobs.register(
      makeFakeJob("job_list_a", logDirA, { command: "echo a", state: "running" }),
    );
    ctx.backgroundJobs.register(
      makeFakeJob("job_list_b", logDirB, {
        command: "echo b",
        state: "exited",
        exitCode: 0,
        startedAt: Date.now() - 5000,
      }),
    );

    const tool = createBackgroundStatusTool(ctx);
    const result = await tool.execute({}, createMockToolContext());

    expect(result).toContain("job_list_a");
    expect(result).toContain("job_list_b");
    expect(result).toContain("running");
    expect(result).toContain("exited");
    expect(result).toContain("echo a");
    expect(result).toContain("echo b");
  });

  it("returns a message when no jobs are registered", async () => {
    const tool = createBackgroundStatusTool(ctx);
    const result = await tool.execute({}, createMockToolContext());

    expect(result).toContain("No background jobs");
  });

  // -------------------------------------------------------------------------
  // Unknown id
  // -------------------------------------------------------------------------

  it("returns a not-found message for an unknown job_id", async () => {
    const tool = createBackgroundStatusTool(ctx);
    const result = await tool.execute({ job_id: "job_unknown" }, createMockToolContext());

    expect(result).toContain("not found");
    expect(result).toContain("job_unknown");
  });

  // -------------------------------------------------------------------------
  // Missing log files
  // -------------------------------------------------------------------------

  it("returns empty output when log files are missing", async () => {
    const logDir = makeLogDir(ctx, "job_no_logs");

    ctx.backgroundJobs.register(makeFakeJob("job_no_logs", logDir));

    const tool = createBackgroundStatusTool(ctx);
    const result = await tool.execute({ job_id: "job_no_logs" }, createMockToolContext());

    expect(result).toContain("0 bytes total");
    expect(result).toContain("(empty)");
    expect(result).not.toContain("Error");
  });

  // -------------------------------------------------------------------------
  // stdout / stderr ordering
  // -------------------------------------------------------------------------

  it("presents stdout first then stderr with labelled sections", async () => {
    const logDir = makeLogDir(ctx, "job_both_logs");
    writeFileSync(join(logDir, "stdout.log"), "stdout content");
    writeFileSync(join(logDir, "stderr.log"), "stderr content");

    ctx.backgroundJobs.register(
      makeFakeJob("job_both_logs", logDir, {
        command: "echo out; echo err 1>&2",
        state: "exited",
        exitCode: 0,
      }),
    );

    const tool = createBackgroundStatusTool(ctx);
    const raw = await tool.execute({ job_id: "job_both_logs" }, createMockToolContext());
    const result = typeof raw === "string" ? raw : raw.output;

    const stdoutIdx = result.indexOf("### stdout");
    const stderrIdx = result.indexOf("### stderr");
    expect(stdoutIdx).toBeGreaterThan(-1);
    expect(stderrIdx).toBeGreaterThan(-1);
    expect(stdoutIdx).toBeLessThan(stderrIdx);
    expect(result).toContain("stdout content");
    expect(result).toContain("stderr content");
  });

  // -------------------------------------------------------------------------
  // Graceful degradation — never throws
  // -------------------------------------------------------------------------

  it("never throws on unexpected registry errors", async () => {
    const brokenCtx: PluginContext = {
      ...ctx,
      backgroundJobs: {
        ...ctx.backgroundJobs,
        list: () => {
          throw new Error("registry corrupted");
        },
      },
    };

    const tool = createBackgroundStatusTool(brokenCtx);
    const result = await tool.execute({}, createMockToolContext());

    expect(result).toContain("Error");
    expect(result).toContain("registry corrupted");
  });
});
