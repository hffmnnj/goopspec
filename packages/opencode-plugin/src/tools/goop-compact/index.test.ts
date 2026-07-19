import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

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
            model: { providerID: "opencode", modelID: "deepseek-v4" },
          },
          parts: [],
        },
      ],
    }));
    const summarize = mock(async () => ({ data: true }));
    setCompactionClient(ctx, { session: { messages, summarize } });
    const sessionID = "session-compact-001";
    const nextStep = "Verify the completed implementation, then begin the next work item.";

    const result = await createGoopCompactTool(ctx).execute(
      { next_step: nextStep },
      createMockToolContext({ sessionID }),
    );

    expect(summarize).toHaveBeenCalledWith({
      path: { id: sessionID },
      body: { providerID: "opencode", modelID: "deepseek-v4" },
    });
    expect(ctx.compactionHandoff.get(sessionID)).toBe(nextStep);
    expect(result).toContain(`Compaction completed for session ${sessionID}`);
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

  it("returns a failure status and clears the handoff when compaction throws", async () => {
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
    setCompactionClient(ctx, { session: { messages, summarize } });
    const sessionID = "session-compact-error";

    const result = await createGoopCompactTool(ctx).execute(
      { next_step: "Resume after the compaction attempt." },
      createMockToolContext({ sessionID }),
    );

    expect(result).toBe("goop_compact failed: unable to trigger session compaction.");
    expect(ctx.compactionHandoff.has(sessionID)).toBeFalse();
  });

  it("returns a failure status and clears the handoff when the SDK returns an error", async () => {
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
    setCompactionClient(ctx, { session: { messages, summarize } });
    const sessionID = "session-compact-rejected";

    const result = await createGoopCompactTool(ctx).execute(
      { next_step: "Resume only after accepted compaction." },
      createMockToolContext({ sessionID }),
    );

    expect(result).toContain("goop_compact failed");
    expect(result).toContain("model is required");
    expect(result).not.toContain("Compaction triggered");
    expect(ctx.compactionHandoff.has(sessionID)).toBeFalse();
  });

  it("returns a failure status when compaction responds with data false", async () => {
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

    const result = await createGoopCompactTool(ctx).execute(
      { next_step: "Resume after successful compaction." },
      createMockToolContext({ sessionID }),
    );

    expect(result).toContain("goop_compact failed");
    expect(result).not.toContain("Compaction triggered");
    expect(ctx.compactionHandoff.has(sessionID)).toBeFalse();
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
