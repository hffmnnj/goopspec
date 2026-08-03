import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import type { PluginContext } from "../core/types.js";
import type { GoopSpecDB } from "../features/db/index.js";
import type { TaskStatus, VerificationStatus, WaveStatus } from "../features/db/types.js";
import { createStateManager } from "../features/state-manager/index.js";
import {
  createDefaultWorkflowState,
  createMockPluginContext,
  createMockToolContext,
  setupTestEnvironment,
} from "../test-utils.js";
import { createGoopStateTool } from "../tools/goop-state/index.js";
import { createAutoProgressionHook } from "./auto-progression.js";
import type { Hooks } from "./types.js";

type ToolAfterInput = { tool: string; sessionID: string; callID: string; args: unknown };
type ToolAfterOutput = { title: string; output: string; metadata: unknown };

function makeInput(tool = "goop_state"): ToolAfterInput {
  return { tool, sessionID: "s1", callID: "c1", args: {} };
}

function makeOutput(text = "ok"): ToolAfterOutput {
  return { title: "result", output: text, metadata: {} };
}

/**
 * Seeds a final wave row (and optional tasks/verification row). `verificationStatus`
 * is omitted by default; tests expecting a successful execute→accept transition
 * must pass `"passed"` or `"skipped"` explicitly.
 */
function seedFinalWave(
  ctx: PluginContext,
  waveNumber: number,
  status: WaveStatus,
  taskStatuses: TaskStatus[] = [],
  verificationStatus?: VerificationStatus,
): void {
  const workflowId = ctx.stateManager.getActiveWorkflowId();
  ctx.db.upsertWave(workflowId, { wave_number: waveNumber, status });
  const wave = ctx.db.getWave(workflowId, waveNumber);
  if (!wave) throw new Error("Failed to seed final wave");

  for (const [index, taskStatus] of taskStatuses.entries()) {
    ctx.db.upsertWaveTask({
      wave_id: wave.id,
      workflow_id: workflowId,
      task_index: index + 1,
      status: taskStatus,
    });
  }

  if (verificationStatus !== undefined) {
    ctx.db.insertVerification(workflowId, {
      wave_id: wave.id,
      check_name: "test",
      status: verificationStatus,
    });
  }
}

