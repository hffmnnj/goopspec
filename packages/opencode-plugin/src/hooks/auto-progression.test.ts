import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import {
  createDefaultWorkflowState,
  createMockPluginContext,
  setupTestEnvironment,
} from "../test-utils.js";
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
  // 1. Progresses execute → accept when currentWave >= totalWaves
  // -----------------------------------------------------------------------

  it("transitions execute → accept when currentWave >= totalWaves", async () => {
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

    const hooks = createAutoProgressionHook(ctx);
    const handler = hooks["tool.execute.after"] as NonNullable<Hooks["tool.execute.after"]>;
    const output = makeOutput();

    await handler(makeInput(), output);

    expect(ctx.stateManager.getActiveWorkflow().phase).toBe("accept");
    expect(output.output).toContain("accept");
  });

  it("transitions when currentWave exceeds totalWaves", async () => {
    const ctx = createMockPluginContext({
      testDir,
      state: {
        workflows: {
          default: createDefaultWorkflowState({
            phase: "execute",
            currentWave: 5,
            totalWaves: 3,
            specLocked: true,
          }),
        },
      },
    });

    const hooks = createAutoProgressionHook(ctx);
    const handler = hooks["tool.execute.after"] as NonNullable<Hooks["tool.execute.after"]>;
    const output = makeOutput();

    await handler(makeInput(), output);

    expect(ctx.stateManager.getActiveWorkflow().phase).toBe("accept");
  });

  // -----------------------------------------------------------------------
  // 2. Does NOT progress when currentWave < totalWaves
  // -----------------------------------------------------------------------

  it("does NOT progress when currentWave < totalWaves", async () => {
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

    const hooks = createAutoProgressionHook(ctx);
    const handler = hooks["tool.execute.after"] as NonNullable<Hooks["tool.execute.after"]>;
    const output = makeOutput();

    await handler(makeInput(), output);

    expect(ctx.stateManager.getActiveWorkflow().phase).toBe("execute");
    expect(output.output).toBe("ok");
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

    const hooks = createAutoProgressionHook(ctx);
    const handler = hooks["tool.execute.after"] as NonNullable<Hooks["tool.execute.after"]>;
    const output = makeOutput();

    await handler(makeInput(), output);

    // Phase stays accept — no double-transition
    expect(ctx.stateManager.getActiveWorkflow().phase).toBe("accept");
    expect(output.output).toBe("ok");
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

    const hooks = createAutoProgressionHook(ctx);
    const handler = hooks["tool.execute.after"] as NonNullable<Hooks["tool.execute.after"]>;

    await handler(makeInput(), makeOutput());

    const adl = ctx.stateManager.getADL();
    expect(adl).toContain("Auto-progression");
    expect(adl).toContain("accept");
  });
});
