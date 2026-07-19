import { describe, expect, it, spyOn } from "bun:test";
import { createDefaultWorkflowState, createMockPluginContext } from "../test-utils.js";
import { buildWorkflowSurvivalBlock, createCompactionHook } from "./compaction-hook.js";

// ---------------------------------------------------------------------------
// buildWorkflowSurvivalBlock
// ---------------------------------------------------------------------------

describe("buildWorkflowSurvivalBlock", () => {
  it("includes phase, workflow id, and wave progress", () => {
    const ctx = createMockPluginContext({
      state: {
        activeWorkflowId: "feat-auth",
        workflows: {
          "feat-auth": createDefaultWorkflowState({
            phase: "execute",
            mode: "standard",
            depth: "deep",
            specLocked: true,
            currentWave: 3,
            totalWaves: 5,
          }),
        },
      },
    });

    const block = buildWorkflowSurvivalBlock(ctx);

    expect(block).toContain("feat-auth");
    expect(block).toContain("EXECUTE");
    expect(block).toContain("execute");
    expect(block).toContain("standard");
    expect(block).toContain("deep");
    expect(block).toContain("Spec Locked: yes");
    expect(block).toContain("Wave: 3 of 5");
  });

  it("includes autopilot directive when autopilot is true", () => {
    const ctx = createMockPluginContext({
      state: {
        activeWorkflowId: "default",
        workflows: {
          default: createDefaultWorkflowState({
            phase: "execute",
            autopilot: true,
          }),
        },
      },
    });

    const block = buildWorkflowSurvivalBlock(ctx);

    expect(block).toContain("AUTOPILOT ACTIVE");
    expect(block).toContain("Continue to the next phase immediately");
    expect(block).toContain("Hard stops still apply per phase-gates");
    expect(block).toContain("AUTOPILOT SESSION RULES");
  });

  it("includes lazy autopilot directives when lazyAutopilot is true", () => {
    const ctx = createMockPluginContext({
      state: {
        activeWorkflowId: "default",
        workflows: {
          default: createDefaultWorkflowState({
            phase: "execute",
            lazyAutopilot: true,
          }),
        },
      },
    });

    const block = buildWorkflowSurvivalBlock(ctx);

    expect(block).toContain("LAZY AUTOPILOT ACTIVE");
    expect(block).toContain("Do NOT ask the user any questions");
    expect(block).toContain(
      "ONLY stop for: (1) missing credentials/secrets, (2) ambiguous destructive/irreversible operations.",
    );
    expect(block).toContain(
      "On a Rule 4 architectural decision, decide autonomously using best judgment.",
    );
    expect(block).toContain("Log full rationale to ADL via goop_adl");
    // Old stop-list items should NOT appear in the ONLY-stop-for list
    expect(block).not.toContain("external blockers");
    // "Rule 4" appears in the autonomous-decision sentence, not in the stop list
    expect(block).toContain("AUTOPILOT SESSION RULES");
  });

  it("omits autopilot directives when autopilot is false", () => {
    const ctx = createMockPluginContext({
      state: {
        activeWorkflowId: "default",
        workflows: {
          default: createDefaultWorkflowState({
            phase: "execute",
            autopilot: false,
            lazyAutopilot: false,
          }),
        },
      },
    });

    const block = buildWorkflowSurvivalBlock(ctx);

    expect(block).not.toContain("AUTOPILOT ACTIVE");
    expect(block).not.toContain("LAZY AUTOPILOT ACTIVE");
    expect(block).not.toContain("AUTOPILOT SESSION RULES");
  });

  it("includes document pointers for re-hydration", () => {
    const ctx = createMockPluginContext({
      state: {
        activeWorkflowId: "feat-auth",
        workflows: {
          "feat-auth": createDefaultWorkflowState({ phase: "plan" }),
        },
      },
    });

    const block = buildWorkflowSurvivalBlock(ctx);

    expect(block).toContain(".goopspec/feat-auth/SPEC.md");
    expect(block).toContain(".goopspec/feat-auth/BLUEPRINT.md");
    expect(block).toContain(".goopspec/feat-auth/CHRONICLE.md");
    expect(block).toContain("goop_status");
  });

  it("uses root .goopspec/ path for default workflow", () => {
    const ctx = createMockPluginContext({
      state: {
        activeWorkflowId: "default",
        workflows: {
          default: createDefaultWorkflowState({ phase: "idle" }),
        },
      },
    });

    const block = buildWorkflowSurvivalBlock(ctx);

    expect(block).toContain(".goopspec/SPEC.md");
    expect(block).not.toContain(".goopspec/default/");
  });

  it("returns empty string when active workflow is missing", () => {
    const ctx = createMockPluginContext({
      state: {
        activeWorkflowId: "nonexistent",
        workflows: {},
      },
    });

    const block = buildWorkflowSurvivalBlock(ctx);
    expect(block).toBe("");
  });

  it("omits wave line when both currentWave and totalWaves are 0", () => {
    const ctx = createMockPluginContext({
      state: {
        activeWorkflowId: "default",
        workflows: {
          default: createDefaultWorkflowState({
            phase: "plan",
            currentWave: 0,
            totalWaves: 0,
          }),
        },
      },
    });

    const block = buildWorkflowSurvivalBlock(ctx);
    expect(block).not.toContain("Wave:");
  });
});

