import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";

import { PENDING_COMPACTION_TTL_MS } from "../../core/constants.js";
import { createCompactionHook } from "../../hooks/compaction-hook.js";
import {
  createDefaultWorkflowState,
  createMockCompactionHandoff,
  createMockPluginContext,
  createMockToolContext,
  setupTestEnvironment,
} from "../../test-utils.js";
import type { PluginContext, WorkflowState } from "../../test-utils.js";
import { createGoopCompactTool, dispatchPendingCompaction } from "./index.js";

interface CompactionClient {
  session: {
    messages?: (input: { path: { id: string } }) => Promise<unknown>;
    abort?: (input: { path: { id: string } }) => Promise<unknown>;
    summarize?: (input: {
      path: { id: string };
      body?: { providerID: string; modelID: string; auto?: boolean };
    }) => Promise<unknown>;
  };
}

function setCompactionClient(ctx: PluginContext, client: CompactionClient): void {
  Object.assign(ctx.sdk.client, client);
}

function modelMessages(): Promise<unknown> {
  return Promise.resolve({
    data: [
      {
        info: {
          role: "user",
          model: { providerID: "opencode", modelID: "deepseek-v4" },
        },
      },
    ],
  });
}

describe("createGoopCompactTool", () => {
  let ctx: PluginContext;
  let cleanup: () => void;

  async function flushPromises(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
  }

  beforeEach(() => {
    const env = setupTestEnvironment("goop-compact");
    cleanup = env.cleanup;
    ctx = createMockPluginContext({ testDir: env.testDir, db: env.db });
  });

  afterEach(() => cleanup());

  it("queues compaction without aborting or summarizing", async () => {
    const abort = mock(async () => ({ data: true }));
    const summarize = mock(async () => ({ data: true }));
    setCompactionClient(ctx, { session: { messages: modelMessages, abort, summarize } });
    const sessionID = "session-compact-001";
    const nextStep = "Verify the completed implementation, then begin the next work item.";

    const result = await createGoopCompactTool(ctx).execute(
      { next_step: nextStep },
      createMockToolContext({ sessionID }),
    );

    expect(result).toContain(
      "Compaction queued. Please end your turn here so compaction can occur.",
    );
    expect(result).not.toContain("will continue automatically");
    expect(result).not.toContain("will apply once the current turn completes");
    expect(abort).not.toHaveBeenCalled();
    expect(summarize).not.toHaveBeenCalled();
    expect(ctx.compactionHandoff.get(sessionID)?.nextStep).toBe(nextStep);
    expect(ctx.pendingCompactions.get(sessionID)?.status).toBe("queued");
    expect(typeof ctx.pendingCompactions.get(sessionID)?.queuedAtMs).toBe("number");
  });

  it("persists state to the DB before writing the pending compaction entry", async () => {
    const summarize = mock(async () => ({ data: true }));
    const sessionID = "session-persist-before-queue";
    const nextStep = "Persist, then queue.";

    // Use a real StateManager so we can inspect the DB row.
    const env = setupTestEnvironment("goop-compact-persist");
    const { createStateManager } = await import("../../features/state-manager/index.js");
    const realStateManager = createStateManager({ projectDir: env.testDir, db: env.db });
    realStateManager.updateWorkflow({
      phase: "execute",
      mode: "comprehensive",
      depth: "deep",
      interviewComplete: true,
      specLocked: true,
      acceptanceConfirmed: true,
      currentWave: 2,
      totalWaves: 4,
      autopilot: true,
      lazyAutopilot: true,
    });
    const realCtx = createMockPluginContext({
      testDir: env.testDir,
      db: env.db,
      stateManager: realStateManager,
    });
    setCompactionClient(realCtx, { session: { messages: modelMessages, summarize } });

    await createGoopCompactTool(realCtx).execute(
      { next_step: nextStep },
      createMockToolContext({ sessionID }),
    );

    const row = env.db.getWorkflow("default");
    expect(row).toBeDefined();
    const persisted = JSON.parse(row?.state ?? "{}") as WorkflowState;
    expect(persisted.phase).toBe("execute");
    expect(persisted.currentWave).toBe(2);
    expect(persisted.specLocked).toBe(true);
    expect(realCtx.pendingCompactions.get(sessionID)?.status).toBe("queued");
    env.cleanup();
  });

  it("returns a staleness WARNING naming divergent fields when in-memory state is stale", async () => {
    const summarize = mock(async () => ({ data: true }));
    const sessionID = "session-divergence-warning";
    const nextStep = "Reconcile before compacting.";

    // Use a real StateManager and simulate an out-of-band DB advance.
    const env = setupTestEnvironment("goop-compact-divergence");
    const { createStateManager } = await import("../../features/state-manager/index.js");
    const realStateManager = createStateManager({ projectDir: env.testDir, db: env.db });
    realStateManager.updateWorkflow({
      phase: "plan",
      currentWave: 1,
      totalWaves: 3,
      interviewComplete: true,
    });
    realStateManager.getState();
    env.db.upsertWorkflow(
      "default",
      createDefaultWorkflowState({
        phase: "execute",
        currentWave: 2,
        interviewComplete: true,
        specLocked: true,
      }),
    );
    const realCtx = createMockPluginContext({
      testDir: env.testDir,
      db: env.db,
      stateManager: realStateManager,
    });
    setCompactionClient(realCtx, { session: { messages: modelMessages, summarize } });

    const result = await createGoopCompactTool(realCtx).execute(
      { next_step: nextStep },
      createMockToolContext({ sessionID }),
    );

    expect(result).toContain("WARNING:");
    expect(result).toContain("phase");
    expect(result).toContain("currentWave");
    expect(result).toContain("specLocked");
    expect(result).toContain("totalWaves");
    expect(realCtx.pendingCompactions.get(sessionID)?.status).toBe("queued");
    env.cleanup();
  });

  it("does not return a divergence warning when state is clean", async () => {
    const summarize = mock(async () => ({ data: true }));
    const sessionID = "session-clean-state";
    const nextStep = "No divergence expected.";

    const env = setupTestEnvironment("goop-compact-clean");
    const { createStateManager } = await import("../../features/state-manager/index.js");
    const realStateManager = createStateManager({ projectDir: env.testDir, db: env.db });
    realStateManager.updateWorkflow({
      phase: "execute",
      mode: "standard",
      depth: "standard",
      interviewComplete: true,
      specLocked: true,
      acceptanceConfirmed: false,
      currentWave: 2,
      totalWaves: 4,
      autopilot: true,
      lazyAutopilot: false,
    });
    const realCtx = createMockPluginContext({
      testDir: env.testDir,
      db: env.db,
      stateManager: realStateManager,
    });
    setCompactionClient(realCtx, { session: { messages: modelMessages, summarize } });

    const result = await createGoopCompactTool(realCtx).execute(
      { next_step: nextStep },
      createMockToolContext({ sessionID }),
    );

    expect(result).not.toContain("WARNING:");
    expect(result).toContain("Compaction queued.");
    expect(realCtx.pendingCompactions.get(sessionID)?.status).toBe("queued");
    env.cleanup();
  });

  it("round-trips every structured handoff field through the compacting handler", async () => {
    const sessionID = "session-structured-handoff";
    const nextStep = "Rehydrate the queued state before continuing.";
    ctx = createMockPluginContext({
      testDir: ctx.sdk.directory,
      state: {
        activeWorkflowId: "durable-workflow",
        workflows: {
          "durable-workflow": {
            phase: "execute",
            mode: "comprehensive",
            depth: "deep",
            specLocked: true,
            interviewComplete: true,
            acceptanceConfirmed: true,
            currentWave: 2,
            totalWaves: 4,
            autopilot: true,
            lazyAutopilot: true,
          },
        },
      },
    });
    const summarize = mock(async () => ({ data: true }));
    setCompactionClient(ctx, { session: { messages: modelMessages, summarize } });

    await createGoopCompactTool(ctx).execute(
      { next_step: nextStep },
      createMockToolContext({ sessionID }),
    );

    const snapshot = ctx.compactionHandoff.get(sessionID);
    expect(snapshot).toBeDefined();
    expect(snapshot?.workflowId).toBe("durable-workflow");
    expect(snapshot?.phase).toBe("execute");
    expect(snapshot?.mode).toBe("comprehensive");
    expect(snapshot?.depth).toBe("deep");
    expect(snapshot?.specLocked).toBeTrue();
    expect(snapshot?.interviewComplete).toBeTrue();
    expect(snapshot?.acceptanceConfirmed).toBeTrue();
    expect(snapshot?.currentWave).toBe(2);
    expect(snapshot?.totalWaves).toBe(4);
    expect(snapshot?.autopilot).toBeTrue();
    expect(snapshot?.lazyAutopilot).toBeTrue();
    expect(snapshot?.branch).toBeUndefined();
    expect(snapshot?.nextStep).toBe(nextStep);
    expect(typeof snapshot?.capturedAtMs).toBe("number");

    const originalGet = ctx.compactionHandoff.get.bind(ctx.compactionHandoff);
    let handlerSnapshot = undefined as typeof snapshot;
    spyOn(ctx.compactionHandoff, "get").mockImplementation((id) => {
      const handoff = originalGet(id);
      if (id === sessionID) handlerSnapshot = handoff;
      return handoff;
    });
    const output: { context: string[]; prompt?: string } = { context: [] };
    await createCompactionHook(ctx)["experimental.session.compacting"]?.({ sessionID }, output);

    expect(handlerSnapshot?.workflowId).toBe("durable-workflow");
    expect(handlerSnapshot?.phase).toBe("execute");
    expect(handlerSnapshot?.mode).toBe("comprehensive");
    expect(handlerSnapshot?.depth).toBe("deep");
    expect(handlerSnapshot?.specLocked).toBeTrue();
    expect(handlerSnapshot?.interviewComplete).toBeTrue();
    expect(handlerSnapshot?.acceptanceConfirmed).toBeTrue();
    expect(handlerSnapshot?.currentWave).toBe(2);
    expect(handlerSnapshot?.totalWaves).toBe(4);
    expect(handlerSnapshot?.autopilot).toBeTrue();
    expect(handlerSnapshot?.lazyAutopilot).toBeTrue();
    expect(handlerSnapshot?.branch).toBeUndefined();
    expect(handlerSnapshot?.nextStep).toBe(nextStep);
    expect(typeof handlerSnapshot?.capturedAtMs).toBe("number");
    expect(output.prompt).toContain(`1. ${nextStep}`);
    expect(output.context).toHaveLength(0);
    expect(ctx.compactionHandoff.has(sessionID)).toBeFalse();
  });

  it("blocks live duplicate requests with their status and age", async () => {
    const summarize = mock(async () => ({ data: true }));
    setCompactionClient(ctx, { session: { messages: modelMessages, summarize } });
    const sessionID = "session-compact-duplicate";
    const compact = createGoopCompactTool(ctx);

    await compact.execute(
      { next_step: "Continue the first requested task." },
      createMockToolContext({ sessionID }),
    );
    const duplicate = await compact.execute(
      { next_step: "This must not create another compaction." },
      createMockToolContext({ sessionID }),
    );

    expect(duplicate).toMatch(
      new RegExp(`Compaction is already queued \\d+s ago for session ${sessionID}`),
    );
    expect(summarize).not.toHaveBeenCalled();
    expect(ctx.pendingCompactions.get(sessionID)?.status).toBe("queued");
  });

  it("requires summarize but not abort", async () => {
    const summarize = mock(async () => ({ data: true }));
    setCompactionClient(ctx, { session: { messages: modelMessages, summarize } });

    const available = await createGoopCompactTool(ctx).execute(
      { next_step: "Resume the current work." },
      createMockToolContext(),
    );
    expect(available).toContain(
      "Compaction queued. Please end your turn here so compaction can occur.",
    );

    setCompactionClient(ctx, { session: { abort: mock(async () => ({ data: true })) } });
    const unavailable = await createGoopCompactTool(ctx).execute(
      { next_step: "Resume the current work." },
      createMockToolContext(),
    );
    expect(unavailable).toBe(
      "goop_compact unavailable: session compaction is not supported on this host.",
    );
  });

  it("clears a pre-existing handoff when model resolution fails", async () => {
    const sessionID = "session-model-error";
    const otherSessionID = "session-model-error-other";
    setCompactionClient(ctx, {
      session: {
        messages: async () => ({ error: "unavailable" }),
        summarize: mock(async () => ({ data: true })),
      },
    });
    ctx.compactionHandoff.set(sessionID, createMockCompactionHandoff("Old handoff."));
    ctx.compactionHandoff.set(otherSessionID, createMockCompactionHandoff("Other handoff."));

    const result = await createGoopCompactTool(ctx).execute(
      { next_step: "Resume current work." },
      createMockToolContext({ sessionID }),
    );

    expect(result).toBe(
      "goop_compact failed: unable to resolve the current session model: unavailable",
    );
    expect(ctx.compactionHandoff.has(sessionID)).toBeFalse();
    expect(ctx.compactionHandoff.get(otherSessionID)?.nextStep).toBe("Other handoff.");
  });

  it("PR #210 regression: execute never calls summarize and idle dispatch calls it exactly once", async () => {
    const sessionID = "session-pr210-tripwire";
    const summarize = mock(async () => ({ data: true }));
    setCompactionClient(ctx, { session: { messages: modelMessages, summarize } });

    await createGoopCompactTool(ctx).execute(
      { next_step: "Resume after compaction." },
      createMockToolContext({ sessionID }),
    );

    expect(summarize).not.toHaveBeenCalled();

    dispatchPendingCompaction(ctx, sessionID);
    await flushPromises();

    expect(summarize).toHaveBeenCalledTimes(1);
    expect(ctx.pendingCompactions.has(sessionID)).toBeFalse();
  });

  it("dispatches queued compaction once with auto and clears it on success", async () => {
    const sessionID = "session-dispatch";
    const otherSessionID = "session-dispatch-other";
    const calls: Array<{
      path: { id: string };
      body?: { providerID: string; modelID: string; auto?: boolean };
    }> = [];
    const session = {
      messages: modelMessages,
      _client: {},
      summarize(input: {
        path: { id: string };
        body?: { providerID: string; modelID: string; auto?: boolean };
      }): Promise<unknown> {
        if (this._client === undefined) throw new TypeError("detached this");
        calls.push(input);
        return Promise.resolve({ data: true });
      },
    };
    setCompactionClient(ctx, { session });
    ctx.compactionHandoff.set(sessionID, createMockCompactionHandoff("Resume after compaction."));
    ctx.pendingCompactions.set(sessionID, {
      model: { providerID: "opencode", modelID: "deepseek-v4" },
      status: "queued",
      queuedAtMs: Date.now(),
    });
    ctx.pendingCompactions.set(otherSessionID, {
      model: { providerID: "opencode", modelID: "deepseek-v4" },
      status: "queued",
      queuedAtMs: Date.now(),
    });

    dispatchPendingCompaction(ctx, sessionID);
    await flushPromises();

    expect(calls).toEqual([
      {
        path: { id: sessionID },
        body: { providerID: "opencode", modelID: "deepseek-v4", auto: true },
      },
    ]);
    expect(ctx.pendingCompactions.has(sessionID)).toBeFalse();
    expect(ctx.pendingCompactions.get(otherSessionID)?.status).toBe("queued");
  });

  it("does not dispatch absent or already in-flight requests", async () => {
    const summarize = mock(async () => ({ data: true }));
    const sessionID = "session-in-flight";
    setCompactionClient(ctx, { session: { summarize } });

    dispatchPendingCompaction(ctx, sessionID);
    ctx.pendingCompactions.set(sessionID, {
      model: { providerID: "opencode", modelID: "deepseek-v4" },
      status: "queued",
      queuedAtMs: Date.now(),
    });
    dispatchPendingCompaction(ctx, sessionID);
    dispatchPendingCompaction(ctx, sessionID);
    await flushPromises();

    expect(summarize).toHaveBeenCalledTimes(1);
  });

  it("clears an expired queued request without dispatching another session", () => {
    const summarize = mock(async () => ({ data: true }));
    const sessionID = "session-expired-queued";
    const otherSessionID = "session-expired-queued-other";
    setCompactionClient(ctx, { session: { summarize } });
    ctx.compactionHandoff.set(sessionID, createMockCompactionHandoff("Expired handoff."));
    ctx.pendingCompactions.set(sessionID, {
      model: { providerID: "opencode", modelID: "deepseek-v4" },
      status: "queued",
      queuedAtMs: Date.now() - PENDING_COMPACTION_TTL_MS - 1,
    });
    ctx.compactionHandoff.set(otherSessionID, createMockCompactionHandoff("Live handoff."));
    ctx.pendingCompactions.set(otherSessionID, {
      model: { providerID: "opencode", modelID: "deepseek-v4" },
      status: "queued",
      queuedAtMs: Date.now(),
    });

    dispatchPendingCompaction(ctx, sessionID);

    expect(summarize).not.toHaveBeenCalled();
    expect(ctx.pendingCompactions.has(sessionID)).toBeFalse();
    expect(ctx.compactionHandoff.has(sessionID)).toBeFalse();
    expect(ctx.pendingCompactions.get(otherSessionID)?.status).toBe("queued");
    expect(ctx.compactionHandoff.get(otherSessionID)?.nextStep).toBe("Live handoff.");
  });

  it("replaces an expired in-flight request without affecting another session", async () => {
    const sessionID = "session-expired-in-flight";
    const otherSessionID = "session-expired-in-flight-other";
    setCompactionClient(ctx, {
      session: { messages: modelMessages, summarize: mock(async () => ({ data: true })) },
    });
    ctx.compactionHandoff.set(sessionID, createMockCompactionHandoff("Expired handoff."));
    ctx.pendingCompactions.set(sessionID, {
      model: { providerID: "opencode", modelID: "deepseek-v4" },
      status: "in-flight",
      queuedAtMs: Date.now() - PENDING_COMPACTION_TTL_MS - 1,
    });
    ctx.compactionHandoff.set(otherSessionID, createMockCompactionHandoff("Other handoff."));
    ctx.pendingCompactions.set(otherSessionID, {
      model: { providerID: "opencode", modelID: "deepseek-v4" },
      status: "in-flight",
      queuedAtMs: Date.now(),
    });

    const result = await createGoopCompactTool(ctx).execute(
      { next_step: "Resume after replacing the stale request." },
      createMockToolContext({ sessionID }),
    );

    expect(result).toContain("Compaction queued.");
    expect(ctx.pendingCompactions.get(sessionID)?.status).toBe("queued");
    expect(ctx.compactionHandoff.get(sessionID)?.nextStep).toBe(
      "Resume after replacing the stale request.",
    );
    expect(ctx.pendingCompactions.get(otherSessionID)?.status).toBe("in-flight");
    expect(ctx.compactionHandoff.get(otherSessionID)?.nextStep).toBe("Other handoff.");
  });

  it("clears handoff and pending state when summarize rejects", async () => {
    const summarize = mock(async () => {
      throw new Error("summarize unavailable");
    });
    const sessionID = "session-compact-rejected";
    const otherSessionID = "session-compact-rejected-other";
    const consoleSpy = spyOn(console, "error").mockImplementation(() => {});
    setCompactionClient(ctx, { session: { summarize } });
    ctx.compactionHandoff.set(
      sessionID,
      createMockCompactionHandoff("Resume after the compaction attempt."),
    );
    ctx.pendingCompactions.set(sessionID, {
      model: { providerID: "opencode", modelID: "deepseek-v4" },
      status: "queued",
      queuedAtMs: Date.now(),
    });
    ctx.compactionHandoff.set(otherSessionID, createMockCompactionHandoff("Other handoff."));
    ctx.pendingCompactions.set(otherSessionID, {
      model: { providerID: "opencode", modelID: "deepseek-v4" },
      status: "queued",
      queuedAtMs: Date.now(),
    });

    dispatchPendingCompaction(ctx, sessionID);
    await flushPromises();

    expect(consoleSpy).toHaveBeenCalled();
    expect(ctx.compactionHandoff.has(sessionID)).toBeFalse();
    expect(ctx.pendingCompactions.has(sessionID)).toBeFalse();
    expect(ctx.compactionHandoff.get(otherSessionID)?.nextStep).toBe("Other handoff.");
    expect(ctx.pendingCompactions.get(otherSessionID)?.status).toBe("queued");
    consoleSpy.mockRestore();
  });

  it("populates current-wave task, blocker, and PR metadata from the DB", async () => {
    const sessionID = "session-wave-metadata";
    const nextStep = "Continue after compaction with full context.";

    const env = setupTestEnvironment("goop-compact-wave-metadata");
    const { createStateManager } = await import("../../features/state-manager/index.js");
    const realStateManager = createStateManager({ projectDir: env.testDir, db: env.db });
    realStateManager.updateWorkflow({
      phase: "execute",
      mode: "standard",
      depth: "standard",
      interviewComplete: true,
      specLocked: true,
      acceptanceConfirmed: false,
      currentWave: 2,
      totalWaves: 4,
      autopilot: true,
      lazyAutopilot: true,
    });

    env.db.upsertWave("default", {
      wave_number: 2,
      title: "Wave 2: Implementation",
      status: "in_progress",
      pr_branch: "feat/compaction-continuation-prompt",
      pr_url: "https://github.com/example/repo/pull/123",
    });

    const wave = env.db.getWave("default", 2);
    if (!wave) throw new Error("Test setup failed: wave not found");

    env.db.upsertWaveTask({
      wave_id: wave.id,
      workflow_id: "default",
      task_index: 0,
      description: "Extend snapshot type",
      agent: "goop-executor-medium",
      status: "in_progress",
    });
    env.db.upsertWaveTask({
      wave_id: wave.id,
      workflow_id: "default",
      task_index: 1,
      description: "Build formatter",
      agent: "goop-executor-high",
      status: "pending",
    });

    env.db.upsertBlocker("default", {
      description: "DB schema migration needed",
      severity: "high",
      status: "open",
      wave_id: wave.id,
    });
    env.db.upsertBlocker("default", {
      description: "Type mismatch in types.ts",
      severity: "medium",
      status: "open",
    });
    env.db.upsertBlocker("default", {
      description: "Already resolved",
      severity: "low",
      status: "resolved",
    });

    const realCtx = createMockPluginContext({
      testDir: env.testDir,
      db: env.db,
      stateManager: realStateManager,
    });
    setCompactionClient(realCtx, {
      session: { messages: modelMessages, summarize: mock(async () => ({ data: true })) },
    });

    await createGoopCompactTool(realCtx).execute(
      { next_step: nextStep },
      createMockToolContext({ sessionID }),
    );

    const snapshot = realCtx.compactionHandoff.get(sessionID);
    expect(snapshot).toBeDefined();
    expect(snapshot?.currentWaveTitle).toBe("Wave 2: Implementation");
    expect(snapshot?.currentWaveStatus).toBe("in_progress");
    expect(snapshot?.prBranch).toBe("feat/compaction-continuation-prompt");
    expect(snapshot?.prUrl).toBe("https://github.com/example/repo/pull/123");

    expect(snapshot?.tasks).toHaveLength(2);
    expect(snapshot?.tasks?.[0]).toEqual({
      index: 0,
      description: "Extend snapshot type",
      status: "in_progress",
      agent: "goop-executor-medium",
    });
    expect(snapshot?.tasks?.[1]).toEqual({
      index: 1,
      description: "Build formatter",
      status: "pending",
      agent: "goop-executor-high",
    });

    expect(snapshot?.openBlockers).toHaveLength(2);
    expect(snapshot?.openBlockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: "high",
          description: "DB schema migration needed",
        }),
        expect.objectContaining({
          severity: "medium",
          description: "Type mismatch in types.ts",
        }),
      ]),
    );
    expect(snapshot?.openBlockers?.every((b) => b.description !== "Already resolved")).toBeTrue();

    env.cleanup();
  });

  it("bounds tasks to 8 and open blockers to 5 in the snapshot", async () => {
    const sessionID = "session-bounded-metadata";
    const nextStep = "Resume with bounded context.";

    const env = setupTestEnvironment("goop-compact-bounded");
    const { createStateManager } = await import("../../features/state-manager/index.js");
    const realStateManager = createStateManager({ projectDir: env.testDir, db: env.db });
    realStateManager.updateWorkflow({
      phase: "execute",
      currentWave: 1,
      totalWaves: 3,
      interviewComplete: true,
      specLocked: true,
    });

    env.db.upsertWave("default", { wave_number: 1, title: "Wave 1", status: "in_progress" });
    const wave = env.db.getWave("default", 1);
    if (!wave) throw new Error("Test setup failed: wave not found");

    for (let i = 0; i < 10; i++) {
      env.db.upsertWaveTask({
        wave_id: wave.id,
        workflow_id: "default",
        task_index: i,
        description: `Task ${i}`,
        status: i < 5 ? "done" : "pending",
      });
    }
    for (let i = 0; i < 7; i++) {
      env.db.upsertBlocker("default", {
        description: `Blocker ${i}`,
        severity: "medium",
        status: "open",
      });
    }

    const realCtx = createMockPluginContext({
      testDir: env.testDir,
      db: env.db,
      stateManager: realStateManager,
    });
    setCompactionClient(realCtx, {
      session: { messages: modelMessages, summarize: mock(async () => ({ data: true })) },
    });

    await createGoopCompactTool(realCtx).execute(
      { next_step: nextStep },
      createMockToolContext({ sessionID }),
    );

    const snapshot = realCtx.compactionHandoff.get(sessionID);
    expect(snapshot).toBeDefined();
    expect(snapshot?.tasks).toHaveLength(8);
    expect(snapshot?.openBlockers).toHaveLength(5);

    env.cleanup();
  });

  it("produces undefined optional fields when the DB has no wave data", async () => {
    const sessionID = "session-empty-db";
    const nextStep = "Resume with minimal context.";

    const env = setupTestEnvironment("goop-compact-empty-db");
    const { createStateManager } = await import("../../features/state-manager/index.js");
    const realStateManager = createStateManager({ projectDir: env.testDir, db: env.db });
    realStateManager.updateWorkflow({
      phase: "execute",
      currentWave: 1,
      totalWaves: 3,
      interviewComplete: true,
      specLocked: true,
    });

    const realCtx = createMockPluginContext({
      testDir: env.testDir,
      db: env.db,
      stateManager: realStateManager,
    });
    setCompactionClient(realCtx, {
      session: { messages: modelMessages, summarize: mock(async () => ({ data: true })) },
    });

    await createGoopCompactTool(realCtx).execute(
      { next_step: nextStep },
      createMockToolContext({ sessionID }),
    );

    const snapshot = realCtx.compactionHandoff.get(sessionID);
    expect(snapshot).toBeDefined();
    expect(snapshot?.currentWaveTitle).toBeUndefined();
    expect(snapshot?.currentWaveStatus).toBeUndefined();
    expect(snapshot?.tasks).toBeUndefined();
    expect(snapshot?.openBlockers).toBeUndefined();
    expect(snapshot?.prBranch).toBeUndefined();
    expect(snapshot?.prUrl).toBeUndefined();
    expect(snapshot?.workflowId).toBe("default");
    expect(snapshot?.currentWave).toBe(1);
    expect(snapshot?.nextStep).toBe(nextStep);

    env.cleanup();
  });

  it("produces a valid core snapshot when DB accessors throw", async () => {
    const sessionID = "session-throwing-db";
    const nextStep = "Resume despite DB failure.";

    const env = setupTestEnvironment("goop-compact-throwing-db");
    const { createStateManager } = await import("../../features/state-manager/index.js");
    const realStateManager = createStateManager({ projectDir: env.testDir, db: env.db });
    realStateManager.updateWorkflow({
      phase: "execute",
      currentWave: 2,
      totalWaves: 4,
      interviewComplete: true,
      specLocked: true,
    });

    const realCtx = createMockPluginContext({
      testDir: env.testDir,
      db: env.db,
      stateManager: realStateManager,
    });
    setCompactionClient(realCtx, {
      session: { messages: modelMessages, summarize: mock(async () => ({ data: true })) },
    });

    const dbSpy = spyOn(realCtx.db, "getWaves").mockImplementation(() => {
      throw new Error("database is locked");
    });
    const consoleSpy = spyOn(console, "error").mockImplementation(() => {});

    await createGoopCompactTool(realCtx).execute(
      { next_step: nextStep },
      createMockToolContext({ sessionID }),
    );

    const snapshot = realCtx.compactionHandoff.get(sessionID);
    expect(snapshot).toBeDefined();
    expect(snapshot?.workflowId).toBe("default");
    expect(snapshot?.currentWave).toBe(2);
    expect(snapshot?.nextStep).toBe(nextStep);
    expect(snapshot?.currentWaveTitle).toBeUndefined();
    expect(snapshot?.currentWaveStatus).toBeUndefined();
    expect(snapshot?.tasks).toBeUndefined();
    expect(snapshot?.openBlockers).toBeUndefined();
    expect(snapshot?.prBranch).toBeUndefined();
    expect(snapshot?.prUrl).toBeUndefined();

    dbSpy.mockRestore();
    consoleSpy.mockRestore();
    env.cleanup();
  });
});
