import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";

import {
  createMockPluginContext,
  createMockToolContext,
  setupTestEnvironment,
} from "../../test-utils.js";
import type { PluginContext } from "../../test-utils.js";
import { COMPACTION_SETTLE_MS, createGoopCompactTool } from "./index.js";

interface CompactionClient {
  session: {
    messages?: (input: { path: { id: string } }) => Promise<unknown>;
    abort?: (input: { path: { id: string } }) => Promise<unknown>;
    summarize?: (input: {
      path: { id: string };
      body?: { providerID: string; modelID: string };
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
  let settleCallback: (() => void) | undefined;
  let settleDelay: number | undefined;
  let setTimeoutSpy: ReturnType<typeof spyOn>;

  async function advanceThroughSettleDelay(): Promise<void> {
    await Promise.resolve();
    if (!settleCallback) throw new Error("Expected compaction settle timer to be scheduled");
    settleCallback();
    await Promise.resolve();
    await Promise.resolve();
  }

  beforeEach(() => {
    const env = setupTestEnvironment("goop-compact");
    cleanup = env.cleanup;
    ctx = createMockPluginContext({ testDir: env.testDir, db: env.db });
    settleCallback = undefined;
    settleDelay = undefined;
    setTimeoutSpy = spyOn(globalThis, "setTimeout").mockImplementation(((
      callback: () => void,
      delay?: number,
    ) => {
      settleCallback = callback;
      settleDelay = delay;
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout);
  });

  afterEach(() => {
    setTimeoutSpy.mockRestore();
    cleanup();
  });

  it("aborts, waits for the settle delay, then summarizes once without auto", async () => {
    const calls: string[] = [];
    const abort = mock(async () => {
      calls.push("abort");
      return { data: true };
    });
    const summarize = mock(async () => {
      calls.push("summarize");
      return { data: true };
    });
    setCompactionClient(ctx, { session: { messages: modelMessages, abort, summarize } });
    const sessionID = "session-compact-001";
    const nextStep = "Verify the completed implementation, then begin the next work item.";

    const result = await createGoopCompactTool(ctx).execute(
      { next_step: nextStep },
      createMockToolContext({ sessionID }),
    );

    expect(result).toContain(`Compaction requested for session ${sessionID}`);
    expect(abort).toHaveBeenCalledWith({ path: { id: sessionID } });
    expect(summarize).not.toHaveBeenCalled();
    expect(ctx.compactionHandoff.get(sessionID)).toBe(nextStep);

    await Promise.resolve();
    expect(settleDelay).toBe(COMPACTION_SETTLE_MS);
    expect(summarize).not.toHaveBeenCalled();

    if (!settleCallback) throw new Error("Expected compaction settle timer to be scheduled");
    settleCallback();
    await Promise.resolve();
    await Promise.resolve();

    expect(calls).toEqual(["abort", "summarize"]);
    expect(summarize).toHaveBeenCalledTimes(1);
    expect(summarize).toHaveBeenCalledWith({
      path: { id: sessionID },
      body: { providerID: "opencode", modelID: "deepseek-v4" },
    });
    expect(ctx.pendingCompactions.has(sessionID)).toBeFalse();
  });

  it("returns promptly and blocks duplicate compaction while the sequence is in flight", async () => {
    const abort = mock(async () => ({ data: true }));
    const summarize = mock(async () => ({ data: true }));
    setCompactionClient(ctx, { session: { messages: modelMessages, abort, summarize } });
    const sessionID = "session-compact-duplicate";
    const compact = createGoopCompactTool(ctx);

    const first = await compact.execute(
      { next_step: "Continue the first requested task." },
      createMockToolContext({ sessionID }),
    );
    const duplicate = await compact.execute(
      { next_step: "This must not create another compaction." },
      createMockToolContext({ sessionID }),
    );

    expect(first).toContain("Compaction requested");
    expect(duplicate).toContain("already pending or in flight");
    expect(abort).toHaveBeenCalledTimes(1);
    expect(summarize).not.toHaveBeenCalled();

    await advanceThroughSettleDelay();

    expect(summarize).toHaveBeenCalledTimes(1);
    expect(ctx.compactionHandoff.get(sessionID)).toBe("Continue the first requested task.");
  });

  it("returns unavailable without partial execution when abort is missing", async () => {
    const summarize = mock(async () => ({ data: true }));
    setCompactionClient(ctx, { session: { messages: modelMessages, summarize } });

    const result = await createGoopCompactTool(ctx).execute(
      { next_step: "Resume the current work." },
      createMockToolContext(),
    );

    expect(result).toBe(
      "goop_compact unavailable: session compaction is not supported on this host.",
    );
    expect(summarize).not.toHaveBeenCalled();
  });

  it("returns unavailable without partial execution when summarize is missing", async () => {
    const abort = mock(async () => ({ data: true }));
    setCompactionClient(ctx, { session: { messages: modelMessages, abort } });

    const result = await createGoopCompactTool(ctx).execute(
      { next_step: "Resume the current work." },
      createMockToolContext(),
    );

    expect(result).toBe(
      "goop_compact unavailable: session compaction is not supported on this host.",
    );
    expect(abort).not.toHaveBeenCalled();
  });

  it("clears the handoff and guard when the detached sequence fails", async () => {
    const abort = mock(async () => {
      throw new Error("session unavailable");
    });
    const summarize = mock(async () => ({ data: true }));
    setCompactionClient(ctx, { session: { messages: modelMessages, abort, summarize } });
    const sessionID = "session-compact-error";
    const consoleSpy = spyOn(console, "error").mockImplementation(() => {});

    const result = await createGoopCompactTool(ctx).execute(
      { next_step: "Resume after the compaction attempt." },
      createMockToolContext({ sessionID }),
    );
    await Promise.resolve();
    await Promise.resolve();

    expect(result).toContain("Compaction requested");
    expect(consoleSpy).toHaveBeenCalled();
    expect(ctx.compactionHandoff.has(sessionID)).toBeFalse();
    expect(ctx.pendingCompactions.has(sessionID)).toBeFalse();
    expect(summarize).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("clears the handoff when summarize rejects after the settle delay", async () => {
    const abort = mock(async () => ({ data: true }));
    const summarize = mock(async () => {
      throw new Error("summarize unavailable");
    });
    setCompactionClient(ctx, { session: { messages: modelMessages, abort, summarize } });
    const sessionID = "session-compact-rejected";
    const consoleSpy = spyOn(console, "error").mockImplementation(() => {});

    await createGoopCompactTool(ctx).execute(
      { next_step: "Resume after the compaction attempt." },
      createMockToolContext({ sessionID }),
    );
    await advanceThroughSettleDelay();

    expect(consoleSpy).toHaveBeenCalled();
    expect(ctx.compactionHandoff.has(sessionID)).toBeFalse();
    expect(ctx.pendingCompactions.has(sessionID)).toBeFalse();
    consoleSpy.mockRestore();
  });

  it("rejects an empty session ID without calling the SDK", async () => {
    const abort = mock(async () => ({ data: true }));
    const summarize = mock(async () => ({ data: true }));
    setCompactionClient(ctx, { session: { abort, summarize } });

    const result = await createGoopCompactTool(ctx).execute(
      { next_step: "Resume current work." },
      createMockToolContext({ sessionID: "   " }),
    );

    expect(result).toBe("goop_compact failed: a session ID is required to trigger compaction.");
    expect(abort).not.toHaveBeenCalled();
    expect(summarize).not.toHaveBeenCalled();
  });
});
