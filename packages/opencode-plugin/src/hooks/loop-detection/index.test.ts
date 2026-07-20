import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

import type { SdkPermission } from "../../core/sdk-compat.js";
import type { PluginContext } from "../../core/types.js";
import { createMockPluginContext, setupTestEnvironment } from "../../test-utils.js";
import type { HookHandler } from "../types.js";
import { __clearLoopConfigCache, createLoopDetectionHook, loopDetectionState } from "./index.js";
import { canonicalArgsHash } from "./normalize.js";

type AfterInput = Parameters<HookHandler<"tool.execute.after">>[0];
type AfterOutput = Parameters<HookHandler<"tool.execute.after">>[1];

function makeAfterInput(overrides: Partial<AfterInput> = {}): AfterInput {
  return {
    tool: "bash",
    sessionID: "default-session",
    args: { command: "git status --short" },
    callID: "call-1",
    ...overrides,
  } as AfterInput;
}

function makeAfterOutput(value = "original"): AfterOutput {
  return { output: value, title: "result", metadata: {} } as AfterOutput;
}

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

function makePermissionOutput(): { status: "ask" | "deny" | "allow" } {
  return { status: "ask" };
}

function writeProjectConfig(testDir: string, loopDetection: Record<string, unknown>): void {
  writeFileSync(join(testDir, "goopspec.json"), JSON.stringify({ loopDetection }), "utf-8");
}

