import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import type { PluginContext } from "../../core/types.js";
import {
  createMockPluginContext,
  createMockToolContext,
  setupTestEnvironment,
} from "../../test-utils.js";
import type { HookHandler } from "../types.js";
import { createCompactionHaltHook } from "./index.js";

type AfterInput = Parameters<HookHandler<"tool.execute.after">>[0];
type AfterOutput = Parameters<HookHandler<"tool.execute.after">>[1];
type SystemInput = Parameters<HookHandler<"experimental.chat.system.transform">>[0];
type SystemOutput = Parameters<HookHandler<"experimental.chat.system.transform">>[1];

const QUEUED_AT_MS = 1_000;

function makeAfterInput(sessionID: string): AfterInput {
  const toolContext = createMockToolContext({ sessionID });
  return {
    tool: "bash",
    sessionID: toolContext.sessionID,
    args: { command: "git status --short" },
    callID: "call-1",
  } as AfterInput;
}

function makeAfterOutput(value = "original tool output"): AfterOutput {
  return { output: value, title: "result", metadata: {} } as AfterOutput;
}

function makeSystemInput(sessionID: string): SystemInput {
  return { sessionID } as SystemInput;
}

function makeSystemOutput(): SystemOutput {
  return { system: [] } as SystemOutput;
}

describe("compaction-halt hook", () => {
  let ctx: PluginContext;
  let cleanup: () => void;

  beforeEach(() => {
    const env = setupTestEnvironment("compaction-halt");
    cleanup = env.cleanup;
    ctx = createMockPluginContext({ testDir: env.testDir });
  });

  afterEach(() => cleanup());

  it("does not halt a tool call from the turn that queued compaction", async () => {
    const sessionID = "same-turn";
    ctx.sessionManager.create(sessionID);
    ctx.pendingCompactions.set(sessionID, {
      model: { providerID: "openai", modelID: "gpt-5" },
      status: "queued",
      queuedAtMs: QUEUED_AT_MS,
    });
    ctx.compactionHandoff.set(sessionID, "Resume after compaction");
    const output = makeAfterOutput();

    await createCompactionHaltHook(ctx)["tool.execute.after"]?.(makeAfterInput(sessionID), output);

    expect(output.output).toBe("original tool output");
  });

  it("halts a tool call after the session has become idle in a later turn", async () => {
    const sessionID = "subsequent-turn";
    const record = ctx.sessionManager.create(sessionID);
    record.meta.idleSince = QUEUED_AT_MS + 1;
    ctx.pendingCompactions.set(sessionID, {
      model: { providerID: "openai", modelID: "gpt-5" },
      status: "queued",
      queuedAtMs: QUEUED_AT_MS,
    });
    const output = makeAfterOutput();

    await createCompactionHaltHook(ctx)["tool.execute.after"]?.(makeAfterInput(sessionID), output);

    expect(output.output).toContain("COMPACTION PENDING — END YOUR TURN");
    expect(output.output).toContain("original tool output");
  });

  it("leaves output unchanged after the pending request self-clears", async () => {
    const sessionID = "self-cleared";
    const output = makeAfterOutput();

    await createCompactionHaltHook(ctx)["tool.execute.after"]?.(makeAfterInput(sessionID), output);

    expect(output.output).toBe("original tool output");
  });

  it("uses request turns when the idle signal is unavailable", async () => {
    const sessionID = "v2-fallback";
    Object.defineProperty(ctx, "sessionManager", { configurable: true, value: {} });
    ctx.pendingCompactions.set(sessionID, {
      model: { providerID: "openai", modelID: "gpt-5" },
      status: "queued",
      queuedAtMs: QUEUED_AT_MS,
    });
    const hooks = createCompactionHaltHook(ctx);

    await hooks["experimental.chat.system.transform"]?.(
      makeSystemInput(sessionID),
      makeSystemOutput(),
    );
    const sameTurnOutput = makeAfterOutput();
    await hooks["tool.execute.after"]?.(makeAfterInput(sessionID), sameTurnOutput);
    expect(sameTurnOutput.output).toBe("original tool output");

    await hooks["experimental.chat.system.transform"]?.(
      makeSystemInput(sessionID),
      makeSystemOutput(),
    );
    const laterTurnOutput = makeAfterOutput();
    await hooks["tool.execute.after"]?.(makeAfterInput(sessionID), laterTurnOutput);
    expect(laterTurnOutput.output).toContain("COMPACTION PENDING — END YOUR TURN");
  });

  it("degrades safely when the session manager fails", async () => {
    const sessionID = "faulty-session-manager";
    Object.defineProperty(ctx, "sessionManager", {
      configurable: true,
      value: {
        get: () => {
          throw new Error("unavailable");
        },
      },
    });
    ctx.pendingCompactions.set(sessionID, {
      model: { providerID: "openai", modelID: "gpt-5" },
      status: "queued",
      queuedAtMs: QUEUED_AT_MS,
    });
    const output = makeAfterOutput();

    await expect(
      createCompactionHaltHook(ctx)["tool.execute.after"]?.(makeAfterInput(sessionID), output),
    ).resolves.toBeUndefined();

    expect(output.output).toBe("original tool output");
  });
});