describe("auto-progression hook", () => {
  let cleanup: () => void;
  let testDir: string;

  beforeEach(() => {
    const env = setupTestEnvironment("auto-prog");
    cleanup = env.cleanup;
    testDir = env.testDir;
  });

  afterEach(() => cleanup());

  // -----------------------------------------------------------------------
  // 1. Progresses execute → accept with final-wave completion evidence
  // -----------------------------------------------------------------------

  it("does not transition when the final wave is pending despite matching counters", async () => {
    const ctx = createMockPluginContext({
      testDir,
      state: {
        workflows: {
          default: createDefaultWorkflowState({
            phase: "execute",
            currentWave: 3,
            totalWaves: 3,
            specLocked: true,
          }),
        },
      },
    });
    seedFinalWave(ctx, 3, "pending");

    const hooks = createAutoProgressionHook(ctx);
    const handler = hooks["tool.execute.after"] as NonNullable<Hooks["tool.execute.after"]>;
    const output = makeOutput();

    await handler(makeInput(), output);

    expect(ctx.stateManager.getActiveWorkflow().phase).toBe("execute");
    expect(output.output).toBe("ok");
  });

  it("transitions when the final wave and all of its tasks are complete", async () => {
    const ctx = createMockPluginContext({
      testDir,
      state: {
        workflows: {
          default: createDefaultWorkflowState({
            phase: "execute",
            currentWave: 3,
            totalWaves: 3,
            specLocked: true,
          }),
        },
      },
    });
    seedFinalWave(ctx, 3, "completed", ["done", "completed"], "passed");

    const hooks = createAutoProgressionHook(ctx);
    const handler = hooks["tool.execute.after"] as NonNullable<Hooks["tool.execute.after"]>;
    const output = makeOutput();

    await handler(makeInput(), output);

    expect(ctx.stateManager.getActiveWorkflow().phase).toBe("accept");
    expect(output.output).toContain("2/2 tasks complete");
  });

  // -----------------------------------------------------------------------
  // 2. Final-wave evidence is independent of currentWave
  // -----------------------------------------------------------------------

  it("transitions when final-wave evidence is complete even if currentWave lags", async () => {
    const ctx = createMockPluginContext({
      testDir,
      state: {
        workflows: {
          default: createDefaultWorkflowState({
            phase: "execute",
            currentWave: 2,
            totalWaves: 5,
            specLocked: true,
          }),
        },
      },
    });
    seedFinalWave(ctx, 5, "completed", ["completed"], "passed");

    const hooks = createAutoProgressionHook(ctx);
    const handler = hooks["tool.execute.after"] as NonNullable<Hooks["tool.execute.after"]>;
    const output = makeOutput();

    await handler(makeInput(), output);

    expect(ctx.stateManager.getActiveWorkflow().phase).toBe("accept");
  });

  // -----------------------------------------------------------------------
  // 3. Does NOT re-progress when already in accept phase
  // -----------------------------------------------------------------------

  it("does NOT re-progress when already in accept phase", async () => {
    const ctx = createMockPluginContext({
      testDir,
      state: {
        workflows: {
          default: createDefaultWorkflowState({
            phase: "accept",
            currentWave: 3,
            totalWaves: 3,
            specLocked: true,
          }),
        },
      },
    });
    seedFinalWave(ctx, 3, "completed", ["completed"]);

    const hooks = createAutoProgressionHook(ctx);
    const handler = hooks["tool.execute.after"] as NonNullable<Hooks["tool.execute.after"]>;
    const output = makeOutput();

    await handler(makeInput(), output);

    // Phase stays accept — no double-transition
    expect(ctx.stateManager.getActiveWorkflow().phase).toBe("accept");
    expect(output.output).toBe("ok");
  });

  it("honors a forced accept-to-execute correction until explicitly cleared", async () => {
    const ctx = createMockPluginContext({
      testDir,
      state: {
        workflows: {
          default: createDefaultWorkflowState({
            phase: "accept",
            currentWave: 3,
            totalWaves: 3,
            specLocked: true,
          }),
        },
      },
    });
    seedFinalWave(ctx, 3, "completed", ["completed"], "passed");
    const stateTool = createGoopStateTool(ctx);
    await stateTool.execute(
      { action: "transition", phase: "execute", force: true },
      createMockToolContext(),
    );

    const hooks = createAutoProgressionHook(ctx);
    const handler = hooks["tool.execute.after"] as NonNullable<Hooks["tool.execute.after"]>;

    await handler(makeInput(), makeOutput());
    await handler(makeInput(), makeOutput());

    expect(ctx.stateManager.getActiveWorkflow().phase).toBe("execute");
    expect(ctx.stateManager.getActiveWorkflow().manualOverride).toBe(true);

    await stateTool.execute({ action: "clear-manual-override" }, createMockToolContext());
    await handler(makeInput(), makeOutput());

    expect(ctx.stateManager.getActiveWorkflow().phase).toBe("accept");
  });

  // -----------------------------------------------------------------------
  // 4. Graceful on error — never throws
  // -----------------------------------------------------------------------

  it("does not throw when stateManager.transitionPhase throws", async () => {
    const ctx = createMockPluginContext({
      testDir,
      state: {
        workflows: {
          default: createDefaultWorkflowState({
            phase: "execute",
            currentWave: 3,
            totalWaves: 3,
          }),
        },
      },
    });
    seedFinalWave(ctx, 3, "completed", ["done", "completed"], "passed");

    // Force transitionPhase to throw
    const originalTransition = ctx.stateManager.transitionPhase;
    (ctx.stateManager as { transitionPhase: typeof originalTransition }).transitionPhase = () => {
      throw new Error("simulated failure");
    };

    const consoleSpy = spyOn(console, "error").mockImplementation(() => {});

    const hooks = createAutoProgressionHook(ctx);
    const handler = hooks["tool.execute.after"] as NonNullable<Hooks["tool.execute.after"]>;
    const output = makeOutput();

    // Should not throw — safeHandler catches
    await handler(makeInput(), output);

    // Phase unchanged since transition failed
    expect(ctx.stateManager.getActiveWorkflow().phase).toBe("execute");
    consoleSpy.mockRestore();
  });

  // -----------------------------------------------------------------------
  // 5. Ignores when totalWaves = 0 (uninitialised)
  // -----------------------------------------------------------------------

  it("ignores when totalWaves is 0", async () => {
    const ctx = createMockPluginContext({
      testDir,
      state: {
        workflows: {
          default: createDefaultWorkflowState({
            phase: "execute",
            currentWave: 0,
            totalWaves: 0,
          }),
        },
      },
    });
    const hooks = createAutoProgressionHook(ctx);
    const handler = hooks["tool.execute.after"] as NonNullable<Hooks["tool.execute.after"]>;
    const output = makeOutput();

    await handler(makeInput(), output);

    expect(ctx.stateManager.getActiveWorkflow().phase).toBe("execute");
    expect(output.output).toBe("ok");
  });

  // -----------------------------------------------------------------------
  // 6. Ignores non-execute phases (idle, plan, discuss)
  // -----------------------------------------------------------------------

  it("ignores when phase is not execute", async () => {
    for (const phase of ["idle", "plan", "discuss"] as const) {
      const ctx = createMockPluginContext({
        testDir,
        state: {
          workflows: {
            default: createDefaultWorkflowState({
              phase,
              currentWave: 3,
              totalWaves: 3,
            }),
          },
        },
      });

      const hooks = createAutoProgressionHook(ctx);
      const handler = hooks["tool.execute.after"] as NonNullable<Hooks["tool.execute.after"]>;
      const output = makeOutput();

      await handler(makeInput(), output);

      expect(ctx.stateManager.getActiveWorkflow().phase).toBe(phase);
    }
  });

  // -----------------------------------------------------------------------
  // 7. ADL entry is appended on successful progression
  // -----------------------------------------------------------------------

  it("appends ADL entry on successful progression", async () => {
    const ctx = createMockPluginContext({
      testDir,
      state: {
        workflows: {
          default: createDefaultWorkflowState({
            phase: "execute",
            currentWave: 4,
            totalWaves: 4,
            specLocked: true,
          }),
        },
      },
    });
    seedFinalWave(ctx, 4, "completed", ["done", "completed"], "passed");

    const hooks = createAutoProgressionHook(ctx);
    const handler = hooks["tool.execute.after"] as NonNullable<Hooks["tool.execute.after"]>;

    await handler(makeInput(), makeOutput());

    const adl = ctx.stateManager.getADL();
    expect(adl).toContain("Auto-progression");
    expect(adl).toContain("accept");
    expect(adl).toContain("Final wave 4 status: completed");
    expect(adl).toContain("task completion: 2/2");
    expect(adl).not.toContain("All 4 waves complete");
  });
});