describe("loop-detection tool.execute.after hook", () => {
  let ctx: PluginContext;
  let cleanup: () => void;
  let originalGlobalConfigPath: string | undefined;

  beforeEach(() => {
    const env = setupTestEnvironment("loop-after");
    cleanup = env.cleanup;
    originalGlobalConfigPath = process.env.GOOPSPEC_GLOBAL_CONFIG_PATH;
    process.env.GOOPSPEC_GLOBAL_CONFIG_PATH = join(env.testDir, "global-goopspec.json");
    ctx = createMockPluginContext({ testDir: env.testDir });
  });

  afterEach(() => {
    __clearLoopConfigCache();
    if (originalGlobalConfigPath === undefined) {
      process.env.GOOPSPEC_GLOBAL_CONFIG_PATH = undefined;
    } else {
      process.env.GOOPSPEC_GLOBAL_CONFIG_PATH = originalGlobalConfigPath;
    }
    cleanup();
  });

  it("replaces output with Tier 1 stop directive after threshold", async () => {
    const hooks = createLoopDetectionHook(ctx);
    const sessionID = "tier1-rewrite";
    const args = { command: "git log --oneline -10" };
    const output = "same output";

    for (let i = 0; i < 2; i += 1) {
      const out = makeAfterOutput(output);
      await hooks["tool.execute.after"]?.(makeAfterInput({ tool: "bash", sessionID, args }), out);
      expect(out.output).toBe(output);
    }

    const out = makeAfterOutput(output);
    await hooks["tool.execute.after"]?.(makeAfterInput({ tool: "bash", sessionID, args }), out);

    expect(out.output).toContain("LOOP DETECTED");
    expect(out.output).toContain('Tool "bash" repeated 3 times');
    expect(out.output).not.toContain(output);
  });

  it("does not rewrite when output varies each call", async () => {
    const hooks = createLoopDetectionHook(ctx);
    const sessionID = "varying-output";
    const args = { command: "git log --oneline -10" };

    for (let i = 0; i < 3; i += 1) {
      const out = makeAfterOutput(`output-${i}`);
      await hooks["tool.execute.after"]?.(makeAfterInput({ tool: "bash", sessionID, args }), out);
      expect(out.output).toBe(`output-${i}`);
    }
  });

  it("does not rewrite when an intervening distinct call breaks consecutiveness", async () => {
    const hooks = createLoopDetectionHook(ctx);
    const sessionID = "intervening-call";
    const argsA = { command: "git log --oneline -10" };
    const argsB = { command: "ls -la" };
    const output = "same";

    const sequence = [
      { args: argsA, out: output },
      { args: argsA, out: output },
      { args: argsB, out: "listing" },
      { args: argsA, out: output },
    ];

    for (const call of sequence) {
      const out = makeAfterOutput(call.out);
      await hooks["tool.execute.after"]?.(
        makeAfterInput({ tool: "bash", sessionID, args: call.args }),
        out,
      );
      expect(out.output).toBe(call.out);
    }
  });

  it("respects a project config threshold override", async () => {
    writeProjectConfig(ctx.sdk.directory, { tier1Threshold: 2 });
    const hooks = createLoopDetectionHook(ctx);
    const sessionID = "threshold-override";
    const args = { command: "git log --oneline -10" };
    const output = "same";

    const first = makeAfterOutput(output);
    await hooks["tool.execute.after"]?.(makeAfterInput({ tool: "bash", sessionID, args }), first);
    expect(first.output).toBe(output);

    const second = makeAfterOutput(output);
    await hooks["tool.execute.after"]?.(makeAfterInput({ tool: "bash", sessionID, args }), second);
    expect(second.output).toContain("LOOP DETECTED");
    expect(second.output).toContain('Tool "bash" repeated 2 times');
  });

  it("no-ops when loop detection is disabled", async () => {
    writeProjectConfig(ctx.sdk.directory, { enabled: false });
    const hooks = createLoopDetectionHook(ctx);
    const sessionID = "disabled";
    const args = { command: "git log --oneline -10" };
    const output = "same";

    for (let i = 0; i < 5; i += 1) {
      const out = makeAfterOutput(output);
      await expect(
        hooks["tool.execute.after"]?.(makeAfterInput({ tool: "bash", sessionID, args }), out),
      ).resolves.toBeUndefined();
      expect(out.output).toBe(output);
    }
  });

  it("gracefully handles missing or malformed config without throwing", async () => {
    const badCtx = createMockPluginContext({
      testDir: "/nonexistent/path-for-loop-test",
    });
    const hooks = createLoopDetectionHook(badCtx);
    const sessionID = "missing-config";
    const args = { command: "git log --oneline -10" };

    const out = makeAfterOutput("same");
    await expect(
      hooks["tool.execute.after"]?.(makeAfterInput({ tool: "bash", sessionID, args }), out),
    ).resolves.toBeUndefined();
    expect(out.output).toBe("same");

    writeFileSync(join(ctx.sdk.directory, "goopspec.json"), "{ invalid json", "utf-8");
    const hooks2 = createLoopDetectionHook(ctx);
    const out2 = makeAfterOutput("same2");
    await expect(
      hooks2["tool.execute.after"]?.(makeAfterInput({ tool: "bash", sessionID, args }), out2),
    ).resolves.toBeUndefined();
    expect(out2.output).toBe("same2");
  });

  it("writes chronicle and ADL exactly once on Tier 1 and never on Tier 2", async () => {
    const chronicleSpy = spyOn(ctx.db, "appendChronicleEvent");
    const docSpy = spyOn(ctx.db, "appendDocument");
    const adlSpy = spyOn(ctx.stateManager, "appendADL");

    const hooks = createLoopDetectionHook(ctx);
    const sessionID = "chronicle-tier1";
    const args = { command: "git log --oneline -10" };
    const output = "same";

    for (let i = 0; i < 3; i += 1) {
      const out = makeAfterOutput(output);
      await hooks["tool.execute.after"]?.(makeAfterInput({ tool: "bash", sessionID, args }), out);
    }

    expect(chronicleSpy).toHaveBeenCalledTimes(1);
    expect(docSpy).toHaveBeenCalledTimes(1);
    expect(adlSpy).toHaveBeenCalledTimes(1);
    expect(chronicleSpy.mock.calls[0][1]).toContain("Loop detection intervened");
    expect(chronicleSpy.mock.calls[0][1]).toContain("bash");

    chronicleSpy.mockClear();
    docSpy.mockClear();
    adlSpy.mockClear();

    const sessionID2 = "chronicle-tier2";
    const argsA = { command: "git log --oneline -10" };
    const argsB = { command: "ls -la" };

    const calls = [
      { args: argsA, out: "out-1" },
      { args: argsA, out: "out-2" },
      { args: argsB, out: "other" },
      { args: argsA, out: "out-3" },
      { args: argsA, out: "out-4" },
    ];

    for (const call of calls) {
      const out = makeAfterOutput(call.out);
      await hooks["tool.execute.after"]?.(
        makeAfterInput({ tool: "bash", sessionID: sessionID2, args: call.args }),
        out,
      );
    }

    expect(chronicleSpy).not.toHaveBeenCalled();
    expect(docSpy).not.toHaveBeenCalled();
    expect(adlSpy).not.toHaveBeenCalled();
  });

  it("appends a Tier 2 soft warning without replacing original output", async () => {
    const hooks = createLoopDetectionHook(ctx);
    const sessionID = "tier2-append";
    const argsA = { command: "git log --oneline -10" };
    const argsB = { command: "ls -la" };

    const calls = [
      { args: argsA, out: "out-1" },
      { args: argsA, out: "out-2" },
      { args: argsB, out: "other" },
      { args: argsA, out: "out-3" },
      { args: argsA, out: "out-4" },
    ];

    for (let i = 0; i < calls.length; i += 1) {
      const call = calls[i];
      const out = makeAfterOutput(call.out);
      await hooks["tool.execute.after"]?.(
        makeAfterInput({ tool: "bash", sessionID, args: call.args }),
        out,
      );

      if (i === calls.length - 1) {
        expect(out.output).toContain("out-4");
        expect(out.output).toContain("Loop warning");
      } else {
        expect(out.output).toBe(call.out);
      }
    }
  });
});

