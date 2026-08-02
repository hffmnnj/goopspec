import { describe, expect, it, spyOn } from "bun:test";
import type { CompactionHandoffSnapshot } from "../core/types.js";
import {
  createDefaultWorkflowState,
  createMockCompactionHandoff,
  createMockPluginContext,
} from "../test-utils.js";
import { createCompactionHook } from "./compaction-hook.js";

// ---------------------------------------------------------------------------
// createCompactionHook — replacement contract (output.prompt, not output.context)
// ---------------------------------------------------------------------------

describe("createCompactionHook", () => {
  // --- Replacement contract: prompt is set, context is untouched ---

  it("sets a non-empty prompt from a valid snapshot with sanitized next step and leaves context empty", async () => {
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
      branch: "feat/auth",
      nextStep: "  Review\n  the  hook  changes.  ",
      capturedAtMs: Date.now(),
    };
    ctx.compactionHandoff.set("s1", snapshot);

    const hooks = createCompactionHook(ctx);
    const output: { context: string[]; prompt?: string } = { context: [] };
    await hooks["experimental.session.compacting"]?.({ sessionID: "s1" }, output);

    expect(output.prompt).toBeDefined();
    expect(output.prompt).not.toBe("");
    expect(output.prompt).toContain("feat-auth");
    expect(output.prompt).toContain("execute");
    // Whitespace collapsed by the sanitizer
    expect(output.prompt).toContain("1. Review the hook changes.");
    // Context is unchanged (empty)
    expect(output.context).toHaveLength(0);
  });

  it("derives the goop_status directive when only live state is available", async () => {
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
    const output: { context: string[]; prompt?: string } = { context: [] };
    await hooks["experimental.session.compacting"]?.({ sessionID: "s1" }, output);

    expect(output.prompt).toBeDefined();
    expect(output.prompt).toContain("goop_status");
    expect(output.prompt).toContain("derive the gate-appropriate action");
    expect(output.context).toHaveLength(0);
  });

  it("leaves both output fields untouched when no active workflow exists", async () => {
    const ctx = createMockPluginContext({
      state: {
        activeWorkflowId: "ghost",
        workflows: {},
      },
    });

    const hooks = createCompactionHook(ctx);
    const output: { context: string[]; prompt?: string } = { context: [] };
    await hooks["experimental.session.compacting"]?.({ sessionID: "s1" }, output);

    expect(output.prompt).toBeUndefined();
    expect(output.context).toHaveLength(0);
  });

  // --- Snapshot fallback paths ---

  it("logs and falls back to live state for a malformed snapshot", async () => {
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

    const consoleSpy = spyOn(console, "error").mockImplementation(() => {});
    ctx.compactionHandoff.set("s1", { nextStep: "incomplete" } as never);

    const hooks = createCompactionHook(ctx);
    const output: { context: string[]; prompt?: string } = { context: [] };
    await hooks["experimental.session.compacting"]?.({ sessionID: "s1" }, output);

    expect(consoleSpy).toHaveBeenCalled();
    // Falls back to live state
    expect(output.prompt).toBeDefined();
    expect(output.prompt).toContain("feat-auth");
    // Handoff consumed even when malformed
    expect(ctx.compactionHandoff.has("s1")).toBeFalse();
    consoleSpy.mockRestore();
  });

  it("falls back to the live workflow when the snapshot workflow is absent live", async () => {
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
    ctx.compactionHandoff.set("s1", snapshot);

    const consoleSpy = spyOn(console, "error").mockImplementation(() => {});
    const hooks = createCompactionHook(ctx);
    const output: { context: string[]; prompt?: string } = { context: [] };
    await hooks["experimental.session.compacting"]?.({ sessionID: "s1" }, output);

    // Falls back to live workflow
    expect(output.prompt).toBeDefined();
    expect(output.prompt).toContain("live-wf");
    expect(output.prompt).not.toContain("missing-wf");
    // Live binding unchanged
    expect(ctx.stateManager.getActiveWorkflowId()).toBe("live-wf");
    consoleSpy.mockRestore();
  });

  // --- Consume-once and halt clearing ---

  it("consumes the handoff snapshot once per session", async () => {
    const ctx = createMockPluginContext();
    ctx.compactionHandoff.set(
      "session-a",
      createMockCompactionHandoff("Run the focused hook tests."),
    );

    const hooks = createCompactionHook(ctx);
    const output: { context: string[]; prompt?: string } = { context: [] };
    await hooks["experimental.session.compacting"]?.({ sessionID: "session-a" }, output);

    // Handoff consumed
    expect(ctx.compactionHandoff.get("session-a")).toBeUndefined();
    // First invocation contains the declared next step
    expect(output.prompt).toContain("1. Run the focused hook tests.");

    // Second invocation does not see the handoff
    const secondOutput: { context: string[]; prompt?: string } = { context: [] };
    await hooks["experimental.session.compacting"]?.({ sessionID: "session-a" }, secondOutput);

    expect(secondOutput.prompt).not.toContain("Run the focused hook tests.");
  });

  it("clears pending compactions and halt state for the session", async () => {
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

    expect(ctx.pendingCompactions.has("session-a")).toBeFalse();
    expect(ctx.compactionHandoff.has("session-a")).toBeFalse();
  });

  it("does not consume a handoff declared for another session", async () => {
    const ctx = createMockPluginContext();
    ctx.compactionHandoff.set(
      "session-a",
      createMockCompactionHandoff("Only session A may resume this step."),
    );

    const hooks = createCompactionHook(ctx);
    const output: { context: string[]; prompt?: string } = { context: [] };
    await hooks["experimental.session.compacting"]?.({ sessionID: "session-b" }, output);

    // Session A's handoff is not consumed
    expect(ctx.compactionHandoff.get("session-a")?.nextStep).toBe(
      "Only session A may resume this step.",
    );
    // Session B's prompt does not contain session A's next step
    expect(output.prompt).not.toContain("Only session A may resume this step.");
  });

  // --- Graceful degradation (NFR3: never throw, never mutate on failure) ---

  it("resolves without throwing or mutating output when the state manager throws", async () => {
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

    const originalGetState = ctx.stateManager.getState;
    (ctx.stateManager as unknown as { getState: () => never }).getState = () => {
      throw new Error("state explosion");
    };

    const consoleSpy = spyOn(console, "error").mockImplementation(() => {});
    const hooks = createCompactionHook(ctx);
    const output: { context: string[]; prompt?: string } = { context: [] };

    // Should not throw
    await hooks["experimental.session.compacting"]?.({ sessionID: "s1" }, output);

    // No mutation
    expect(output.prompt).toBeUndefined();
    expect(output.context).toHaveLength(0);

    consoleSpy.mockRestore();
    (ctx.stateManager as unknown as { getState: typeof originalGetState }).getState =
      originalGetState;
  });

  it("resolves without throwing or mutating output when the DB accessor throws", async () => {
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

    const originalGetWaves = ctx.db.getWaves;
    ctx.db.getWaves = (() => {
      throw new Error("db explosion");
    }) as typeof ctx.db.getWaves;

    const consoleSpy = spyOn(console, "error").mockImplementation(() => {});
    const hooks = createCompactionHook(ctx);
    const output: { context: string[]; prompt?: string } = { context: [] };

    // Should not throw
    await hooks["experimental.session.compacting"]?.({ sessionID: "s1" }, output);

    // NFR3: no mutation when collection fails
    expect(output.prompt).toBeUndefined();
    expect(output.context).toHaveLength(0);

    consoleSpy.mockRestore();
    ctx.db.getWaves = originalGetWaves;
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
    const output = {} as { context: string[]; prompt?: string };
    await hooks["experimental.session.compacting"]?.({ sessionID: "s1" }, output);

    expect(output.context).toBeUndefined();
    expect(output.prompt).toContain("feat-auth");
  });
});
