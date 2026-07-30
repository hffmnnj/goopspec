import { describe, expect, it } from "bun:test";

import {
  createBackgroundJobRegistry,
  generateJobId,
  transitionJobToExited,
} from "./registry.js";
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
});
