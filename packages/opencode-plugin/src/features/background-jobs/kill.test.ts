import { afterEach, describe, expect, it } from "bun:test";

import { isAlive, killJobGroup, startExpiryTimer, sweepIfExpired } from "./kill.js";
import type { JobRecord } from "./types.js";

function createJob(overrides: Partial<JobRecord> = {}): JobRecord {
  return {
    id: "job_abcdef",
    pid: 123,
    pgid: 123,
    command: "sleep 1",
    cwd: "/tmp",
    logDir: "/tmp/job_abcdef",
    state: "running",
    exitCode: null,
    startedAt: Date.now(),
    deadline: Date.now() + 1_000,
    ...overrides,
  };
}

describe("background job termination", () => {
  let originalKill: typeof process.kill | undefined;
  let originalSetTimeout: typeof setTimeout | undefined;
  let originalConsoleError: typeof console.error | undefined;

  afterEach(() => {
    if (originalKill) {
      process.kill = originalKill;
      originalKill = undefined;
    }
    if (originalSetTimeout) {
      globalThis.setTimeout = originalSetTimeout;
      originalSetTimeout = undefined;
    }
    if (originalConsoleError) {
      console.error = originalConsoleError;
      originalConsoleError = undefined;
    }
  });

  it("sends SIGTERM to the negated process group", () => {
    originalKill = process.kill;
    const calls: Array<[number, NodeJS.Signals | number | undefined]> = [];
    process.kill = ((pid: number, signal?: NodeJS.Signals | number) => {
      calls.push([pid, signal]);
      return true;
    }) as typeof process.kill;

    killJobGroup(456);

    expect(calls).toEqual([[-456, "SIGTERM"]]);
  });

  it("treats ESRCH as an already-dead successful group kill", () => {
    originalKill = process.kill;
    process.kill = (() => {
      const error = new Error("gone") as NodeJS.ErrnoException;
      error.code = "ESRCH";
      throw error;
    }) as typeof process.kill;

    expect(() => killJobGroup(456)).not.toThrow();
    expect(isAlive(456)).toBe(false);
  });

  it("logs and swallows a non-ESRCH escalation failure", () => {
    originalKill = process.kill;
    originalSetTimeout = globalThis.setTimeout;
    originalConsoleError = console.error;
    const errors: unknown[][] = [];
    let escalationCallback: (() => void) | undefined;
    console.error = ((...args: unknown[]) => {
      errors.push(args);
    }) as typeof console.error;
    globalThis.setTimeout = ((callback: () => void) => {
      escalationCallback = callback;
      return { unref: () => undefined } as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout;
    process.kill = ((_pid: number, signal?: NodeJS.Signals | number) => {
      if (signal === "SIGTERM") return true;
      const error = new Error("permission denied") as NodeJS.ErrnoException;
      error.code = "EPERM";
      throw error;
    }) as typeof process.kill;

    killJobGroup(456);

    expect(escalationCallback).toBeDefined();
    expect(() => escalationCallback?.()).not.toThrow();
    expect(errors[0]?.[0]).toContain("Failed to escalate background job process group termination");
  });

  it("reports a backdated deadline as expired", () => {
    expect(sweepIfExpired(createJob({ deadline: Date.now() - 1 }))).toBe(true);
    expect(sweepIfExpired(createJob({ deadline: Date.now() + 1_000 }))).toBe(false);
  });

  it("unrefs expiry timers and invokes the expiry callback", async () => {
    const job = createJob({ deadline: Date.now() - 1 });
    let expiredJob: JobRecord | undefined;
    const timer = startExpiryTimer(job, (expired) => {
      expiredJob = expired;
    });

    expect(job.timer).toBe(timer);
    await Bun.sleep(10);
    expect(expiredJob).toBe(job);
  });
});
