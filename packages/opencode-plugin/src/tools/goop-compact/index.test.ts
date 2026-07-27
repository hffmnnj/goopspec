import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";

import { PENDING_COMPACTION_TTL_MS } from "../../core/constants.js";
import { createCompactionHook } from "../../hooks/compaction-hook.js";
import {
  createMockCompactionHandoff,
  createMockPluginContext,
  createMockToolContext,
  setupTestEnvironment,
} from "../../test-utils.js";
import type { PluginContext } from "../../test-utils.js";
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
    expect(output.context.join("\n")).toContain(nextStep);
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
});
