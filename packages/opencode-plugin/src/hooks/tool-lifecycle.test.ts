import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import type { PluginContext } from "../core/types.js";
import { createMockPluginContext, delay, setupTestEnvironment } from "../test-utils.js";
import {
  createToolLifecycleHook,
  isSignificant,
  toolLifecycleHookFactory,
} from "./tool-lifecycle.js";
import type { Hooks } from "./types.js";

// ---------------------------------------------------------------------------
// Helper: extract handlers with safe narrowing (avoids non-null assertions)
// ---------------------------------------------------------------------------

function getHandlers(ctx: PluginContext): {
  beforeHook: NonNullable<Hooks["tool.execute.before"]>;
  afterHook: NonNullable<Hooks["tool.execute.after"]>;
} {
  const hooks = createToolLifecycleHook(ctx);
  const beforeHook = hooks["tool.execute.before"];
  const afterHook = hooks["tool.execute.after"];
  if (!beforeHook || !afterHook) {
    throw new Error("Expected both before and after handlers to be defined");
  }
  return { beforeHook, afterHook };
}

// ---------------------------------------------------------------------------
// isSignificant
// ---------------------------------------------------------------------------

describe("isSignificant", () => {
  it("returns true for goop_state transition", () => {
    expect(isSignificant("goop_state", { action: "transition", phase: "execute" })).toBe(true);
  });

  it("returns true for goop_state lock-spec", () => {
    expect(isSignificant("goop_state", { action: "lock-spec" })).toBe(true);
  });

  it("returns true for goop_state unlock-spec", () => {
    expect(isSignificant("goop_state", { action: "unlock-spec" })).toBe(true);
  });

  it("returns true for goop_state update-wave", () => {
    expect(
      isSignificant("goop_state", { action: "update-wave", currentWave: 2, totalWaves: 5 }),
    ).toBe(true);
  });

  it("returns true for goop_state complete-interview", () => {
    expect(isSignificant("goop_state", { action: "complete-interview" })).toBe(true);
  });

  it("returns true for goop_state confirm-acceptance", () => {
    expect(isSignificant("goop_state", { action: "confirm-acceptance" })).toBe(true);
  });

  it("returns true for goop_state set-mode", () => {
    expect(isSignificant("goop_state", { action: "set-mode", mode: "quick" })).toBe(true);
  });

  it("returns true for goop_state create-workflow", () => {
    expect(isSignificant("goop_state", { action: "create-workflow", workflowId: "feat-x" })).toBe(
      true,
    );
  });

  it("returns true for goop_state reset", () => {
    expect(isSignificant("goop_state", { action: "reset" })).toBe(true);
  });

  it("returns false for goop_state get (read)", () => {
    expect(isSignificant("goop_state", { action: "get" })).toBe(false);
  });

  it("returns false for goop_state list-workflows (read)", () => {
    expect(isSignificant("goop_state", { action: "list-workflows" })).toBe(false);
  });

  it("returns false for goop_state with missing action", () => {
    expect(isSignificant("goop_state", {})).toBe(false);
  });

  it("returns true for goop_adl append", () => {
    expect(isSignificant("goop_adl", { action: "append", description: "test" })).toBe(true);
  });

  it("returns false for goop_adl read", () => {
    expect(isSignificant("goop_adl", { action: "read" })).toBe(false);
  });

  it("returns true for goop_checkpoint save", () => {
    expect(isSignificant("goop_checkpoint", { action: "save", id: "wave-1" })).toBe(true);
  });

  it("returns false for goop_checkpoint list", () => {
    expect(isSignificant("goop_checkpoint", { action: "list" })).toBe(false);
  });

  it("returns false for goop_checkpoint load", () => {
    expect(isSignificant("goop_checkpoint", { action: "load", id: "wave-1" })).toBe(false);
  });

  it("returns true for goop_setup (any action)", () => {
    expect(isSignificant("goop_setup", { action: "init" })).toBe(true);
    expect(isSignificant("goop_setup", { action: "apply" })).toBe(true);
  });

  it("returns false for non-significant tools", () => {
    expect(isSignificant("goop_status", {})).toBe(false);
    expect(isSignificant("goop_spec", { action: "read" })).toBe(false);
    expect(isSignificant("goop_reference", { name: "executor-core" })).toBe(false);
    expect(isSignificant("memory_search", { query: "test" })).toBe(false);
    expect(isSignificant("memory_save", { title: "test" })).toBe(false);
    expect(isSignificant("slashcommand", { command: "/goop-status" })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// createToolLifecycleHook — before handler
// ---------------------------------------------------------------------------

describe("createToolLifecycleHook before handler", () => {
  let ctx: PluginContext;
  let cleanup: () => void;

  beforeEach(() => {
    const env = setupTestEnvironment("tool-lifecycle-bh");
    cleanup = env.cleanup;
    ctx = createMockPluginContext({ testDir: env.testDir });
  });

  afterEach(() => cleanup());

  it("fires without error", async () => {
    const { beforeHook } = getHandlers(ctx);
    const output = { args: { action: "get" } };
    await beforeHook({ tool: "goop_state", sessionID: "s1", callID: "c1" }, output);
  });

  it("does not mutate the output args", async () => {
    const { beforeHook } = getHandlers(ctx);
    const args = { action: "get", extra: "data" };
    const output = { args };
    await beforeHook({ tool: "goop_state", sessionID: "s1", callID: "c2" }, output);

    expect(output.args).toBe(args);
    expect(output.args.action).toBe("get");
  });
});

// ---------------------------------------------------------------------------
// createToolLifecycleHook — after handler
// ---------------------------------------------------------------------------

describe("createToolLifecycleHook after handler", () => {
  let ctx: PluginContext;
  let cleanup: () => void;

  beforeEach(() => {
    const env = setupTestEnvironment("tool-lifecycle-ah");
    cleanup = env.cleanup;
    ctx = createMockPluginContext({ testDir: env.testDir });
  });

  afterEach(() => cleanup());

  it("fires without error", async () => {
    const { afterHook } = getHandlers(ctx);
    const output = {
      title: "test",
      output: "result",
      metadata: {} as Record<string, unknown>,
    };
    await afterHook({ tool: "goop_state", sessionID: "s1", callID: "c10" }, output);
  });

  it("injects durationMs into metadata when before was called first", async () => {
    const { beforeHook, afterHook } = getHandlers(ctx);
    const callID = "c-timing-1";

    await beforeHook({ tool: "goop_status", sessionID: "s1", callID }, { args: {} });
    await delay(5);

    const output = {
      title: "status",
      output: "ok",
      metadata: {} as Record<string, unknown>,
    };
    await afterHook({ tool: "goop_status", sessionID: "s1", callID }, output);

    expect(output.metadata.durationMs).toBeDefined();
    expect(typeof output.metadata.durationMs).toBe("number");
    expect(output.metadata.durationMs as number).toBeGreaterThanOrEqual(0);
  });

  it("triggers memory distill for significant tool executions", async () => {
    const saveSpy = spyOn(ctx.memory, "save");
    const { beforeHook, afterHook } = getHandlers(ctx);
    const callID = "c-distill-1";

    await beforeHook(
      { tool: "goop_state", sessionID: "s1", callID },
      { args: { action: "transition", phase: "execute" } },
    );
    await afterHook(
      { tool: "goop_state", sessionID: "s1", callID },
      { title: "state", output: "transitioned", metadata: {} as Record<string, unknown> },
    );

    await delay(20);

    expect(saveSpy).toHaveBeenCalledTimes(1);
    const saveArg = saveSpy.mock.calls[0][0];
    expect(saveArg.type).toBe("observation");
    expect(saveArg.content).toContain("transition");
    expect(saveArg.content).toContain("execute");
    expect(saveArg.concepts).toContain("auto-distill");
    expect(saveArg.concepts).toContain("goop_state");
  });

  it("does NOT trigger memory distill for non-significant tools", async () => {
    const saveSpy = spyOn(ctx.memory, "save");
    const { beforeHook, afterHook } = getHandlers(ctx);
    const callID = "c-no-distill-1";

    await beforeHook({ tool: "goop_status", sessionID: "s1", callID }, { args: {} });
    await afterHook(
      { tool: "goop_status", sessionID: "s1", callID },
      { title: "status", output: "ok", metadata: {} as Record<string, unknown> },
    );

    await delay(20);
    expect(saveSpy).not.toHaveBeenCalled();
  });

  it("does NOT trigger memory distill for goop_state get (read)", async () => {
    const saveSpy = spyOn(ctx.memory, "save");
    const { beforeHook, afterHook } = getHandlers(ctx);
    const callID = "c-no-distill-read";

    await beforeHook({ tool: "goop_state", sessionID: "s1", callID }, { args: { action: "get" } });
    await afterHook(
      { tool: "goop_state", sessionID: "s1", callID },
      { title: "state", output: "state data", metadata: {} as Record<string, unknown> },
    );

    await delay(20);
    expect(saveSpy).not.toHaveBeenCalled();
  });

  it("distill is non-blocking — after handler returns before memory.save resolves", async () => {
    let saveResolved = false;

    ctx.memory.save = async (input) => {
      await delay(100);
      saveResolved = true;
      return {
        id: 1,
        type: input.type,
        title: input.title,
        content: input.content,
        importance: input.importance ?? 5,
        createdAt: Date.now(),
      };
    };

    const { beforeHook, afterHook } = getHandlers(ctx);
    const callID = "c-nonblocking";

    await beforeHook(
      { tool: "goop_state", sessionID: "s1", callID },
      { args: { action: "lock-spec" } },
    );

    const start = Date.now();
    await afterHook(
      { tool: "goop_state", sessionID: "s1", callID },
      { title: "state", output: "locked", metadata: {} as Record<string, unknown> },
    );
    const elapsed = Date.now() - start;

    // Handler returns quickly because distill is fire-and-forget
    expect(elapsed).toBeLessThan(50);
    expect(saveResolved).toBe(false);

    // Wait for background save to complete
    await delay(150);
    expect(saveResolved).toBe(true);
  });

  it("gracefully handles memory.save rejection without unhandled rejection", async () => {
    const consoleSpy = spyOn(console, "error").mockImplementation(() => {});

    ctx.memory.save = async () => {
      throw new Error("memory write failed");
    };

    const { beforeHook, afterHook } = getHandlers(ctx);
    const callID = "c-error-handling";

    await beforeHook(
      { tool: "goop_state", sessionID: "s1", callID },
      { args: { action: "transition", phase: "plan" } },
    );
    await afterHook(
      { tool: "goop_state", sessionID: "s1", callID },
      { title: "state", output: "transitioned", metadata: {} as Record<string, unknown> },
    );

    await delay(20);

    expect(consoleSpy).toHaveBeenCalled();
    const errorMsg = consoleSpy.mock.calls[0][0] as string;
    expect(errorMsg).toContain("memory-distill");
    consoleSpy.mockRestore();
  });

  it("distills goop_adl append with description", async () => {
    const saveSpy = spyOn(ctx.memory, "save");
    const { beforeHook, afterHook } = getHandlers(ctx);
    const callID = "c-adl-1";

    await beforeHook(
      { tool: "goop_adl", sessionID: "s1", callID },
      { args: { action: "append", description: "Changed API structure" } },
    );
    await afterHook(
      { tool: "goop_adl", sessionID: "s1", callID },
      { title: "adl", output: "appended", metadata: {} as Record<string, unknown> },
    );

    await delay(20);

    expect(saveSpy).toHaveBeenCalledTimes(1);
    const saveArg = saveSpy.mock.calls[0][0];
    expect(saveArg.content).toContain("ADL");
    expect(saveArg.content).toContain("Changed API structure");
  });

  it("distills goop_checkpoint save with id", async () => {
    const saveSpy = spyOn(ctx.memory, "save");
    const { beforeHook, afterHook } = getHandlers(ctx);
    const callID = "c-checkpoint-1";

    await beforeHook(
      { tool: "goop_checkpoint", sessionID: "s1", callID },
      { args: { action: "save", id: "wave-3-complete" } },
    );
    await afterHook(
      { tool: "goop_checkpoint", sessionID: "s1", callID },
      { title: "checkpoint", output: "saved", metadata: {} as Record<string, unknown> },
    );

    await delay(20);

    expect(saveSpy).toHaveBeenCalledTimes(1);
    const saveArg = saveSpy.mock.calls[0][0];
    expect(saveArg.content).toContain("Checkpoint saved");
    expect(saveArg.content).toContain("wave-3-complete");
  });
});

// ---------------------------------------------------------------------------
// toolLifecycleHookFactory
// ---------------------------------------------------------------------------

describe("toolLifecycleHookFactory", () => {
  it("returns a Partial<Hooks> with both before and after handlers", () => {
    const { testDir, cleanup } = setupTestEnvironment("tool-lifecycle-factory");
    try {
      const ctx = createMockPluginContext({ testDir });
      const hooks = toolLifecycleHookFactory(ctx);

      expect(hooks["tool.execute.before"]).toBeDefined();
      expect(typeof hooks["tool.execute.before"]).toBe("function");
      expect(hooks["tool.execute.after"]).toBeDefined();
      expect(typeof hooks["tool.execute.after"]).toBe("function");
    } finally {
      cleanup();
    }
  });
});
