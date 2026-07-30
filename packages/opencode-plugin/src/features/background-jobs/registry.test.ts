import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createBackgroundJobRegistry, generateJobId, transitionJobToExited } from "./registry.js";
import { spawnBackgroundJob } from "./spawn.js";
import type { JobRecord } from "./types.js";

function createJob(overrides: Partial<JobRecord> = {}): JobRecord {
  return {
    id: "job_abcdef",
    pid: 1234,
    pgid: 1234,
    command: "sleep 60",
    cwd: "/tmp",
    logDir: "/tmp/job_abcdef",
    state: "running",
    exitCode: null,
    startedAt: 1_700_000_000_000,
    deadline: 1_700_000_060_000,
    ...overrides,
  };
}

describe("background job registry", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const tempDir of tempDirs.splice(0)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("round-trips a record across separate get calls", () => {
    const registry = createBackgroundJobRegistry();
    const job = createJob();

    registry.register(job);

    expect(registry.get(job.id)).toEqual(job);
    expect(registry.get(job.id)).toEqual(job);
  });

  it("updates, lists, and deletes registered jobs", () => {
    const registry = createBackgroundJobRegistry();
    const job = createJob();
    registry.register(job);

    expect(registry.update(job.id, { state: "cancelled" })).toMatchObject({ state: "cancelled" });
    expect(registry.list()).toHaveLength(1);
    expect(registry.delete(job.id)).toBe(true);
    expect(registry.get(job.id)).toBeUndefined();
  });

  it("generates unique six-digit hexadecimal job IDs", () => {
    const ids = new Set<string>();

    for (let index = 0; index < 1000; index += 1) {
      const id = generateJobId();
      expect(id).toMatch(/^job_[0-9a-f]{6}$/);
      ids.add(id);
    }

    expect(ids).toHaveLength(1000);
  });

  it("preserves cancelled state while recording a later exit code", () => {
    const exited = transitionJobToExited(createJob({ state: "cancelled" }), 143);

    expect(exited.state).toBe("cancelled");
    expect(exited.exitCode).toBe(143);
  });

  it("preserves timed-out state while recording a later exit code", () => {
    const exited = transitionJobToExited(createJob({ state: "timed-out" }), 137);

    expect(exited.state).toBe("timed-out");
    expect(exited.exitCode).toBe(137);
  });

  it("marks running jobs exited when their process resolves", () => {
    const exited = transitionJobToExited(createJob(), 0);

    expect(exited.state).toBe("exited");
    expect(exited.exitCode).toBe(0);
  });

  it("disposes a real running process group and empties the registry", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "background-job-registry-"));
    tempDirs.push(tempDir);
    const registry = createBackgroundJobRegistry();
    const job = spawnBackgroundJob(registry, {
      id: "job_123456",
      command: "sleep 30",
      cwd: tempDir,
      projectDir: tempDir,
      deadline: Date.now() + 60_000,
    });

    try {
      await registry.disposeAll();

      expect(registry.list()).toHaveLength(0);
      expect(await job.proc?.exited).not.toBe(0);
    } finally {
      await registry.disposeAll();
    }
  });

  it("continues sweeping after a job cleanup throws and clears expiry timers", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "background-job-registry-"));
    tempDirs.push(tempDir);
    const registry = createBackgroundJobRegistry();
    let timerFired = false;
    const timer = setTimeout(() => {
      timerFired = true;
    }, 20);
    registry.register(createJob({ id: "job_bad001", pgid: 0, timer }));
    const job = spawnBackgroundJob(registry, {
      id: "job_dead02",
      command: "sleep 30",
      cwd: tempDir,
      projectDir: tempDir,
      deadline: Date.now() + 60_000,
    });

    try {
      await registry.disposeAll();
      await Bun.sleep(30);

      expect(registry.list()).toHaveLength(0);
      expect(await job.proc?.exited).not.toBe(0);
      expect(timerFired).toBe(false);
    } finally {
      await registry.disposeAll();
    }
  });
});
