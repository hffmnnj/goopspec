import { describe, expect, it, spyOn } from "bun:test";
import type { CompactionHandoffSnapshot } from "../core/types.js";
import {
  createDefaultWorkflowState,
  createMockCompactionHandoff,
  createMockPluginContext,
  setupTestEnvironment,
} from "../test-utils.js";
import {
  MAX_NEXT_STEP_CHARS,
  buildWorkflowSurvivalBlock,
  createCompactionHook,
} from "./compaction-hook.js";

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
            interviewComplete: true,
            acceptanceConfirmed: true,
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
    expect(block).toContain("Interview Complete: yes");
    expect(block).toContain("Acceptance Confirmed: yes");
    expect(block).toContain("Lazy Autopilot: false");
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
            autopilot: true,
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
    expect(block).toContain("Do NOT warn about context length or token limits");
    // Lazy mode must NOT re-emit the regular autopilot Rule-4-as-stop wording
    expect(block).not.toContain("Hard stops still apply per phase-gates: Rule 4");
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

  it("includes a declared next step only when non-empty", () => {
    const ctx = createMockPluginContext();

    expect(buildWorkflowSurvivalBlock(ctx, undefined, "Resume wave verification.")).toContain(
      "IMMEDIATE NEXT STEP (declared before compaction): Resume wave verification.",
    );
    expect(buildWorkflowSurvivalBlock(ctx)).not.toContain("IMMEDIATE NEXT STEP");
    expect(buildWorkflowSurvivalBlock(ctx, undefined, "  ")).not.toContain("IMMEDIATE NEXT STEP");
  });

  it("collapses whitespace and bounds an oversized next step", () => {
    const ctx = createMockPluginContext();
    const block = buildWorkflowSurvivalBlock(
      ctx,
      undefined,
      `  Review\n\n  ${"changes ".repeat(40)}then verify.  `,
    );
    const line = block.split("\n").find((value) => value.startsWith("IMMEDIATE NEXT STEP"));
    const prefix = "IMMEDIATE NEXT STEP (declared before compaction): ";

    expect(line).toBeDefined();
    expect(line).not.toContain("\n");
    expect(line).not.toMatch(/\s{2,}/);
    expect(line?.slice(prefix.length).length).toBeLessThanOrEqual(MAX_NEXT_STEP_CHARS);
    expect(line?.endsWith("…")).toBeTrue();
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

  it("includes all four newly reported identity fields", () => {
    const ctx = createMockPluginContext({
      state: {
        activeWorkflowId: "feat-auth",
        workflows: {
          "feat-auth": createDefaultWorkflowState({
            phase: "execute",
            interviewComplete: true,
            acceptanceConfirmed: true,
            lazyAutopilot: true,
          }),
        },
      },
    });

    const block = buildWorkflowSurvivalBlock(ctx);

    expect(block).toContain("Interview Complete: yes");
    expect(block).toContain("Acceptance Confirmed: yes");
    expect(block).toContain("Lazy Autopilot: true");
    // Branch is live-state-only here and mock context has no branch, so it is omitted.
    expect(block).not.toContain("Git Branch:");
  });

  it("includes the git branch from a snapshot", () => {
    const ctx = createMockPluginContext({
      state: {
        activeWorkflowId: "feat-auth",
        workflows: {
          "feat-auth": createDefaultWorkflowState({
            phase: "execute",
            currentWave: 2,
            totalWaves: 4,
          }),
        },
      },
    });

    const snapshot: CompactionHandoffSnapshot = {
      workflowId: "feat-auth",
      phase: "execute",
      mode: "standard",
      depth: "standard",
      specLocked: true,
      interviewComplete: true,
      acceptanceConfirmed: true,
      currentWave: 2,
      totalWaves: 4,
      autopilot: false,
      lazyAutopilot: false,
      branch: "fix/compaction-state-handoff",
      nextStep: "Continue implementation.",
      capturedAtMs: Date.now(),
    };

    const block = buildWorkflowSurvivalBlock(ctx, snapshot, snapshot.nextStep);

    expect(block).toContain("Git Branch: fix/compaction-state-handoff");
  });

  it("prefers snapshot values over live state when a snapshot is provided", () => {
    const ctx = createMockPluginContext({
      state: {
        activeWorkflowId: "feat-auth",
        workflows: {
          "feat-auth": createDefaultWorkflowState({
            phase: "plan",
            mode: "standard",
            depth: "standard",
            specLocked: false,
            interviewComplete: false,
            acceptanceConfirmed: false,
            currentWave: 0,
            totalWaves: 0,
            autopilot: false,
            lazyAutopilot: false,
          }),
        },
      },
    });

    const snapshot: CompactionHandoffSnapshot = {
      workflowId: "feat-auth",
      phase: "execute",
      mode: "comprehensive",
      depth: "deep",
      specLocked: true,
      interviewComplete: true,
      acceptanceConfirmed: true,
      currentWave: 2,
      totalWaves: 5,
      autopilot: true,
      lazyAutopilot: true,
      branch: "feat/snapshot-source",
      nextStep: "Proceed from snapshot.",
      capturedAtMs: Date.now(),
    };

    const block = buildWorkflowSurvivalBlock(ctx, snapshot, snapshot.nextStep);

    expect(block).toContain("Active Workflow: feat-auth");
    expect(block).toContain("EXECUTE");
    expect(block).toContain("Mode: comprehensive");
    expect(block).toContain("Depth: deep");
    expect(block).toContain("Spec Locked: yes");
    expect(block).toContain("Interview Complete: yes");
    expect(block).toContain("Acceptance Confirmed: yes");
    expect(block).toContain("Wave: 2 of 5");
    expect(block).toContain("Git Branch: feat/snapshot-source");
    expect(block).toContain("Lazy Autopilot: true");
    expect(block).toContain("LAZY AUTOPILOT ACTIVE");
    expect(block).toContain(
      "IMMEDIATE NEXT STEP (declared before compaction): Proceed from snapshot.",
    );
  });

  it("falls back to live state when no snapshot is provided", () => {
    const ctx = createMockPluginContext({
      state: {
        activeWorkflowId: "live-wf",
        workflows: {
          "live-wf": createDefaultWorkflowState({
            phase: "execute",
            mode: "standard",
            depth: "deep",
            specLocked: true,
            interviewComplete: true,
            acceptanceConfirmed: true,
            currentWave: 4,
            totalWaves: 6,
            autopilot: true,
            lazyAutopilot: false,
          }),
        },
      },
    });

    const block = buildWorkflowSurvivalBlock(ctx);

    expect(block).toContain("Active Workflow: live-wf");
    expect(block).toContain("EXECUTE");
    expect(block).toContain("Depth: deep");
    expect(block).toContain("Spec Locked: yes");
    expect(block).toContain("Interview Complete: yes");
    expect(block).toContain("Acceptance Confirmed: yes");
    expect(block).toContain("Wave: 4 of 6");
    expect(block).toContain("Lazy Autopilot: false");
  });

  it("rebinds live active workflow to snapshot workflow when they diverge", () => {
    const ctx = createMockPluginContext({
      state: {
        activeWorkflowId: "live-wf",
        workflows: {
          "live-wf": createDefaultWorkflowState({ phase: "plan" }),
          "snapshot-wf": createDefaultWorkflowState({
            phase: "execute",
            currentWave: 2,
            totalWaves: 4,
          }),
        },
      },
    });

    const snapshot: CompactionHandoffSnapshot = {
      workflowId: "snapshot-wf",
      phase: "execute",
      mode: "standard",
      depth: "standard",
      specLocked: true,
      interviewComplete: true,
      acceptanceConfirmed: true,
      currentWave: 2,
      totalWaves: 4,
      autopilot: false,
      lazyAutopilot: false,
      branch: undefined,
      nextStep: "Resume from snapshot workflow.",
      capturedAtMs: Date.now(),
    };

    const block = buildWorkflowSurvivalBlock(ctx, snapshot, snapshot.nextStep);

    expect(block).toContain("Active Workflow: snapshot-wf");
    expect(block).toContain("EXECUTE");
    expect(block).toContain("Wave: 2 of 4");
    expect(ctx.stateManager.getActiveWorkflowId()).toBe("snapshot-wf");
  });

  it("falls back to live state when snapshot workflow does not exist in live state", () => {
    const ctx = createMockPluginContext({
      state: {
        activeWorkflowId: "live-wf",
        workflows: {
          "live-wf": createDefaultWorkflowState({
            phase: "execute",
            currentWave: 1,
            totalWaves: 3,
          }),
        },
      },
    });

    const snapshot: CompactionHandoffSnapshot = {
      workflowId: "missing-wf",
      phase: "accept",
      mode: "standard",
      depth: "standard",
      specLocked: true,
      interviewComplete: true,
      acceptanceConfirmed: true,
      currentWave: 5,
      totalWaves: 5,
      autopilot: false,
      lazyAutopilot: false,
      branch: "feat/missing",
      nextStep: "Should not appear for a missing workflow.",
      capturedAtMs: Date.now(),
    };

    const consoleSpy = spyOn(console, "error").mockImplementation(() => {});
    const block = buildWorkflowSurvivalBlock(ctx, snapshot, snapshot.nextStep);

    expect(block).toContain("Active Workflow: live-wf");
    expect(block).toContain("EXECUTE");
    expect(block).toContain("Wave: 1 of 3");
    expect(block).not.toContain("missing-wf");
    expect(block).not.toContain("ACCEPT");
    expect(ctx.stateManager.getActiveWorkflowId()).toBe("live-wf");
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("rebinds via a real StateManager and reports the restored workflow", async () => {
    const env = setupTestEnvironment("compaction-survival-rebind");
    const { createStateManager } = await import("../features/state-manager/index.js");
    const stateManager = createStateManager({
      projectDir: env.testDir,
      db: env.db,
    });
    stateManager.createWorkflow("snapshot-wf");
    stateManager.updateWorkflow({
      phase: "execute",
      currentWave: 2,
      totalWaves: 3,
    });

    // Simulate drift: another workflow became active after the snapshot was captured.
    stateManager.createWorkflow("other-wf");
    stateManager.setActiveWorkflow("other-wf");

    const ctx = createMockPluginContext({
      testDir: env.testDir,
      db: env.db,
      stateManager,
    });

    const snapshot: CompactionHandoffSnapshot = {
      workflowId: "snapshot-wf",
      phase: "execute",
      mode: "standard",
      depth: "standard",
      specLocked: true,
      interviewComplete: true,
      acceptanceConfirmed: true,
      currentWave: 2,
      totalWaves: 3,
      autopilot: false,
      lazyAutopilot: false,
      branch: "fix/real-rebind",
      nextStep: "Resume after real rebind.",
      capturedAtMs: Date.now(),
    };

    const block = buildWorkflowSurvivalBlock(ctx, snapshot, snapshot.nextStep);

    expect(block).toContain("Active Workflow: snapshot-wf");
    expect(block).toContain("Git Branch: fix/real-rebind");
    expect(stateManager.getActiveWorkflowId()).toBe("snapshot-wf");
    env.cleanup();
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
  it("sets a continuation prompt and leaves output.context empty", async () => {
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

    expect(output.prompt).toContain("feat-auth");
    expect(output.prompt).toContain("execute");
    expect(output.context).toHaveLength(0);
  });

  it("includes and clears the declared next step for its session", async () => {
    const ctx = createMockPluginContext();
    ctx.compactionHandoff.set(
      "session-a",
      createMockCompactionHandoff("Run the focused hook tests."),
    );
    ctx.pendingCompactions.set("session-a", {
      model: { providerID: "openai", modelID: "gpt-5" },
      status: "in-flight",
      queuedAtMs: Date.now(),
    });

    const hooks = createCompactionHook(ctx);
    const output: { context: string[]; prompt?: string } = { context: [] };
    await hooks["experimental.session.compacting"]?.({ sessionID: "session-a" }, output);

    expect(output.prompt).toContain("1. Run the focused hook tests.");
    expect(ctx.compactionHandoff.get("session-a")).toBeUndefined();
    expect(ctx.pendingCompactions.has("session-a")).toBeFalse();

    const secondOutput: { context: string[]; prompt?: string } = {
      context: [],
    };
    await hooks["experimental.session.compacting"]?.({ sessionID: "session-a" }, secondOutput);
    expect(secondOutput.prompt).not.toContain("Run the focused hook tests.");
  });

  it("does not use a handoff declared for another session", async () => {
    const ctx = createMockPluginContext();
    ctx.compactionHandoff.set(
      "session-a",
      createMockCompactionHandoff("Only session A may resume this step."),
    );

    const hooks = createCompactionHook(ctx);
    const output: { context: string[]; prompt?: string } = { context: [] };
    await hooks["experimental.session.compacting"]?.({ sessionID: "session-b" }, output);

    expect(output.context.join("\n")).not.toContain("IMMEDIATE NEXT STEP");
    expect(ctx.compactionHandoff.get("session-a")?.nextStep).toBe(
      "Only session A may resume this step.",
    );
  });

  it("omits the next step when no handoff exists for the session", async () => {
    const ctx = createMockPluginContext();
    const hooks = createCompactionHook(ctx);
    const output: { context: string[]; prompt?: string } = { context: [] };

    await hooks["experimental.session.compacting"]?.({ sessionID: "session-a" }, output);

    expect(output.context.join("\n")).not.toContain("IMMEDIATE NEXT STEP");
  });

  it("logs and degrades without throwing for a malformed handoff snapshot", async () => {
    const ctx = createMockPluginContext();
    const consoleSpy = spyOn(console, "error").mockImplementation(() => {});
    ctx.compactionHandoff.set("session-a", { nextStep: "incomplete" } as never);
    const output: { context: string[]; prompt?: string } = { context: [] };

    await expect(
      createCompactionHook(ctx)["experimental.session.compacting"]?.(
        { sessionID: "session-a" },
        output,
      ),
    ).resolves.toBeUndefined();

    expect(consoleSpy).toHaveBeenCalled();
    expect(output.context.join("\n")).not.toContain("IMMEDIATE NEXT STEP");
    expect(ctx.compactionHandoff.has("session-a")).toBeFalse();
    consoleSpy.mockRestore();
  });

  it("includes regular autopilot survival directive when autopilot is active without lazy", async () => {
    const ctx = createMockPluginContext({
      state: {
        activeWorkflowId: "default",
        workflows: {
          default: createDefaultWorkflowState({
            phase: "execute",
            autopilot: true,
            lazyAutopilot: false,
          }),
        },
      },
    });

    const hooks = createCompactionHook(ctx);
    const output: { context: string[]; prompt?: string } = { context: [] };
    await hooks["experimental.session.compacting"]?.({ sessionID: "s1" }, output);

    const joined = output.prompt ?? "";
    expect(joined).toContain("AUTOPILOT ACTIVE");
    expect(joined).toContain("Continue to the next phase immediately");
    expect(joined).toContain("Do not warn about context limits or suggest a new session");
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

  it("does not touch an undefined output.context", async () => {
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

    expect(output.context).toBeUndefined();
    expect(output.prompt).toContain("feat-auth");
    expect(output.prompt).toContain("execute");
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
