import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import type { SdkPermission } from "../../core/sdk-compat.js";
import type { PluginContext } from "../../core/types.js";
import { createMockPluginContext, setupTestEnvironment } from "../../test-utils.js";
import { createLoopDetectionHook, loopDetectionState } from "./index.js";
import { canonicalArgsHash } from "./normalize.js";

function makePermission(overrides: Partial<SdkPermission> = {}): SdkPermission {
  return {
    id: "permission-1",
    type: "bash",
    pattern: "git status --short",
    sessionID: "loop-permission-session",
    messageID: "message-1",
    title: "Run git status --short",
    metadata: {},
    time: { created: Date.now() },
    ...overrides,
  };
}

function makeOutput(): { status: "ask" | "deny" | "allow" } {
  return { status: "ask" };
}

describe("loop-detection permission.ask hook", () => {
  let ctx: PluginContext;
  let cleanup: () => void;

  beforeEach(() => {
    const env = setupTestEnvironment("loop-permission");
    cleanup = env.cleanup;
    ctx = createMockPluginContext({ testDir: env.testDir });
  });

  afterEach(() => cleanup());

  it("denies a gated action matching a Tier 1 flagged signature", async () => {
    const command = "git status --short";
    const sessionID = "loop-permission-deny";
    const argsSignature = canonicalArgsHash("bash", { command });
    const hooks = createLoopDetectionHook(ctx);
    const output = makeOutput();

    for (let count = 0; count < 3; count += 1) {
      await hooks["tool.execute.after"]?.(
        { tool: "bash", sessionID, args: { command } } as never,
        { output: "same" } as never,
      );
    }

    await hooks["permission.ask"]?.(makePermission({ sessionID, pattern: command }), output);

    expect(output.status).toBe("deny");
    expect(loopDetectionState.isTier1Flagged(sessionID, "bash", argsSignature)).toBeFalse();
  });

  it("does not touch non-gated permission types", async () => {
    const hooks = createLoopDetectionHook(ctx);
    const output = makeOutput();

    await hooks["permission.ask"]?.(makePermission({ type: "read" }), output);

    expect(output.status).toBe("ask");
  });

  it("passes a relevant permission through when no signature is flagged", async () => {
    const hooks = createLoopDetectionHook(ctx);
    const output = makeOutput();

    await hooks["permission.ask"]?.(makePermission(), output);

    expect(output.status).toBe("ask");
  });

  it("gracefully ignores malformed permission requests", async () => {
    const hooks = createLoopDetectionHook(ctx);
    const output = makeOutput();

    await hooks["permission.ask"]?.({} as SdkPermission, output);

    expect(output.status).toBe("ask");
  });
});
