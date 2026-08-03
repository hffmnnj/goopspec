import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import {
  type PluginContext,
  createMockPluginContext,
  setupTestEnvironment,
} from "../../test-utils.js";

import {
  LAZY_AUTOPILOT_NUDGE_ABANDONMENT_TEXT,
  MAX_CONSECUTIVE_NUDGE_DISPATCH_FAILURES,
  type ResolvedLazyAutopilotNudgeConfig,
  __clearNudgeRateLimitState,
  __getNudgeRateLimitState,
  buildNudgeFingerprint,
  clearNudgeRateLimitState,
  createNudgeRateLimitCheck,
  recordNudge,
  recordNudgeDispatchFailure,
  resolveLazyAutopilotNudgeConfig,
} from "./rate-limit.js";

describe("lazy autopilot nudge rate-limit", () => {
  let cleanup: () => void;
  let testDir: string;
  let baseCtx: PluginContext;
  let dateNowSpy: ReturnType<typeof spyOn<typeof Date, "now">> | undefined;

  beforeEach(() => {
    const env = setupTestEnvironment("lazy-autopilot-rate-limit");
    cleanup = env.cleanup;
    testDir = env.testDir;
    __clearNudgeRateLimitState();

    baseCtx = createMockPluginContext({
      testDir,
      db: env.db,
      state: {
        activeWorkflowId: "default",
        workflows: {
          default: {
            phase: "execute",
            mode: "standard",
            depth: "standard",
            interviewComplete: false,
            specLocked: false,
            acceptanceConfirmed: true,
            currentWave: 3,
            totalWaves: 5,
            autopilot: false,
            lazyAutopilot: true,
          },
        },
      },
    });

    env.db.upsertWave("default", { wave_number: 3, title: "Wave 3", status: "in_progress" });
    env.db.upsertWaveTask({
      wave_id: env.db.getWave("default", 3)?.id ?? 1,
      workflow_id: "default",
      task_index: 1,
      description: "Task 1",
      status: "done",
    });
    env.db.upsertWaveTask({
      wave_id: env.db.getWave("default", 3)?.id ?? 1,
      workflow_id: "default",
      task_index: 2,
      description: "Task 2",
      status: "in_progress",
    });
  });

  afterEach(() => {
    dateNowSpy?.mockRestore();
    cleanup();
  });

  function cfg(
    overrides: Partial<ResolvedLazyAutopilotNudgeConfig> = {},
  ): ResolvedLazyAutopilotNudgeConfig {
    return {
      enabled: true,
      cap: 3,
      cooldownMs: 1_000,
      ...overrides,
    };
  }

  function advanceTime(ms: number) {
    const now = Date.now();
    dateNowSpy = spyOn(Date, "now").mockReturnValue(now + ms);
  }

  it("resolves default config when the key is absent", () => {
    const resolved = resolveLazyAutopilotNudgeConfig({});
    expect(resolved).toEqual({
      enabled: true,
      cap: 5,
      cooldownMs: 30_000,
    });
  });

  it("resolves user overrides from merged config", () => {
    const resolved = resolveLazyAutopilotNudgeConfig({
      lazyAutopilotNudge: { enabled: false, cap: 2, cooldownMs: 5_000 },
    });
    expect(resolved).toEqual({
      enabled: false,
      cap: 2,
      cooldownMs: 5_000,
    });
  });

  it("cap halts nudging after the bound", () => {
    const check = createNudgeRateLimitCheck(baseCtx, cfg({ cap: 2 })).check;
    const sess = "sess-cap";

    expect(check(baseCtx, sess).allowed).toBe(true);
    recordNudge(baseCtx, sess, "default");

    advanceTime(2_000);
    expect(check(baseCtx, sess).allowed).toBe(true);
    recordNudge(baseCtx, sess, "default");

    advanceTime(4_000);
    const denied = check(baseCtx, sess);
    expect(denied.allowed).toBe(false);
    expect(denied.reason).toContain("2");
    expect(denied.abandoned).toBe(true);
    expect(denied.message).toBe(LAZY_AUTOPILOT_NUDGE_ABANDONMENT_TEXT);
  });

  it("cooldown blocks a rapid second nudge", () => {
    const check = createNudgeRateLimitCheck(baseCtx, cfg({ cooldownMs: 10_000 })).check;
    const sess = "sess-cooldown";

    expect(check(baseCtx, sess).allowed).toBe(true);
    recordNudge(baseCtx, sess, "default");

    const next = check(baseCtx, sess);
    expect(next.allowed).toBe(false);
    expect(next.reason).toContain("cooldown active");
  });

  it("counter resets on progress fingerprint change", () => {
    const check = createNudgeRateLimitCheck(baseCtx, cfg({ cap: 5 })).check;
    const sess = "sess-progress";

    expect(check(baseCtx, sess).allowed).toBe(true);
    recordNudge(baseCtx, sess, "default");
    expect(__getNudgeRateLimitState(sess)?.count).toBe(1);

    const state = baseCtx.stateManager.getActiveWorkflow();
    state.currentWave = 4;
    baseCtx.db.upsertWave("default", { wave_number: 4, title: "Wave 4", status: "in_progress" });

    const after = check(baseCtx, sess);
    expect(after.allowed).toBe(true);
    expect(__getNudgeRateLimitState(sess)?.count).toBe(0);
  });

  it("counter does not reset when the fingerprint is unchanged", () => {
    const check = createNudgeRateLimitCheck(baseCtx, cfg({ cap: 5 })).check;
    const sess = "sess-no-progress";

    expect(check(baseCtx, sess).allowed).toBe(true);
    recordNudge(baseCtx, sess, "default");
    expect(__getNudgeRateLimitState(sess)?.count).toBe(1);

    advanceTime(2_000);
    expect(check(baseCtx, sess).allowed).toBe(true);
    recordNudge(baseCtx, sess, "default");
    expect(__getNudgeRateLimitState(sess)?.count).toBe(2);
  });

  it("suppresses a session after three consecutive promptAsync failures", () => {
    const check = createNudgeRateLimitCheck(baseCtx, cfg({ cap: 10, cooldownMs: 0 })).check;
    const sess = "sess-dispatch-failures";

    for (let failures = 0; failures < MAX_CONSECUTIVE_NUDGE_DISPATCH_FAILURES; failures += 1) {
      expect(check(baseCtx, sess).allowed).toBe(true);
      recordNudge(baseCtx, sess, "default");
      recordNudgeDispatchFailure(sess);
    }

    expect(check(baseCtx, sess)).toMatchObject({
      allowed: false,
      consecutiveDispatchFailures: MAX_CONSECUTIVE_NUDGE_DISPATCH_FAILURES,
      maxConsecutiveDispatchFailures: MAX_CONSECUTIVE_NUDGE_DISPATCH_FAILURES,
    });
  });

  it("builds a stable fingerprint from phase, wave, and task statuses", () => {
    const fp1 = buildNudgeFingerprint(baseCtx, "default", baseCtx.stateManager.getActiveWorkflow());
    const fp2 = buildNudgeFingerprint(baseCtx, "default", baseCtx.stateManager.getActiveWorkflow());
    expect(fp1).toBe(fp2);
    expect(fp1).toMatch(/^execute\|3\|/);
    expect(fp1).toContain("1:done");
    expect(fp1).toContain("2:in_progress");
  });

  it("changes fingerprint when a task status changes", () => {
    const before = buildNudgeFingerprint(
      baseCtx,
      "default",
      baseCtx.stateManager.getActiveWorkflow(),
    );
    const waveId = baseCtx.db.getWave("default", 3)?.id ?? 1;
    baseCtx.db.setWaveTaskStatus(waveId, 2, "done");
    const after = buildNudgeFingerprint(
      baseCtx,
      "default",
      baseCtx.stateManager.getActiveWorkflow(),
    );
    expect(after).not.toBe(before);
  });

  // -------------------------------------------------------------------------
  // T3 / MH7 / MH8: A verification-only turn must move the fingerprint.
  // The orchestrator dispatches goop-wave-verifier after every wave's tasks
  // are complete (commands/goop-execute.md). The verifier records evidence
  // via goop_write_wave verifications[]; task statuses do not change. Without
  // verification rows in the digest, the nudge's progress fingerprint would
  // be identical before and after that turn, so the consecutive counter
  // would not reset and the session would eventually be abandoned even
  // though real evidence landed. These tests pin the fix.
  // -------------------------------------------------------------------------

  it("builds a fingerprint that ends with the verification digest slot", () => {
    const fp = buildNudgeFingerprint(baseCtx, "default", baseCtx.stateManager.getActiveWorkflow());
    // No verification rows seeded in beforeEach -> slot is "none".
    expect(fp).toMatch(/\|v:none$/);
  });

  it("changes fingerprint when a verification row is recorded without any task-status change", () => {
    const before = buildNudgeFingerprint(
      baseCtx,
      "default",
      baseCtx.stateManager.getActiveWorkflow(),
    );
    const waveId = baseCtx.db.getWave("default", 3)?.id ?? 1;
    baseCtx.db.insertVerification("default", {
      wave_id: waveId,
      check_name: "test",
      status: "passed",
    });
    const after = buildNudgeFingerprint(
      baseCtx,
      "default",
      baseCtx.stateManager.getActiveWorkflow(),
    );
    expect(after).not.toBe(before);
    expect(after).toMatch(/\|v:test:passed$/);
  });

  it("changes fingerprint when a second verification row lands (insertion order preserved)", () => {
    const waveId = baseCtx.db.getWave("default", 3)?.id ?? 1;
    baseCtx.db.insertVerification("default", {
      wave_id: waveId,
      check_name: "typecheck",
      status: "passed",
    });
    const before = buildNudgeFingerprint(
      baseCtx,
      "default",
      baseCtx.stateManager.getActiveWorkflow(),
    );
    baseCtx.db.insertVerification("default", {
      wave_id: waveId,
      check_name: "test",
      status: "passed",
    });
    const after = buildNudgeFingerprint(
      baseCtx,
      "default",
      baseCtx.stateManager.getActiveWorkflow(),
    );
    expect(after).not.toBe(before);
    // Insertion order: typecheck landed first, then test. getVerifications
    // returns newest-first, so the digest reverses to insertion order.
    expect(after).toMatch(/\|v:typecheck:passed,test:passed$/);
  });

  it("a verification-only turn resets the consecutive nudge counter (regression for the stall)", () => {
    const check = createNudgeRateLimitCheck(baseCtx, cfg({ cap: 2 })).check;
    const sess = "sess-verify-reset";

    expect(check(baseCtx, sess).allowed).toBe(true);
    recordNudge(baseCtx, sess, "default");
    expect(__getNudgeRateLimitState(sess)?.count).toBe(1);

    advanceTime(2_000);

    // Same fingerprint, second nudge — counter climbs toward the cap.
    expect(check(baseCtx, sess).allowed).toBe(true);
    recordNudge(baseCtx, sess, "default");
    expect(__getNudgeRateLimitState(sess)?.count).toBe(2);

    advanceTime(4_000);

    // Without the fix, a third check at the same fingerprint would be
    // abandoned (count >= cap). A verification-only turn moves the
    // fingerprint, so the counter resets and the session gets a fresh
    // budget instead of being abandoned.
    const waveId = baseCtx.db.getWave("default", 3)?.id ?? 1;
    baseCtx.db.insertVerification("default", {
      wave_id: waveId,
      check_name: "test",
      status: "passed",
    });

    const after = check(baseCtx, sess);
    expect(after.allowed).toBe(true);
    expect(__getNudgeRateLimitState(sess)?.count).toBe(0);
  });

  it("kill switch produces zero SDK calls", () => {
    const check = createNudgeRateLimitCheck(baseCtx, cfg({ enabled: false })).check;
    const promptAsync = mock(async () => undefined);
    Object.assign(baseCtx.sdk.client, { session: { promptAsync } });

    const result = check(baseCtx, "sess-off");
    expect(result.allowed).toBe(false);
    expect(promptAsync).not.toHaveBeenCalled();
  });

  it("writes chronicle and ADL entries per fired nudge", () => {
    const check = createNudgeRateLimitCheck(baseCtx, cfg()).check;
    const sess = "sess-audit-fired";

    expect(check(baseCtx, sess).allowed).toBe(true);
    recordNudge(baseCtx, sess, "default");

    const chronicle = baseCtx.db.getChronicleEvents("default");
    expect(chronicle.length).toBeGreaterThanOrEqual(1);
    expect(chronicle.some((e) => e.entry.includes("fired"))).toBe(true);
    expect(chronicle.some((e) => e.entry.includes(sess))).toBe(true);

    const docs = baseCtx.db.getDocument("default", "chronicle");
    expect(docs?.content).toContain("fired");
    expect(docs?.content).toContain(sess);

    const adl = baseCtx.stateManager.getADL();
    expect(adl).toContain("Dispatched lazy-autopilot nudge");
  });

  it("writes chronicle and ADL entries per abandonment", () => {
    const check = createNudgeRateLimitCheck(baseCtx, cfg({ cap: 1 })).check;
    const sess = "sess-audit-abandon";

    expect(check(baseCtx, sess).allowed).toBe(true);
    recordNudge(baseCtx, sess, "default");
    advanceTime(2_000);

    const denied = check(baseCtx, sess);
    expect(denied.allowed).toBe(false);
    expect(denied.abandoned).toBe(true);

    const chronicle = baseCtx.db.getChronicleEvents("default");
    expect(chronicle.some((e) => e.entry.includes("abandoned"))).toBe(true);

    const adl = baseCtx.stateManager.getADL();
    expect(adl).toContain("Stopped autonomous continuation");
  });

  it("a throwing chronicle write does not propagate", () => {
    const db = new Proxy(baseCtx.db, {
      get(target, prop) {
        if (prop === "appendChronicleEvent") {
          return (_workflowId: string, _entry: string): number => {
            throw new Error("chronicle boom");
          };
        }
        return Reflect.get(target, prop);
      },
    });
    const ctx: PluginContext = {
      ...baseCtx,
      db: db as unknown as PluginContext["db"],
    };

    const check = createNudgeRateLimitCheck(ctx, cfg()).check;
    const sess = "sess-throw";

    expect(check(ctx, sess).allowed).toBe(true);
    expect(() => recordNudge(ctx, sess, "default")).not.toThrow();
  });

  it("clears per-session state on lifecycle cleanup", () => {
    const check = createNudgeRateLimitCheck(baseCtx, cfg()).check;
    const sess = "sess-cleanup";

    expect(check(baseCtx, sess).allowed).toBe(true);
    recordNudge(baseCtx, sess, "default");
    expect(__getNudgeRateLimitState(sess)).toBeDefined();

    clearNudgeRateLimitState(sess);
    expect(__getNudgeRateLimitState(sess)).toBeUndefined();
  });
});
