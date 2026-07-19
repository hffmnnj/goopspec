import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";

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
      body?: { providerID: string; modelID: string };
    }) => Promise<unknown>;
  };
}

function setCompactionClient(ctx: PluginContext, client: CompactionClient): void {
  Object.assign(ctx.sdk.client, client);
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

  it("triggers compaction for the current session and records the handoff", async () => {
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
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(summarize).toHaveBeenCalledWith({
      path: { id: sessionID },
      body: { providerID: "opencode", modelID: "deepseek-v4" },
    });
    expect(ctx.compactionHandoff.get(sessionID)).toBe(nextStep);
    expect(result).not.toBe("timed out");
    expect(result).toContain(`Compaction requested for session ${sessionID}`);
    expect(result).toContain("it will apply after this turn completes");
    expect(promptAsync).toHaveBeenCalledWith({
      path: { id: sessionID },
      body: {
        model: { providerID: "opencode", modelID: "deepseek-v4" },
        agent: "goop-orchestrator",
        parts: [
          {
            type: "text",
            text: "Continue from the compaction summary. Recheck the workflow documents only if needed.",
          },
        ],
      },
    });
  });

  it("returns promptly when the compaction request remains pending", async () => {
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
    expect(summarize).toHaveBeenCalledWith({
      path: { id: sessionID },
      body: { providerID: "opencode", modelID: "deepseek-v4" },
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
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(result).toContain("Compaction requested");
    expect(consoleSpy).toHaveBeenCalled();
    expect(ctx.compactionHandoff.has(sessionID)).toBeFalse();
    expect(promptAsync).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("returns a failure status and clears the handoff when dispatch throws synchronously", async () => {
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

    expect(result).toBe("goop_compact failed: unable to trigger session compaction.");
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
});
