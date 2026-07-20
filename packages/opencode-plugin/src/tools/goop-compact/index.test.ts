import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";

import type { SdkEvent } from "../../core/sdk-compat.js";
import { createEventHandlerHook } from "../../hooks/event-handler.js";
import type { Hooks } from "../../hooks/types.js";
import {
  createMockPluginContext,
  createMockToolContext,
  setupTestEnvironment,
} from "../../test-utils.js";
import type { PluginContext } from "../../test-utils.js";
import { createGoopCompactTool } from "./index.js";

interface CompactionClient {
  session: {
    messages?: (input: { path: { id: string } }) => Promise<unknown>;
    promptAsync?: (input: {
      path: { id: string };
      body?: {
        model?: { providerID: string; modelID: string };
        agent?: string;
        parts: Array<{ type: "text"; text: string }>;
      };
    }) => Promise<unknown>;
    summarize: (input: {
      path: { id: string };
      body?: { providerID: string; modelID: string; auto?: boolean };
    }) => Promise<unknown>;
  };
}

function setCompactionClient(ctx: PluginContext, client: CompactionClient): void {
  Object.assign(ctx.sdk.client, client);
}

async function emitSessionIdle(ctx: PluginContext, sessionID: string): Promise<void> {
  const handler = createEventHandlerHook(ctx).event as NonNullable<Hooks["event"]>;
  await handler({
    event: { type: "session.idle", properties: { sessionID } } as SdkEvent,
  });
}

