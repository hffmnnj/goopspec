import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import type { PluginContext } from "../core/types.js";
import type { TaskStatus, WaveStatus } from "../features/db/types.js";
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

function seedFinalWave(
  ctx: PluginContext,
  waveNumber: number,
  status: WaveStatus,
  taskStatuses: TaskStatus[] = [],
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
    seedFinalWave(ctx, 3, "completed", ["done", "completed"]);

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
    seedFinalWave(ctx, 5, "completed", ["completed"]);

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
    seedFinalWave(ctx, 3, "completed", ["completed"]);
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
    seedFinalWave(ctx, 3, "completed", ["done", "completed"]);

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
    seedFinalWave(ctx, 4, "completed", ["done", "completed"]);

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
