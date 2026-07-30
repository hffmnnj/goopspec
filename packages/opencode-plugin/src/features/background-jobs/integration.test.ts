import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { PluginContext } from "../../test-utils.js";
import {
  createMockPluginContext,
  createMockToolContext,
  setupTestEnvironment,
} from "../../test-utils.js";
import { killJobGroup, startExpiryTimer } from "./kill.js";
import { spawnBackgroundJob } from "./spawn.js";
import type { JobState } from "./types.js";
import { createBackgroundCancelTool } from "../../tools/background-cancel/index.js";
import { createBackgroundCommandTool } from "../../tools/background-command/index.js";
import { createBackgroundStatusTool } from "../../tools/background-status/index.js";

const POLL_INTERVAL_MS = 10;
const WAIT_TIMEOUT_MS = 1_000;

function jobIdFrom(result: unknown): string {
  const match = typeof result === "string" ? result.match(/job_[0-9a-f]{6}/) : null;
  if (!match) throw new Error(`Expected a background job id, received: ${String(result)}`);
  return match[0];
}

async function waitForJobState(
  ctx: PluginContext,
  jobId: string,
  state: JobState,
): Promise<void> {
  const deadline = Date.now() + WAIT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (ctx.backgroundJobs.get(jobId)?.state === state) return;
    await Bun.sleep(POLL_INTERVAL_MS);
  }
  throw new Error(`Job ${jobId} did not reach ${state} within ${WAIT_TIMEOUT_MS}ms`);
}

async function waitForFileText(path: string): Promise<string> {
  const deadline = Date.now() + WAIT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (existsSync(path)) {
      const text = readFileSync(path, "utf8").trim();
      if (text) return text;
    }
    await Bun.sleep(POLL_INTERVAL_MS);
  }
  throw new Error(`No output written to ${path} within ${WAIT_TIMEOUT_MS}ms`);
}

describe("background jobs real-process lifecycle", () => {
  let ctx: PluginContext;
  let cleanup: () => void;

  beforeEach(() => {
    const environment = setupTestEnvironment("background-jobs-integration");
    cleanup = environment.cleanup;
    ctx = createMockPluginContext({ testDir: environment.testDir });
  });

  afterEach(async () => {
    const cancel = createBackgroundCancelTool(ctx);
    const jobs = ctx.backgroundJobs.list();

    for (const job of jobs) {
      if (job.state === "running") {
        await cancel.execute({ job_id: job.id }, createMockToolContext());
      }
    }

    await Promise.all(jobs.map((job) => job.proc?.exited ?? Promise.resolve(0)));
    await ctx.backgroundJobs.disposeAll();
    cleanup();
  });

  it("persists a job between separate start and status invocations", async () => {
    const command = createBackgroundCommandTool(ctx);
    const status = createBackgroundStatusTool(ctx);
    const jobId = jobIdFrom(
      await command.execute({ command: "sleep 0.2" }, createMockToolContext()),
    );

    const result = await status.execute({ job_id: jobId }, createMockToolContext());

    expect(result).toContain(`Background Job · ${jobId}`);
    expect(result).toContain("**State:** running");
  });

  it("retains output and exit data after the process exits", async () => {
    const command = createBackgroundCommandTool(ctx);
    const status = createBackgroundStatusTool(ctx);
    const jobId = jobIdFrom(
      await command.execute({ command: "printf 'persisted output'" }, createMockToolContext()),
    );

    await waitForJobState(ctx, jobId, "exited");
    const result = await status.execute({ job_id: jobId }, createMockToolContext());

    expect(result).toContain("persisted output");
    expect(result).toContain("**Exit code:** 0");
  });

  it("reports real exit codes and writes matching exit-code sentinels", async () => {
    const command = createBackgroundCommandTool(ctx);

    for (const expectedCode of [42, 0]) {
      const jobId = jobIdFrom(
        await command.execute({ command: `exit ${expectedCode}` }, createMockToolContext()),
      );
      await waitForJobState(ctx, jobId, "exited");

      const job = ctx.backgroundJobs.get(jobId);
      expect(job?.exitCode).toBe(expectedCode);
      expect(readFileSync(join(job?.logDir ?? "", "exit.code"), "utf8")).toBe(
        String(expectedCode),
      );
    }
  });

  it("kills a backgrounded grandchild with its process group", async () => {
    const command = createBackgroundCommandTool(ctx);
    const cancel = createBackgroundCancelTool(ctx);
    const jobId = jobIdFrom(
      await command.execute({ command: "sleep 0.8 & echo $!; wait" }, createMockToolContext()),
    );
    const job = ctx.backgroundJobs.get(jobId);
    if (!job) throw new Error(`Missing job ${jobId}`);
    const grandchildPid = Number.parseInt(await waitForFileText(join(job.logDir, "stdout.log")), 10);
    expect(Number.isSafeInteger(grandchildPid)).toBe(true);

    await cancel.execute({ job_id: jobId }, createMockToolContext());
    await job.proc?.exited;
    await Bun.sleep(30);

    expect(() => process.kill(grandchildPid, 0)).toThrow(/ESRCH/);
  });

  it("expires jobs via eager timer and lazy status sweep", async () => {
    const eager = spawnBackgroundJob(ctx.backgroundJobs, {
      id: "job_eager_expiry",
      command: "sleep 0.8",
      cwd: ctx.sdk.directory,
      projectDir: ctx.sdk.directory,
      deadline: Date.now() + 100,
    });
    startExpiryTimer(eager, (expired) => {
      const current = ctx.backgroundJobs.get(expired.id);
      if (!current || current.state !== "running") return;
      killJobGroup(current.pgid);
      ctx.backgroundJobs.update(current.id, { state: "timed-out" });
    });

    await waitForJobState(ctx, eager.id, "timed-out");

    const command = createBackgroundCommandTool(ctx);
    const status = createBackgroundStatusTool(ctx);
    const lazyId = jobIdFrom(
      await command.execute({ command: "sleep 0.8" }, createMockToolContext()),
    );
    ctx.backgroundJobs.update(lazyId, { deadline: Date.now() - 1 });

    const result = await status.execute({ job_id: lazyId }, createMockToolContext());
    expect(result).toContain("**State:** timed-out");
  });

  it("preserves cancelled state when SIGTERM resolves as exit code 143", async () => {
    const command = createBackgroundCommandTool(ctx);
    const cancel = createBackgroundCancelTool(ctx);
    const jobId = jobIdFrom(
      await command.execute({ command: "sleep 0.8" }, createMockToolContext()),
    );
    const job = ctx.backgroundJobs.get(jobId);
    if (!job) throw new Error(`Missing job ${jobId}`);

    await cancel.execute({ job_id: jobId }, createMockToolContext());
    await job.proc?.exited;
    await Bun.sleep(0);

    expect(ctx.backgroundJobs.get(jobId)?.state).toBe("cancelled");
    expect(ctx.backgroundJobs.get(jobId)?.exitCode).toBe(143);
  });

  it("keeps stdout and stderr in separate labelled output sections", async () => {
    const command = createBackgroundCommandTool(ctx);
    const status = createBackgroundStatusTool(ctx);
    const jobId = jobIdFrom(
      await command.execute(
        { command: "printf 'stdout marker'; printf 'stderr marker' >&2" },
        createMockToolContext(),
      ),
    );

    await waitForJobState(ctx, jobId, "exited");
    const result = await status.execute({ job_id: jobId }, createMockToolContext());

    expect(result).toContain("### stdout");
    expect(result).toContain("stdout marker");
    expect(result).toContain("### stderr");
    expect(result).toContain("stderr marker");
  });
});