describe("loop-detection permission.ask hook", () => {
  let ctx: PluginContext;
  let cleanup: () => void;
  let originalGlobalConfigPath: string | undefined;

  beforeEach(() => {
    const env = setupTestEnvironment("loop-permission");
    cleanup = env.cleanup;
    originalGlobalConfigPath = process.env.GOOPSPEC_GLOBAL_CONFIG_PATH;
    process.env.GOOPSPEC_GLOBAL_CONFIG_PATH = join(env.testDir, "global-goopspec.json");
    ctx = createMockPluginContext({ testDir: env.testDir });
  });

  afterEach(() => {
    __clearLoopConfigCache();
    if (originalGlobalConfigPath === undefined) {
      process.env.GOOPSPEC_GLOBAL_CONFIG_PATH = undefined;
    } else {
      process.env.GOOPSPEC_GLOBAL_CONFIG_PATH = originalGlobalConfigPath;
    }
    cleanup();
  });

  it("denies a gated action matching a Tier 1 flagged signature", async () => {
    const command = "git status --short";
    const sessionID = "loop-permission-deny";
    const argsSignature = canonicalArgsHash("bash", { command });
    const hooks = createLoopDetectionHook(ctx);
    const output = makePermissionOutput();

    for (let count = 0; count < 3; count += 1) {
      await hooks["tool.execute.after"]?.(
        makeAfterInput({ tool: "bash", sessionID, args: { command } }),
        makeAfterOutput("same"),
      );
    }

    await hooks["permission.ask"]?.(makePermission({ sessionID, pattern: command }), output);

    expect(output.status).toBe("deny");
    expect(loopDetectionState.isTier1Flagged(sessionID, "bash", argsSignature)).toBeFalse();
  });

  it("does not touch non-gated permission types", async () => {
    const hooks = createLoopDetectionHook(ctx);
    const output = makePermissionOutput();

    await hooks["permission.ask"]?.(makePermission({ type: "read" }), output);

    expect(output.status).toBe("ask");
  });

  it("passes a relevant permission through when no signature is flagged", async () => {
    const hooks = createLoopDetectionHook(ctx);
    const output = makePermissionOutput();

    await hooks["permission.ask"]?.(makePermission(), output);

    expect(output.status).toBe("ask");
  });

  it("gracefully ignores malformed permission requests", async () => {
    const hooks = createLoopDetectionHook(ctx);
    const output = makePermissionOutput();

    await hooks["permission.ask"]?.({} as SdkPermission, output);

    expect(output.status).toBe("ask");
  });
});
