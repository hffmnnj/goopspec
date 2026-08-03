import { mkdirSync, symlinkSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { WORKFLOW_PHASES } from "../../core/constants.js";
import { createMockPluginContext, setupTestEnvironment } from "../../test-utils.js";
import {
  ALLOWED,
  type NudgeGuardInput,
  type NudgeGuardResult,
  type NudgeRateLimitCheck,
  evaluateNudgeGuards,
} from "./guards.js";

describe("lazy autopilot nudge guards", () => {
  let cleanup: () => void;
  let testDir: string;

  beforeEach(() => {
    const env = setupTestEnvironment("lazy-autopilot-nudge-guards");
    cleanup = env.cleanup;
    testDir = env.testDir;
  });

  afterEach(() => cleanup());

  function baseInput(overrides: Partial<NudgeGuardInput> = {}): NudgeGuardInput {
    return {
      sessionID: "sess-1",
      session: {
        status: "available",
        directory: testDir,
      },
      workflowId: "default",
      phase: "execute",
      lazyAutopilot: true,
      acceptanceConfirmed: false,
      agent: { status: "known", agent: "goop-orchestrator" },
      lastMessages: [{ info: { role: "assistant" }, text: "ready" }],
      lastAssistantText: "ready",
      killSwitch: true,
      ...overrides,
    };
  }

  it("G1: suppresses when lazyAutopilot is disabled", () => {
    const ctx = createMockPluginContext({ testDir });
    const result = evaluateNudgeGuards(ctx, baseInput({ lazyAutopilot: false }));

    expect(result.suppressed).toBe(true);
    expect(result.reason).toEqual({ kind: "lazy-autopilot-disabled" });
  });

  it("G2: suppresses when phase is not execute", () => {
    const ctx = createMockPluginContext({ testDir });
    const result = evaluateNudgeGuards(ctx, baseInput({ phase: "plan" }));

    expect(result.suppressed).toBe(true);
    expect(result.reason).toEqual({ kind: "wrong-phase", phase: "plan" });
  });

  // -------------------------------------------------------------------------
  // G2 phase-eligibility pin (SPEC Decision 1, settled under Rule 4).
  // Execute is the only phase where autonomous nudging is safe; every other
  // WorkflowPhase may be waiting on a deliberate user gate (discuss/plan/
  // accept) or have no active workflow (idle). Parameterising over
  // WORKFLOW_PHASES means any future silent widening — adding a new allowed
  // phase or flipping an existing one to pass — fails this test in CI.
  // -------------------------------------------------------------------------

  for (const phase of WORKFLOW_PHASES) {
    if (phase === "execute") {
      it(`G2 pin: allows the nudge in the ${phase} phase`, () => {
        const ctx = createMockPluginContext({ testDir });
        const result = evaluateNudgeGuards(ctx, baseInput({ phase }));
        expect(result).toEqual(ALLOWED);
      });
    } else {
      it(`G2 pin: suppresses the nudge in the ${phase} phase with a typed wrong-phase reason`, () => {
        const ctx = createMockPluginContext({ testDir });
        const result = evaluateNudgeGuards(ctx, baseInput({ phase }));
        expect(result.suppressed).toBe(true);
        expect(result.reason).toEqual({ kind: "wrong-phase", phase });
      });
    }
  }

  it("G3: suppresses when a compaction is queued", () => {
    const ctx = createMockPluginContext({ testDir });
    ctx.pendingCompactions.set("sess-1", {
      model: { providerID: "opencode", modelID: "deepseek-v4" },
      status: "queued",
      queuedAtMs: Date.now(),
    });

    const result = evaluateNudgeGuards(ctx, baseInput());

    expect(result.suppressed).toBe(true);
    expect(result.reason).toEqual({ kind: "pending-compaction", status: "queued" });
  });

  it("G3: suppresses when a compaction is in-flight", () => {
    const ctx = createMockPluginContext({ testDir });
    ctx.pendingCompactions.set("sess-1", {
      model: { providerID: "opencode", modelID: "deepseek-v4" },
      status: "in-flight",
      queuedAtMs: Date.now(),
    });

    const result = evaluateNudgeGuards(ctx, baseInput());

    expect(result.suppressed).toBe(true);
    expect(result.reason).toEqual({ kind: "pending-compaction", status: "in-flight" });
  });

  it("regression: allows an execute-phase workflow before acceptance is confirmed", () => {
    const ctx = createMockPluginContext({ testDir });
    const result = evaluateNudgeGuards(ctx, baseInput({ acceptanceConfirmed: false }));

    expect(result.suppressed).toBe(false);
    expect(result.reason).toBeNull();
  });

  it("accepts top-level session metadata with no parentID", () => {
    const ctx = createMockPluginContext({ testDir });
    const result = evaluateNudgeGuards(
      ctx,
      baseInput({
        session: { status: "available", directory: testDir },
      }),
    );

    expect(result).toEqual(ALLOWED);
  });

  it("G2a: suppresses a session whose metadata lookup is unavailable", () => {
    const ctx = createMockPluginContext({ testDir });
    const result = evaluateNudgeGuards(
      ctx,
      baseInput({
        session: { status: "unavailable", reason: "get-failed" },
      }),
    );

    expect(result).toEqual({
      suppressed: true,
      reason: {
        kind: "session-not-nudge-eligible",
        reason: "metadata-unavailable",
        detail: "get-failed",
      },
    });
  });

  it("G2a: suppresses a subagent session", () => {
    const ctx = createMockPluginContext({ testDir });
    const result = evaluateNudgeGuards(
      ctx,
      baseInput({
        session: {
          status: "available",
          parentID: "parent-session",
          directory: "/workspace/other-project",
        },
      }),
    );

    expect(result).toEqual({
      suppressed: true,
      reason: {
        kind: "session-not-nudge-eligible",
        reason: "subagent",
        detail: "parent-session",
      },
    });
  });

  it("G2b: suppresses a session outside the plugin project", () => {
    const ctx = createMockPluginContext({ testDir });
    const result = evaluateNudgeGuards(
      ctx,
      baseInput({
        session: { status: "available", directory: "/workspace/other-project" },
      }),
    );

    expect(result).toEqual({
      suppressed: true,
      reason: {
        kind: "project-scope-unverified",
        reason: "directory-mismatch",
        sessionDirectory: "/workspace/other-project",
        projectDirectory: testDir,
      },
    });
  });

  it("G2b: normalizes trailing separators before comparing project directories", () => {
    const ctx = createMockPluginContext({ testDir });
    const result = evaluateNudgeGuards(
      ctx,
      baseInput({
        session: { status: "available", directory: `${testDir}/` },
      }),
    );

    expect(result).toEqual(ALLOWED);
  });

  it("G2b: fails closed when the plugin directory is unavailable at runtime", () => {
    const ctx = createMockPluginContext({ testDir });
    (ctx.sdk as { directory?: string }).directory = undefined;

    const result = evaluateNudgeGuards(ctx, baseInput());

    expect(result).toEqual({
      suppressed: true,
      reason: {
        kind: "project-scope-unverified",
        reason: "sdk-directory-unavailable",
        sessionDirectory: testDir,
      },
    });
  });

  // -------------------------------------------------------------------------
  // T3: Distinct unavailable reasons for G2a (fail-closed coverage).
  // T2 covered get-failed; get-unavailable and invalid-response are the
  // remaining two branches of the NudgeSessionMetadata discriminated union.
  // -------------------------------------------------------------------------

  it("G2a: suppresses with get-unavailable reason when session.get is absent on the host", () => {
    const ctx = createMockPluginContext({ testDir });
    const result = evaluateNudgeGuards(
      ctx,
      baseInput({
        session: { status: "unavailable", reason: "get-unavailable" },
      }),
    );

    expect(result).toEqual({
      suppressed: true,
      reason: {
        kind: "session-not-nudge-eligible",
        reason: "metadata-unavailable",
        detail: "get-unavailable",
      },
    });
  });

  it("G2a: suppresses with invalid-response reason when session.get returns non-directory data", () => {
    const ctx = createMockPluginContext({ testDir });
    const result = evaluateNudgeGuards(
      ctx,
      baseInput({
        session: { status: "unavailable", reason: "invalid-response" },
      }),
    );

    expect(result).toEqual({
      suppressed: true,
      reason: {
        kind: "session-not-nudge-eligible",
        reason: "metadata-unavailable",
        detail: "invalid-response",
      },
    });
  });

  // -------------------------------------------------------------------------
  // T3: Canonicalisation positive test — proves realpathSync.native resolves
  // symlink aliases so a legitimate same-project session is not suppressed.
  // On hosts where the temp dir is a symlink (e.g. macOS /tmp → /private/tmp),
  // a session reporting the symlinked path must still match the plugin's
  // resolved directory. This test cannot fail against pre-T2 code (there was
  // no directory check), but it guards against a regression in T2's
  // canonicalisation logic that would silently suppress legitimate sessions.
  // -------------------------------------------------------------------------

  it("G2b: canonicalises a symlinked session directory to match the real plugin directory", () => {
    const realDir = join(testDir, "real-project");
    const symlinkDir = join(testDir, "symlink-project");
    mkdirSync(realDir, { recursive: true });
    symlinkSync(realDir, symlinkDir);

    const ctx = createMockPluginContext({ testDir: realDir });
    const result = evaluateNudgeGuards(
      ctx,
      baseInput({
        session: { status: "available", directory: symlinkDir },
      }),
    );

    expect(result).toEqual(ALLOWED);
  });

  // -------------------------------------------------------------------------
  // Agent identity guard matrix (Wave 2 Task 2.3). Table-driven proof of the
  // eligibility boundary introduced by Task 2.1. The guard sits after the
  // G2a subagent check and before the G2b directory check. Fails closed: an
  // indeterminate identity is suppressed identically to a known-wrong one,
  // because the dispatch body force-sets agent: 'goop-orchestrator' and would
  // otherwise hijack an innocent session's agent.
  //
  // isOrchestrator() (../utils.js) matches three naming patterns via
  // case-insensitive substring: "orchestrator", "goop-orchestrator",
  // "goopspec-orchestrator". Every other known agent — including all sibling
  // GoopSpec roles and arbitrary user-defined agents — is suppressed with
  // reason "not-orchestrator" and the observed name for diagnosis. An
  // indeterminate identity (status "unknown" or the field absent entirely)
  // is suppressed with reason "unknown".
  // -------------------------------------------------------------------------

  const agentIdentityCases: Array<{
    label: string;
    agent: NudgeGuardInput["agent"];
    expected: NudgeGuardResult;
  }> = [
    // Allowed: the three orchestrator naming patterns isOrchestrator() matches.
    {
      label: "goop-orchestrator",
      agent: { status: "known", agent: "goop-orchestrator" },
      expected: ALLOWED,
    },
    {
      label: "orchestrator",
      agent: { status: "known", agent: "orchestrator" },
      expected: ALLOWED,
    },
    {
      label: "goopspec-orchestrator",
      agent: { status: "known", agent: "goopspec-orchestrator" },
      expected: ALLOWED,
    },
    // Suppressed: known non-orchestrator GoopSpec agent roles.
    {
      label: "goop-planner",
      agent: { status: "known", agent: "goop-planner" },
      expected: {
        suppressed: true,
        reason: { kind: "agent-not-eligible", reason: "not-orchestrator", agent: "goop-planner" },
      },
    },
    {
      label: "goop-executor-high",
      agent: { status: "known", agent: "goop-executor-high" },
      expected: {
        suppressed: true,
        reason: {
          kind: "agent-not-eligible",
          reason: "not-orchestrator",
          agent: "goop-executor-high",
        },
      },
    },
    {
      label: "goop-executor-frontend-medium",
      agent: { status: "known", agent: "goop-executor-frontend-medium" },
      expected: {
        suppressed: true,
        reason: {
          kind: "agent-not-eligible",
          reason: "not-orchestrator",
          agent: "goop-executor-frontend-medium",
        },
      },
    },
    {
      label: "goop-researcher",
      agent: { status: "known", agent: "goop-researcher" },
      expected: {
        suppressed: true,
        reason: {
          kind: "agent-not-eligible",
          reason: "not-orchestrator",
          agent: "goop-researcher",
        },
      },
    },
    {
      label: "goop-verifier",
      agent: { status: "known", agent: "goop-verifier" },
      expected: {
        suppressed: true,
        reason: { kind: "agent-not-eligible", reason: "not-orchestrator", agent: "goop-verifier" },
      },
    },
    {
      label: "goop-explorer",
      agent: { status: "known", agent: "goop-explorer" },
      expected: {
        suppressed: true,
        reason: { kind: "agent-not-eligible", reason: "not-orchestrator", agent: "goop-explorer" },
      },
    },
    // Suppressed: arbitrary user-defined agent name.
    {
      label: "user-defined agent",
      agent: { status: "known", agent: "my-custom-helper" },
      expected: {
        suppressed: true,
        reason: {
          kind: "agent-not-eligible",
          reason: "not-orchestrator",
          agent: "my-custom-helper",
        },
      },
    },
    // Suppressed: indeterminate identity — fail closed (reason "unknown").
    {
      label: "indeterminate (status unknown)",
      agent: { status: "unknown" },
      expected: {
        suppressed: true,
        reason: { kind: "agent-not-eligible", reason: "unknown" },
      },
    },
    {
      label: "absent (undefined)",
      agent: undefined,
      expected: {
        suppressed: true,
        reason: { kind: "agent-not-eligible", reason: "unknown" },
      },
    },
  ];

  for (const { label, agent, expected } of agentIdentityCases) {
    it(`agent identity guard matrix: ${label} → ${expected.suppressed ? "suppressed" : "allowed"}`, () => {
      const ctx = createMockPluginContext({ testDir });
      const result = evaluateNudgeGuards(ctx, baseInput({ agent }));
      expect(result).toEqual(expected);
    });
  }

  it("G5: suppresses when an unresolved high-severity blocker exists", () => {
    const ctx = createMockPluginContext({ testDir });
    ctx.db.upsertBlocker("default", {
      description: "need operator input",
      severity: "high",
      status: "open",
    });

    const result = evaluateNudgeGuards(ctx, baseInput());

    expect(result.suppressed).toBe(true);
    const reason = result.reason as { kind: "high-severity-blocker"; blockerId: number };
    expect(reason.kind).toBe("high-severity-blocker");
    expect(typeof reason.blockerId).toBe("number");
    expect(reason.blockerId).toBeGreaterThan(0);
  });

  it("G5: ignores low-severity blockers", () => {
    const ctx = createMockPluginContext({ testDir });
    ctx.db.upsertBlocker("default", {
      description: "low priority",
      severity: "low",
      status: "open",
    });

    const result = evaluateNudgeGuards(ctx, baseInput());

    expect(result.suppressed).toBe(false);
  });

  it("G6: suppresses on credentials hard-stop question", () => {
    const ctx = createMockPluginContext({ testDir });
    const result = evaluateNudgeGuards(
      ctx,
      baseInput({
        lastAssistantText: "Please provide your API key so I can continue.",
      }),
    );

    expect(result.suppressed).toBe(true);
    expect(result.reason).toEqual({ kind: "hard-stop-question", category: "credentials" });
  });

  it("G6: suppresses on destructive hard-stop question", () => {
    const ctx = createMockPluginContext({ testDir });
    const result = evaluateNudgeGuards(
      ctx,
      baseInput({
        lastAssistantText: "Shall I delete the production database? This is irreversible.",
      }),
    );

    expect(result.suppressed).toBe(true);
    expect(result.reason).toEqual({ kind: "hard-stop-question", category: "destructive" });
  });

  it("G6: destructive takes precedence when both patterns match", () => {
    const ctx = createMockPluginContext({ testDir });
    const result = evaluateNudgeGuards(
      ctx,
      baseInput({
        lastAssistantText: "Delete the production database and remove the API key?",
      }),
    );

    expect(result.suppressed).toBe(true);
    expect(result.reason).toEqual({ kind: "hard-stop-question", category: "destructive" });
  });

  it("G7: suppresses when the last message is not from the assistant", () => {
    const ctx = createMockPluginContext({ testDir });
    const result = evaluateNudgeGuards(
      ctx,
      baseInput({ lastMessages: [{ info: { role: "user" }, text: "hello" }] }),
    );

    expect(result.suppressed).toBe(true);
    expect(result.reason).toEqual({ kind: "mid-work", lastRole: "user" });
  });

  it("G7: handles unknown last role from an empty messages array", () => {
    const ctx = createMockPluginContext({ testDir });
    const result = evaluateNudgeGuards(ctx, baseInput({ lastMessages: [] }));

    expect(result.suppressed).toBe(true);
    expect(result.reason).toEqual({ kind: "mid-work", lastRole: "unknown" });
  });

  it("G8: suppresses when rate-limit check denies the nudge", () => {
    const ctx = createMockPluginContext({ testDir });
    const rateLimitCheck: NudgeRateLimitCheck = {
      check: () => ({ allowed: false, reason: "cooldown active" }),
    };

    const result = evaluateNudgeGuards(ctx, baseInput({ rateLimitCheck }));

    expect(result.suppressed).toBe(true);
    expect(result.reason).toEqual({ kind: "rate-limited", detail: "cooldown active" });
  });

  it("G8: reports repeated promptAsync failures with a typed suppression reason", () => {
    const ctx = createMockPluginContext({ testDir });
    const rateLimitCheck: NudgeRateLimitCheck = {
      check: () => ({
        allowed: false,
        reason: "reached 3 consecutive promptAsync failures",
        consecutiveDispatchFailures: 3,
        maxConsecutiveDispatchFailures: 3,
      }),
    };

    const result = evaluateNudgeGuards(ctx, baseInput({ rateLimitCheck }));

    expect(result.suppressed).toBe(true);
    expect(result.reason).toEqual({ kind: "dispatch-failure-cap", failures: 3, cap: 3 });
  });

  it("G8: default rate-limit check allows the nudge", () => {
    const ctx = createMockPluginContext({ testDir });
    const result = evaluateNudgeGuards(ctx, baseInput());

    expect(result.suppressed).toBe(false);
  });

  it("G9: suppresses when the kill switch is off", () => {
    const ctx = createMockPluginContext({ testDir });
    const result = evaluateNudgeGuards(ctx, baseInput({ killSwitch: false }));

    expect(result.suppressed).toBe(true);
    expect(result.reason).toEqual({ kind: "kill-switch-off" });
  });

  it("positive path: allows the nudge when all nine guards pass", () => {
    const ctx = createMockPluginContext({ testDir });
    const result = evaluateNudgeGuards(ctx, baseInput());

    expect(result.suppressed).toBe(false);
    expect(result.reason).toBeNull();
    expect(result).toEqual(ALLOWED);
  });

  it("biases toward over-suppression when blocker state is ambiguous", () => {
    const ctx = createMockPluginContext({ testDir });
    ctx.db.upsertBlocker("default", {
      description: "critical infra",
      severity: "critical",
      status: "open",
    });

    const result = evaluateNudgeGuards(ctx, baseInput());

    expect(result.suppressed).toBe(true);
    expect(result.reason?.kind).toBe("high-severity-blocker");
  });

  it("returns the first suppression reason when multiple guards would fail", () => {
    const ctx = createMockPluginContext({ testDir });
    ctx.pendingCompactions.set("sess-1", {
      model: { providerID: "opencode", modelID: "deepseek-v4" },
      status: "queued",
      queuedAtMs: Date.now(),
    });

    const result = evaluateNudgeGuards(
      ctx,
      baseInput({
        lazyAutopilot: false,
        phase: "plan",
        acceptanceConfirmed: false,
      }),
    );

    expect(result.suppressed).toBe(true);
    expect(result.reason).toEqual({ kind: "lazy-autopilot-disabled" });
  });
});