describe("createGoopCompactTool", () => {
  let ctx: PluginContext;
  let cleanup: () => void;

  beforeEach(() => {
    const env = setupTestEnvironment("goop-compact");
    cleanup = env.cleanup;
    ctx = createMockPluginContext({ testDir: env.testDir, db: env.db });
  });

  afterEach(() => cleanup());

  it("defers compaction until the current session becomes idle", async () => {
    const messages = mock(async () => ({
      data: [
        {
          info: {
            role: "user",
            agent: "goop-orchestrator",
            model: { providerID: "opencode", modelID: "deepseek-v4" },
          },
          parts: [],
        },
      ],
    }));
    const summarize = mock(async () => ({ data: true }));
    const promptAsync = mock(() => new Promise<unknown>(() => {}));
    setCompactionClient(ctx, { session: { messages, promptAsync, summarize } });
    const sessionID = "session-compact-001";
    const nextStep = "Verify the completed implementation, then begin the next work item.";

    const result = await Promise.race([
      createGoopCompactTool(ctx).execute(
        { next_step: nextStep },
        createMockToolContext({ sessionID }),
      ),
      new Promise<string>((resolve) => setTimeout(() => resolve("timed out"), 20)),
    ]);
    expect(summarize).not.toHaveBeenCalled();
    await emitSessionIdle(ctx, sessionID);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(summarize).toHaveBeenCalledWith({
      path: { id: sessionID },
      body: { providerID: "opencode", modelID: "deepseek-v4", auto: true },
    });
    expect(ctx.compactionHandoff.get(sessionID)).toBe(nextStep);
    expect(result).not.toBe("timed out");
    expect(result).toContain(`Compaction requested for session ${sessionID}`);
    expect(result).toContain("it will apply once the current turn completes");
    expect(result).toContain("The host will continue automatically");
    expect(promptAsync).not.toHaveBeenCalled();
  });

  it("returns promptly while compaction remains queued for session idle", async () => {
    const messages = mock(async () => ({
      data: [
        {
          info: {
            role: "user",
            model: { providerID: "opencode", modelID: "deepseek-v4" },
          },
          parts: [],
        },
      ],
    }));
    const summarize = mock(() => new Promise<unknown>(() => {}));
    setCompactionClient(ctx, { session: { messages, summarize } });
    const sessionID = "session-compact-pending";

    const result = await Promise.race([
      createGoopCompactTool(ctx).execute(
        { next_step: "Resume after queued compaction." },
        createMockToolContext({ sessionID }),
      ),
      new Promise<string>((resolve) => setTimeout(() => resolve("timed out"), 20)),
    ]);

    expect(result).not.toBe("timed out");
    expect(summarize).not.toHaveBeenCalled();
    await emitSessionIdle(ctx, sessionID);
    expect(summarize).toHaveBeenCalledWith({
      path: { id: sessionID },
      body: { providerID: "opencode", modelID: "deepseek-v4", auto: true },
    });
  });

  it("returns an unavailable status when session compaction is unsupported", async () => {
    const result = await createGoopCompactTool(ctx).execute(
      { next_step: "Resume the current work." },
      createMockToolContext(),
    );

    expect(result).toBe(
      "goop_compact unavailable: session compaction is not supported on this host.",
    );
  });

  it("returns promptly, logs, and clears the handoff when compaction later rejects", async () => {
    const messages = mock(async () => ({
      data: [
        {
          info: {
            role: "assistant",
            providerID: "opencode",
            modelID: "deepseek-v4",
          },
          parts: [],
        },
      ],
    }));
    const summarize = mock(async () => {
      throw new Error("session unavailable");
    });
    const promptAsync = mock(async () => ({ data: {} }));
    setCompactionClient(ctx, { session: { messages, promptAsync, summarize } });
    const sessionID = "session-compact-error";
    const consoleSpy = spyOn(console, "error").mockImplementation(() => {});

    const result = await createGoopCompactTool(ctx).execute(
      { next_step: "Resume after the compaction attempt." },
      createMockToolContext({ sessionID }),
    );
    expect(summarize).not.toHaveBeenCalled();
    await emitSessionIdle(ctx, sessionID);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(result).toContain("Compaction requested");
    expect(consoleSpy).toHaveBeenCalled();
    expect(ctx.compactionHandoff.has(sessionID)).toBeFalse();
    expect(promptAsync).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("clears the handoff when deferred dispatch throws synchronously", async () => {
    const messages = mock(async () => ({
      data: [
        {
          info: {
            role: "user",
            model: { providerID: "opencode", modelID: "deepseek-v4" },
          },
          parts: [],
        },
      ],
    }));
    const summarize = mock(() => {
      throw new Error("dispatch unavailable");
    });
    setCompactionClient(ctx, { session: { messages, summarize } });
    const sessionID = "session-compact-dispatch-error";
    const consoleSpy = spyOn(console, "error").mockImplementation(() => {});

    const result = await createGoopCompactTool(ctx).execute(
      { next_step: "Resume after the compaction attempt." },
      createMockToolContext({ sessionID }),
    );
    expect(summarize).not.toHaveBeenCalled();
    await emitSessionIdle(ctx, sessionID);

    expect(result).toContain("Compaction requested");
    expect(consoleSpy).toHaveBeenCalled();
    expect(ctx.compactionHandoff.has(sessionID)).toBeFalse();
    consoleSpy.mockRestore();
  });

  it("logs and clears the handoff when the SDK later returns an error", async () => {
    const messages = mock(async () => ({
      data: [
        {
          info: {
            role: "user",
            model: { providerID: "opencode", modelID: "deepseek-v4" },
          },
          parts: [],
        },
      ],
    }));
    const summarize = mock(async () => ({
      data: undefined,
      error: { name: "BadRequest", data: { message: "model is required" } },
    }));
    const promptAsync = mock(async () => ({ data: {} }));
    setCompactionClient(ctx, { session: { messages, promptAsync, summarize } });
    const sessionID = "session-compact-rejected";
    const consoleSpy = spyOn(console, "error").mockImplementation(() => {});

    const result = await createGoopCompactTool(ctx).execute(
      { next_step: "Resume only after accepted compaction." },
      createMockToolContext({ sessionID }),
    );
    expect(summarize).not.toHaveBeenCalled();
    await emitSessionIdle(ctx, sessionID);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(result).toContain("Compaction requested");
    expect(consoleSpy).toHaveBeenCalled();
    expect(ctx.compactionHandoff.has(sessionID)).toBeFalse();
    expect(promptAsync).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("logs and clears the handoff when compaction later responds with data false", async () => {
    const messages = mock(async () => ({
      data: [
        {
          info: {
            role: "user",
            model: { providerID: "opencode", modelID: "deepseek-v4" },
          },
          parts: [],
        },
      ],
    }));
    const summarize = mock(async () => ({ data: false }));
    setCompactionClient(ctx, { session: { messages, summarize } });
    const sessionID = "session-compact-false";
    const consoleSpy = spyOn(console, "error").mockImplementation(() => {});

    const result = await createGoopCompactTool(ctx).execute(
      { next_step: "Resume after successful compaction." },
      createMockToolContext({ sessionID }),
    );
    expect(summarize).not.toHaveBeenCalled();
    await emitSessionIdle(ctx, sessionID);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(result).toContain("Compaction requested");
    expect(consoleSpy).toHaveBeenCalled();
    expect(ctx.compactionHandoff.has(sessionID)).toBeFalse();
    consoleSpy.mockRestore();
  });

  it("rejects an empty session ID without calling the SDK", async () => {
    const summarize = mock(async () => ({ data: true }));
    setCompactionClient(ctx, { session: { summarize } });

    const result = await createGoopCompactTool(ctx).execute(
      { next_step: "Resume current work." },
      createMockToolContext({ sessionID: "   " }),
    );

    expect(result).toBe("goop_compact failed: a session ID is required to trigger compaction.");
    expect(summarize).not.toHaveBeenCalled();
  });

  it("does not admit a second compaction while one is pending or in flight", async () => {
    const messages = mock(async () => ({
      data: [
        {
          info: {
            role: "user",
            model: { providerID: "opencode", modelID: "deepseek-v4" },
          },
          parts: [],
        },
      ],
    }));
    const summarize = mock(() => new Promise<unknown>(() => {}));
    setCompactionClient(ctx, { session: { messages, summarize } });
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
    expect(summarize).not.toHaveBeenCalled();
    expect(ctx.compactionHandoff.get(sessionID)).toBe("Continue the first requested task.");

    await emitSessionIdle(ctx, sessionID);
    await emitSessionIdle(ctx, sessionID);

    expect(summarize).toHaveBeenCalledTimes(1);
  });
});
