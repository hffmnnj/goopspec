import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";

import {
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

    expect(result).toContain(`Compaction requested for session ${sessionID}`);
    expect(abort).not.toHaveBeenCalled();
    expect(summarize).not.toHaveBeenCalled();
    expect(ctx.compactionHandoff.get(sessionID)).toBe(nextStep);
    expect(ctx.pendingCompactions.get(sessionID)?.status).toBe("queued");
  });

  it("blocks duplicate requests while compaction is pending", async () => {
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

    expect(duplicate).toBe(
      `Compaction is already pending or in flight for session ${sessionID}; no additional compaction was requested.`,
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
    expect(available).toContain("Compaction requested");

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
    setCompactionClient(ctx, {
      session: {
        messages: async () => ({ error: "unavailable" }),
        summarize: mock(async () => ({ data: true })),
      },
    });
    ctx.compactionHandoff.set(sessionID, "Old handoff.");

    const result = await createGoopCompactTool(ctx).execute(
      { next_step: "Resume current work." },
      createMockToolContext({ sessionID }),
    );

    expect(result).toBe(
      "goop_compact failed: unable to resolve the current session model: unavailable",
    );
    expect(ctx.compactionHandoff.has(sessionID)).toBeFalse();
  });

  it("dispatches queued compaction once with auto and clears it on success", async () => {
    const sessionID = "session-dispatch";
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
    ctx.compactionHandoff.set(sessionID, "Resume after compaction.");
    ctx.pendingCompactions.set(sessionID, {
      model: { providerID: "opencode", modelID: "deepseek-v4" },
      status: "queued",
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
  });

  it("does not dispatch absent or already in-flight requests", async () => {
    const summarize = mock(async () => ({ data: true }));
    const sessionID = "session-in-flight";
    setCompactionClient(ctx, { session: { summarize } });

    dispatchPendingCompaction(ctx, sessionID);
    ctx.pendingCompactions.set(sessionID, {
      model: { providerID: "opencode", modelID: "deepseek-v4" },
      status: "queued",
    });
    dispatchPendingCompaction(ctx, sessionID);
    dispatchPendingCompaction(ctx, sessionID);
    await flushPromises();

    expect(summarize).toHaveBeenCalledTimes(1);
  });

  it("clears handoff and pending state when summarize rejects", async () => {
    const summarize = mock(async () => {
      throw new Error("summarize unavailable");
    });
    const sessionID = "session-compact-rejected";
    const consoleSpy = spyOn(console, "error").mockImplementation(() => {});
    setCompactionClient(ctx, { session: { summarize } });
    ctx.compactionHandoff.set(sessionID, "Resume after the compaction attempt.");
    ctx.pendingCompactions.set(sessionID, {
      model: { providerID: "opencode", modelID: "deepseek-v4" },
      status: "queued",
    });

    dispatchPendingCompaction(ctx, sessionID);
    await flushPromises();

    expect(consoleSpy).toHaveBeenCalled();
    expect(ctx.compactionHandoff.has(sessionID)).toBeFalse();
    expect(ctx.pendingCompactions.has(sessionID)).toBeFalse();
    consoleSpy.mockRestore();
  });
});