// -----------------------------------------------------------------------
// 8. Wave verification gate: task completion alone is not sufficient
// -----------------------------------------------------------------------

describe("auto-progression hook: wave verification gate", () => {
  let cleanup: () => void;
  let testDir: string;

  beforeEach(() => {
    const env = setupTestEnvironment("auto-prog-verify");
    cleanup = env.cleanup;
    testDir = env.testDir;
  });

  afterEach(() => cleanup());

  function makeExecuteCtx(waveNumber: number): PluginContext {
    return createMockPluginContext({
      testDir,
      state: {
        workflows: {
          default: createDefaultWorkflowState({
            phase: "execute",
            currentWave: waveNumber,
            totalWaves: waveNumber,
            specLocked: true,
          }),
        },
      },
    });
  }

  it("does not progress when the final wave has zero verification rows despite complete tasks", async () => {
    const ctx = makeExecuteCtx(3);
    seedFinalWave(ctx, 3, "completed", ["done", "completed"]); // no verificationStatus

    const hooks = createAutoProgressionHook(ctx);
    const handler = hooks["tool.execute.after"] as NonNullable<Hooks["tool.execute.after"]>;
    const output = makeOutput();
    await handler(makeInput(), output);

    expect(ctx.stateManager.getActiveWorkflow().phase).toBe("execute");
    expect(output.output).toContain("Blocked: execute → accept");
    expect(output.output).toContain("goop-wave-verifier");
  });

  it("does not progress when the final wave's only verification row is failed", async () => {
    const ctx = makeExecuteCtx(3);
    seedFinalWave(ctx, 3, "completed", ["done", "completed"], "failed");

    const hooks = createAutoProgressionHook(ctx);
    const handler = hooks["tool.execute.after"] as NonNullable<Hooks["tool.execute.after"]>;
    const output = makeOutput();
    await handler(makeInput(), output);

    expect(ctx.stateManager.getActiveWorkflow().phase).toBe("execute");
    expect(output.output).toContain("goop-wave-verifier");
  });

  it("does not progress when the final wave has mixed passing and failing verification rows", async () => {
    const ctx = makeExecuteCtx(3);
    seedFinalWave(ctx, 3, "completed", ["done", "completed"]);
    const workflowId = ctx.stateManager.getActiveWorkflowId();
    const wave = ctx.db.getWave(workflowId, 3);
    if (!wave) throw new Error("wave not seeded");
    ctx.db.insertVerification(workflowId, {
      wave_id: wave.id,
      check_name: "typecheck",
      status: "passed",
    });
    ctx.db.insertVerification(workflowId, {
      wave_id: wave.id,
      check_name: "test",
      status: "failed",
    });

    const hooks = createAutoProgressionHook(ctx);
    const handler = hooks["tool.execute.after"] as NonNullable<Hooks["tool.execute.after"]>;
    const output = makeOutput();
    await handler(makeInput(), output);

    expect(ctx.stateManager.getActiveWorkflow().phase).toBe("execute");
  });

  it("progresses when the final wave has an explicit skip verification row (no pass required)", async () => {
    const ctx = makeExecuteCtx(3);
    seedFinalWave(ctx, 3, "completed", ["done", "completed"], "skipped");

    const hooks = createAutoProgressionHook(ctx);
    const handler = hooks["tool.execute.after"] as NonNullable<Hooks["tool.execute.after"]>;
    const output = makeOutput();
    await handler(makeInput(), output);

    expect(ctx.stateManager.getActiveWorkflow().phase).toBe("accept");
  });

  it("progresses when the final wave has a passing verification row", async () => {
    const ctx = makeExecuteCtx(3);
    seedFinalWave(ctx, 3, "completed", ["done", "completed"], "passed");

    const hooks = createAutoProgressionHook(ctx);
    const handler = hooks["tool.execute.after"] as NonNullable<Hooks["tool.execute.after"]>;
    const output = makeOutput();
    await handler(makeInput(), output);

    expect(ctx.stateManager.getActiveWorkflow().phase).toBe("accept");
  });

  it("a later passing row does not erase an earlier failing row — the wave stays blocked (append-only rows)", async () => {
    const ctx = makeExecuteCtx(3);
    seedFinalWave(ctx, 3, "completed", ["done", "completed"], "failed");
    const workflowId = ctx.stateManager.getActiveWorkflowId();
    const wave = ctx.db.getWave(workflowId, 3);
    if (!wave) throw new Error("wave not seeded");
    // Record a later passing row for a different check — verifications are
    // append-only (no upsert), so this does not supersede the earlier failure.
    ctx.db.insertVerification(workflowId, {
      wave_id: wave.id,
      check_name: "test",
      status: "passed",
    });

    const hooks = createAutoProgressionHook(ctx);
    const handler = hooks["tool.execute.after"] as NonNullable<Hooks["tool.execute.after"]>;
    const output = makeOutput();
    await handler(makeInput(), output);

    expect(ctx.stateManager.getActiveWorkflow().phase).toBe("execute");
  });
});

