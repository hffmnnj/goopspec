import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createBackgroundCancelTool } from "./index.js";
import {
  createMockPluginContext,
  createMockToolContext,
  setupTestEnvironment,
  delay,
  type PluginContext,
} from "../../test-utils.js";
import { generateJobId } from "../../features/background-jobs/registry.js";
import { spawnBackgroundJob } from "../../features/background-jobs/spawn.js";
import { startExpiryTimer } from "../../features/background-jobs/kill.js";
import type { JobRecord } from "../../features/background-jobs/types.js";

describe("background_cancel tool", () => {
  let ctx: PluginContext;
  let testDir: string;
  let cleanup: () => void;
  const trackedJobs: { pgid: number; proc: Bun.Subprocess }[] = [];

  beforeEach(() => {
    const env = setupTestEnvironment("bg-cancel");
    testDir = env.testDir;
    cleanup = env.cleanup;
    ctx = createMockPluginContext({ testDir });
    trackedJobs.length = 0;
  });

  afterEach(async () => {
    // Kill any leftover process groups (ESRCH if already dead is expected).
    for (const { pgid } of trackedJobs) {
      try {
        process.kill(-pgid, "SIGKILL");
      } catch {
        // already dead — nothing to do
      }
    }
    // Wait for every spawned process to exit AND for the spawn.ts exit handler
    // (a separate proc.exited consumer) to finish writing exit.code — while the
    // log dir still exists. Only then tear down the test dir.
    for (const { proc } of trackedJobs) {
      try {
        await proc.exited;
      } catch {
        // exit resolution rejected — nothing more to do
      }
    }
    await delay(20);
    cleanup();
  });

  function spawnJob(command: string, deadlineMs = 30_000): JobRecord {
    const id = generateJobId();
    const job = spawnBackgroundJob(ctx.backgroundJobs, {
      id,
      command,
      cwd: testDir,
      projectDir: testDir,
      deadline: Date.now() + deadlineMs,
    });
    trackedJobs.push({ pgid: job.pgid, proc: job.proc! });
    return job;
  }

  it("cancels a running job and sends SIGTERM to the negated pgid", async () => {
    const job = spawnJob("sleep 30");
    const tool = createBackgroundCancelTool(ctx);

    // Passthrough spy on process.kill: records the target and the registry
    // state at the moment each kill is issued, while still delivering the real
    // signal so the spawned process actually dies.
    const originalKill = process.kill.bind(process);
    const killCalls: {
      pid: number;
      signal: string | number;
      stateAtCall: string | undefined;
    }[] = [];
    process.kill = ((pid: number, signal?: string | number) => {
      killCalls.push({
        pid,
        signal: signal ?? "SIGTERM",
        stateAtCall: ctx.backgroundJobs.get(job.id)?.state,
      });
      return originalKill(pid, signal);
    }) as typeof process.kill;

    try {
      const result = await tool.execute(
        { job_id: job.id },
        createMockToolContext(),
      );
      expect(result).toContain("Cancelled");
      expect(result).toContain(job.id);
    } finally {
      process.kill = originalKill;
    }

    const sigtermCall = killCalls.find((c) => c.signal === "SIGTERM");
    expect(sigtermCall).toBeDefined();
    // Kill issued against the NEGATED pgid (process group), not the single pid.
    expect(sigtermCall!.pid).toBe(-job.pgid);
    // Final registry state.
    expect(ctx.backgroundJobs.get(job.id)?.state).toBe("cancelled");
  });

  it("marks state cancelled BEFORE issuing the kill (ordering is load-bearing)", async () => {
    const job = spawnJob("sleep 30");
    const tool = createBackgroundCancelTool(ctx);

    let stateWhenKillIssued: string | undefined;
    const originalKill = process.kill.bind(process);
    process.kill = ((pid: number, signal?: string | number) => {
      if (signal === "SIGTERM" && stateWhenKillIssued === undefined) {
        stateWhenKillIssued = ctx.backgroundJobs.get(job.id)?.state;
      }
      return originalKill(pid, signal);
    }) as typeof process.kill;

    try {
      await tool.execute({ job_id: job.id }, createMockToolContext());
    } finally {
      process.kill = originalKill;
    }

    // The state must already be "cancelled" at the instant the SIGTERM fires.
    // Asserting the ordering explicitly, not just the end state.
    expect(stateWhenKillIssued).toBe("cancelled");
  });

  it("does not revert state to exited when the 143 exit resolution arrives", async () => {
    const job = spawnJob("sleep 30");
    const tool = createBackgroundCancelTool(ctx);

    await tool.execute({ job_id: job.id }, createMockToolContext());

    // Wait for the SIGTERM'd process to exit (143 = 128 + SIGTERM(15)).
    const exitCode = await job.proc!.exited;
    expect(exitCode).toBe(143);

    // Yield so the spawn.ts proc.exited handler (a separate consumer) runs.
    await delay(50);

    const finalJob = ctx.backgroundJobs.get(job.id);
    // State must remain "cancelled" — the arriving 143 must NOT revert it.
    expect(finalJob?.state).toBe("cancelled");
    expect(finalJob?.exitCode).toBe(143);
  });

  it("returns a no-op message for an already-exited job", async () => {
    const job = spawnJob("true"); // exits 0 immediately
    await job.proc!.exited;
    await delay(50); // let the spawn.ts exit handler update the registry

    // Fixture sanity: the job is recorded as exited before we cancel.
    expect(ctx.backgroundJobs.get(job.id)?.state).toBe("exited");

    const tool = createBackgroundCancelTool(ctx);
    const result = await tool.execute(
      { job_id: job.id },
      createMockToolContext(),
    );

    expect(result).toContain("already");
    expect(result).toContain("exited");
    expect(result).not.toContain("Cancelled");
    // State unchanged — no kill was issued.
    expect(ctx.backgroundJobs.get(job.id)?.state).toBe("exited");
  });

  it("returns a no-op message for an already-cancelled job (double cancel)", async () => {
    const job = spawnJob("sleep 30");
    const tool = createBackgroundCancelTool(ctx);

    await tool.execute({ job_id: job.id }, createMockToolContext());
    expect(ctx.backgroundJobs.get(job.id)?.state).toBe("cancelled");

    // Second cancel is a no-op.
    const result = await tool.execute(
      { job_id: job.id },
      createMockToolContext(),
    );
    expect(result).toContain("already");
    expect(result).toContain("cancelled");
    expect(result).not.toContain("Cancelled background job");
  });

  it("returns not-found for an unknown job id without throwing", async () => {
    const tool = createBackgroundCancelTool(ctx);
    const result = await tool.execute(
      { job_id: "job_does_not_exist" },
      createMockToolContext(),
    );

    expect(result).toContain("not found");
    expect(result).toContain("job_does_not_exist");
    expect(ctx.backgroundJobs.get("job_does_not_exist")).toBeUndefined();
  });

  it("clears the expiry timer so a pending timeout cannot fire after cancel", async () => {
    const job = spawnJob("sleep 30", 5_000);
    let expired = false;

    // Attach a short-TTL expiry timer the way background_command would.
    job.deadline = Date.now() + 300;
    const timer = startExpiryTimer(job, () => {
      expired = true;
    });
    expect(job.timer).toBe(timer);
    expect(ctx.backgroundJobs.get(job.id)?.timer).toBe(timer);

    const tool = createBackgroundCancelTool(ctx);
    await tool.execute({ job_id: job.id }, createMockToolContext());

    // The timer reference is detached from the registry.
    expect(ctx.backgroundJobs.get(job.id)?.timer).toBeUndefined();

    // Wait past the TTL; if the timer wasn't cleared, expired would be true.
    await delay(600);
    expect(expired).toBe(false);
  });

  it("never throws — graceful degradation on every path", async () => {
    const tool = createBackgroundCancelTool(ctx);
    // Unknown id resolves to a string, never a throw.
    await expect(
      tool.execute({ job_id: "job_missing" }, createMockToolContext()),
    ).resolves.toBeDefined();
  });
});
