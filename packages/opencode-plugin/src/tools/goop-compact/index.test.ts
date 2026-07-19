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
    summarize: (input: { path: { id: string } }) => Promise<boolean>;
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
    const summarize = mock(async () => true);
    setCompactionClient(ctx, { session: { summarize } });
    const sessionID = "session-compact-001";
    const nextStep = "Verify the completed implementation, then begin the next work item.";

    const result = await createGoopCompactTool(ctx).execute(
      { next_step: nextStep },
      createMockToolContext({ sessionID }),
    );

    expect(summarize).toHaveBeenCalledWith({ path: { id: sessionID } });
    expect(ctx.compactionHandoff.get(sessionID)).toBe(nextStep);
    expect(result).toContain(`Compaction triggered for session ${sessionID}`);
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
    const summarize = mock(async () => {
      throw new Error("session unavailable");
    });
    setCompactionClient(ctx, { session: { summarize } });
    const sessionID = "session-compact-error";

    const result = await createGoopCompactTool(ctx).execute(
      { next_step: "Resume after the compaction attempt." },
      createMockToolContext({ sessionID }),
    );

    expect(result).toBe("goop_compact failed: unable to trigger session compaction.");
    expect(ctx.compactionHandoff.has(sessionID)).toBeFalse();
  });
});