// -----------------------------------------------------------------------
// 9. Caller-driven integration: goop_state update-wave → auto-progression
//
// These tests exercise the REAL caller path — goop_state tool → DB-backed
// StateManager → GoopSpecDB — rather than seeding cached state directly.
// This is the seam that let the original currentWave semantic collision
// (fn_20260730_p35gznz1) ship unnoticed: both the write side (goop_state
// update-wave) and the read side (auto-progression hook) were individually
// tested with the in-memory mock, but the connection between them was not.
// A test that seeds state directly does not close this gap.
// -----------------------------------------------------------------------

describe("caller-driven integration (goop_state update-wave → auto-progression hook)", () => {
  let cleanup: () => void;
  let testDir: string;
  let db: GoopSpecDB;

  beforeEach(() => {
    const env = setupTestEnvironment("caller-driven");
    cleanup = env.cleanup;
    testDir = env.testDir;
    db = env.db;
  });

  afterEach(() => cleanup());

  /**
   * Drive a fresh workflow to the execute phase via the real goop_state
   * tool, then call update-wave to set wave progress. Returns the
   * PluginContext wired to the REAL DB-backed StateManager — not the
   * in-memory mock that the other tests in this file use.
   */
  async function driveToExecute(currentWave: number, totalWaves: number): Promise<PluginContext> {
    const stateManager = createStateManager({ projectDir: testDir, db, workflowId: "default" });
    const ctx = createMockPluginContext({ testDir, db, stateManager });
    const stateTool = createGoopStateTool(ctx);
    await stateTool.execute({ action: "transition", phase: "discuss" }, createMockToolContext());
    await stateTool.execute({ action: "transition", phase: "plan" }, createMockToolContext());
    await stateTool.execute({ action: "lock-spec" }, createMockToolContext());
    await stateTool.execute({ action: "transition", phase: "execute" }, createMockToolContext());
    await stateTool.execute(
      { action: "update-wave", currentWave, totalWaves },
      createMockToolContext(),
    );
    return ctx;
  }

  it("reproduces fn_20260730_p35gznz1: update-wave to final wave with pending status and zero tasks does not auto-advance", async () => {
    // THE CALLER PATH: goop_state({action:"update-wave"}) writes
    // currentWave=5, totalWaves=5 through the real DB-backed StateManager.
    const ctx = await driveToExecute(5, 5);

    // The final wave row exists but is pending with zero tasks complete.
    seedFinalWave(ctx, 5, "pending");

    // Fire the auto-progression hook as a real tool.execute.after event.
    const hooks = createAutoProgressionHook(ctx);
    const handler = hooks["tool.execute.after"] as NonNullable<Hooks["tool.execute.after"]>;
    const output = makeOutput();
    await handler(makeInput(), output);

    // The phase MUST remain execute — the final wave is pending with 0 tasks.
    // Pre-fix, currentWave === totalWaves alone triggered the transition.
    expect(ctx.stateManager.getActiveWorkflow().phase).toBe("execute");
    expect(output.output).toBe("ok");
  });

  it("transitions to accept when the final wave and all tasks are complete via the caller path", async () => {
    const ctx = await driveToExecute(5, 5);
    seedFinalWave(ctx, 5, "completed", ["done", "completed"], "passed");

    const hooks = createAutoProgressionHook(ctx);
    const handler = hooks["tool.execute.after"] as NonNullable<Hooks["tool.execute.after"]>;
    const output = makeOutput();
    await handler(makeInput(), output);

    expect(ctx.stateManager.getActiveWorkflow().phase).toBe("accept");
    expect(output.output).toContain("2/2 tasks complete");
  });

  it("appends ADL with concrete final-wave evidence (not a counter comparison) on caller-driven progression", async () => {
    const ctx = await driveToExecute(5, 5);
    seedFinalWave(ctx, 5, "completed", ["done", "completed"], "passed");

    const hooks = createAutoProgressionHook(ctx);
    const handler = hooks["tool.execute.after"] as NonNullable<Hooks["tool.execute.after"]>;
    await handler(makeInput(), makeOutput());

    expect(ctx.stateManager.getActiveWorkflow().phase).toBe("accept");

    const adl = ctx.stateManager.getADL();
    // Concrete evidence: final wave number, its status, task completion counts.
    expect(adl).toContain("Auto-progression");
    expect(adl).toContain("accept");
    expect(adl).toContain("Final wave 5 status: completed");
    expect(adl).toContain("task completion: 2/2");
    // Must NOT be a bare counter comparison (the pre-fix message shape).
    expect(adl).not.toContain("All 5 waves complete");
  });
});