// ---------------------------------------------------------------------------
// createCompactionHook (factory + handler)
// ---------------------------------------------------------------------------

describe("createCompactionHook", () => {
  it("pushes context block onto output.context (not output.prompt)", async () => {
    const ctx = createMockPluginContext({
      state: {
        activeWorkflowId: "feat-auth",
        workflows: {
          "feat-auth": createDefaultWorkflowState({
            phase: "execute",
            specLocked: true,
            currentWave: 2,
            totalWaves: 4,
          }),
        },
      },
    });

    const hooks = createCompactionHook(ctx);
    const handler = hooks["experimental.session.compacting"];
    expect(handler).toBeDefined();

    const output: { context: string[]; prompt?: string } = { context: [] };
    await handler?.({ sessionID: "s1" }, output);

    expect(output.context.length).toBeGreaterThan(0);
    expect(output.context[0]).toContain("feat-auth");
    expect(output.context[0]).toContain("EXECUTE");
    // Must NOT set prompt
    expect(output.prompt).toBeUndefined();
  });

  it("includes autopilot survival directive when autopilot is active", async () => {
    const ctx = createMockPluginContext({
      state: {
        activeWorkflowId: "default",
        workflows: {
          default: createDefaultWorkflowState({
            phase: "execute",
            autopilot: true,
          }),
        },
      },
    });

    const hooks = createCompactionHook(ctx);
    const output: { context: string[]; prompt?: string } = { context: [] };
    await hooks["experimental.session.compacting"]?.({ sessionID: "s1" }, output);

    const joined = output.context.join("\n");
    expect(joined).toContain("AUTOPILOT ACTIVE");
    expect(joined).toContain("Continue to the next phase immediately");
  });

  it("does not push empty block when workflow is missing", async () => {
    const ctx = createMockPluginContext({
      state: {
        activeWorkflowId: "ghost",
        workflows: {},
      },
    });

    const hooks = createCompactionHook(ctx);
    const output: { context: string[]; prompt?: string } = { context: [] };
    await hooks["experimental.session.compacting"]?.({ sessionID: "s1" }, output);

    expect(output.context).toHaveLength(0);
  });

  it("does not throw when output.context is undefined (defensive guard)", async () => {
    const ctx = createMockPluginContext({
      state: {
        activeWorkflowId: "feat-auth",
        workflows: {
          "feat-auth": createDefaultWorkflowState({
            phase: "execute",
            specLocked: true,
            currentWave: 2,
            totalWaves: 4,
          }),
        },
      },
    });

    const hooks = createCompactionHook(ctx);
    const handler = hooks["experimental.session.compacting"];
    expect(handler).toBeDefined();

    // Simulate abnormal path where context is undefined
    const output = {} as { context: string[]; prompt?: string };
    await handler?.({ sessionID: "s1" }, output);

    // Should have initialised context and pushed the block
    expect(Array.isArray(output.context)).toBe(true);
    expect(output.context.length).toBeGreaterThan(0);
    expect(output.context[0]).toContain("feat-auth");
    expect(output.context[0]).toContain("EXECUTE");
  });

  it("gracefully handles errors without throwing", async () => {
    const ctx = createMockPluginContext();
    // Sabotage the state manager to throw
    const originalGetState = ctx.stateManager.getState;
    (ctx.stateManager as unknown as { getState: () => never }).getState = () => {
      throw new Error("state explosion");
    };

    const consoleSpy = spyOn(console, "error").mockImplementation(() => {});

    const hooks = createCompactionHook(ctx);
    const output: { context: string[]; prompt?: string } = { context: [] };

    // Should not throw
    await hooks["experimental.session.compacting"]?.({ sessionID: "s1" }, output);

    // safeHandler catches the error
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();

    // Restore
    (ctx.stateManager as unknown as { getState: typeof originalGetState }).getState =
      originalGetState;
  });
});
