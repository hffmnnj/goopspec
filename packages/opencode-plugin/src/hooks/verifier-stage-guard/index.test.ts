import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import type { GoopState, WorkflowPhase } from "../../core/types.js";
import {
  type PluginContext,
  createDefaultWorkflowState,
  createMockPluginContext,
  setupTestEnvironment,
} from "../../test-utils.js";
import { DEFAULT_HOOK_FACTORIES, createHooks } from "../index.js";
import type { HookFactory } from "../types.js";
import { IntentionalToolDenialError } from "../utils.js";
import { createVerifierStageGuardHook, verifierStageGuardHookFactory } from "./index.js";

const ALL_PHASES: readonly WorkflowPhase[] = ["idle", "discuss", "plan", "execute", "accept"];

function taskArgs(subagentType: string): { args: Record<string, unknown> } {
  return { args: { description: "d", prompt: "p", subagent_type: subagentType } };
}

/** Builds a `Partial<GoopState>` override that puts the default workflow at `phase`. */
function stateAtPhase(phase: WorkflowPhase): Partial<GoopState> {
  return { workflows: { default: createDefaultWorkflowState({ phase }) } };
}

describe("createVerifierStageGuardHook", () => {
  let cleanup: () => void;

  afterEach(() => {
    cleanup?.();
  });

  function ctxAtPhase(phase: WorkflowPhase): PluginContext {
    const env = setupTestEnvironment(`verifier-guard-${phase}`);
    cleanup = env.cleanup;
    return createMockPluginContext({ testDir: env.testDir, state: stateAtPhase(phase) });
  }

  it("returns a Partial<Hooks> with only tool.execute.before defined", () => {
    const ctx = ctxAtPhase("execute");
    const hooks = createVerifierStageGuardHook(ctx);
    expect(hooks["tool.execute.before"]).toBeDefined();
    expect(typeof hooks["tool.execute.before"]).toBe("function");
    expect(hooks["tool.execute.after"]).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // goop-verifier: accept-only
  // ---------------------------------------------------------------------------

  describe("goop-verifier dispatch matrix", () => {
    for (const phase of ALL_PHASES) {
      const shouldDeny = phase !== "accept";

      it(`${shouldDeny ? "denies" : "permits"} goop-verifier in ${phase}`, async () => {
        const ctx = ctxAtPhase(phase);
        const hooks = createVerifierStageGuardHook(ctx);
        const guardHandler = hooks["tool.execute.before"];
        if (!guardHandler) throw new Error("tool.execute.before handler not defined");

        const call = guardHandler(
          { tool: "task", sessionID: "s1", callID: "c1" },
          taskArgs("goop-verifier"),
        );

        if (shouldDeny) {
          await expect(call).rejects.toThrow(IntentionalToolDenialError);
        } else {
          await expect(call).resolves.toBeUndefined();
        }
      });
    }
  });

  // ---------------------------------------------------------------------------
  // goop-wave-verifier: execute-only
  // ---------------------------------------------------------------------------

  describe("goop-wave-verifier dispatch matrix", () => {
    for (const phase of ALL_PHASES) {
      const shouldDeny = phase !== "execute";

      it(`${shouldDeny ? "denies" : "permits"} goop-wave-verifier in ${phase}`, async () => {
        const ctx = ctxAtPhase(phase);
        const hooks = createVerifierStageGuardHook(ctx);
        const guardHandler = hooks["tool.execute.before"];
        if (!guardHandler) throw new Error("tool.execute.before handler not defined");

        const call = guardHandler(
          { tool: "task", sessionID: "s1", callID: "c1" },
          taskArgs("goop-wave-verifier"),
        );

        if (shouldDeny) {
          await expect(call).rejects.toThrow(IntentionalToolDenialError);
        } else {
          await expect(call).resolves.toBeUndefined();
        }
      });
    }
  });

  // ---------------------------------------------------------------------------
  // Role-form normalization
  // ---------------------------------------------------------------------------

  it("denies the unprefixed form 'verifier' identically to 'goop-verifier'", async () => {
    const ctx = ctxAtPhase("plan");
    const hooks = createVerifierStageGuardHook(ctx);
    const guardHandler = hooks["tool.execute.before"];
    if (!guardHandler) throw new Error("tool.execute.before handler not defined");

    await expect(
      guardHandler({ tool: "task", sessionID: "s1", callID: "c1" }, taskArgs("verifier")),
    ).rejects.toThrow(IntentionalToolDenialError);
  });

  it("denies the unprefixed form 'wave-verifier' identically to 'goop-wave-verifier'", async () => {
    const ctx = ctxAtPhase("accept");
    const hooks = createVerifierStageGuardHook(ctx);
    const guardHandler = hooks["tool.execute.before"];
    if (!guardHandler) throw new Error("tool.execute.before handler not defined");

    await expect(
      guardHandler({ tool: "task", sessionID: "s1", callID: "c1" }, taskArgs("wave-verifier")),
    ).rejects.toThrow(IntentionalToolDenialError);
  });

  it("permits the unprefixed form 'verifier' in accept", async () => {
    const ctx = ctxAtPhase("accept");
    const hooks = createVerifierStageGuardHook(ctx);
    const guardHandler = hooks["tool.execute.before"];
    if (!guardHandler) throw new Error("tool.execute.before handler not defined");

    await expect(
      guardHandler({ tool: "task", sessionID: "s1", callID: "c1" }, taskArgs("verifier")),
    ).resolves.toBeUndefined();
  });

  it("permits the unprefixed form 'wave-verifier' in execute", async () => {
    const ctx = ctxAtPhase("execute");
    const hooks = createVerifierStageGuardHook(ctx);
    const guardHandler = hooks["tool.execute.before"];
    if (!guardHandler) throw new Error("tool.execute.before handler not defined");

    await expect(
      guardHandler({ tool: "task", sessionID: "s1", callID: "c1" }, taskArgs("wave-verifier")),
    ).resolves.toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // Actionable denial text
  // ---------------------------------------------------------------------------

  it("names goop-wave-verifier and the phase when denying goop-verifier", async () => {
    const ctx = ctxAtPhase("execute");
    const hooks = createVerifierStageGuardHook(ctx);
    const guardHandler = hooks["tool.execute.before"];
    if (!guardHandler) throw new Error("tool.execute.before handler not defined");

    let caught: unknown;
    try {
      await guardHandler(
        { tool: "task", sessionID: "s1", callID: "c1" },
        taskArgs("goop-verifier"),
      );
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(IntentionalToolDenialError);
    const message = (caught as Error).message;
    expect(message).toContain("goop-verifier");
    expect(message).toContain("acceptance-only");
    expect(message).toContain("goop-wave-verifier");
    expect(message).toContain("execute");
  });

  it("names goop-verifier and the phase when denying goop-wave-verifier", async () => {
    const ctx = ctxAtPhase("accept");
    const hooks = createVerifierStageGuardHook(ctx);
    const guardHandler = hooks["tool.execute.before"];
    if (!guardHandler) throw new Error("tool.execute.before handler not defined");

    let caught: unknown;
    try {
      await guardHandler(
        { tool: "task", sessionID: "s1", callID: "c1" },
        taskArgs("goop-wave-verifier"),
      );
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(IntentionalToolDenialError);
    const message = (caught as Error).message;
    expect(message).toContain("goop-wave-verifier");
    expect(message).toContain("execute-only");
    expect(message).toContain("goop-verifier");
    expect(message).toContain("accept");
  });

  // ---------------------------------------------------------------------------
  // Fail-open paths
  // ---------------------------------------------------------------------------

  it("permits non-verifier roles in every phase", async () => {
    for (const phase of ALL_PHASES) {
      const env = setupTestEnvironment(`verifier-guard-nonverifier-${phase}`);
      try {
        const ctx = createMockPluginContext({ testDir: env.testDir, state: stateAtPhase(phase) });
        const hooks = createVerifierStageGuardHook(ctx);
        const guardHandler = hooks["tool.execute.before"];
        if (!guardHandler) throw new Error("tool.execute.before handler not defined");

        await expect(
          guardHandler(
            { tool: "task", sessionID: "s1", callID: "c1" },
            taskArgs("goop-executor-high"),
          ),
        ).resolves.toBeUndefined();
      } finally {
        env.cleanup();
      }
    }
    // This test manages its own per-iteration environments; make the shared
    // `cleanup` a no-op so afterEach does not re-invoke an already-closed env.
    cleanup = () => {};
  });

  it("permits an undetermined role (missing subagent_type)", async () => {
    const ctx = ctxAtPhase("plan");
    const hooks = createVerifierStageGuardHook(ctx);
    const guardHandler = hooks["tool.execute.before"];
    if (!guardHandler) throw new Error("tool.execute.before handler not defined");

    await expect(
      guardHandler({ tool: "task", sessionID: "s1", callID: "c1" }, { args: { description: "d" } }),
    ).resolves.toBeUndefined();
  });

  it("permits a non-string subagent_type value", async () => {
    const ctx = ctxAtPhase("plan");
    const hooks = createVerifierStageGuardHook(ctx);
    const guardHandler = hooks["tool.execute.before"];
    if (!guardHandler) throw new Error("tool.execute.before handler not defined");

    await expect(
      guardHandler(
        { tool: "task", sessionID: "s1", callID: "c1" },
        { args: { subagent_type: 42 } },
      ),
    ).resolves.toBeUndefined();
  });

  it("permits a task call with non-object args", async () => {
    const ctx = ctxAtPhase("plan");
    const hooks = createVerifierStageGuardHook(ctx);
    const guardHandler = hooks["tool.execute.before"];
    if (!guardHandler) throw new Error("tool.execute.before handler not defined");

    await expect(
      guardHandler({ tool: "task", sessionID: "s1", callID: "c1" }, { args: null }),
    ).resolves.toBeUndefined();
  });

  it("ignores unrelated tools entirely, including write/edit and mcp_ prefixed names", async () => {
    const ctx = ctxAtPhase("plan");
    const hooks = createVerifierStageGuardHook(ctx);
    const guardHandler = hooks["tool.execute.before"];
    if (!guardHandler) throw new Error("tool.execute.before handler not defined");

    await expect(
      guardHandler({ tool: "write", sessionID: "s1", callID: "c1" }, taskArgs("goop-verifier")),
    ).resolves.toBeUndefined();
    await expect(
      guardHandler({ tool: "mcp_Task", sessionID: "s1", callID: "c2" }, taskArgs("goop-verifier")),
    ).resolves.toBeUndefined();
  });

  it("matches the task tool name case-insensitively", async () => {
    const ctx = ctxAtPhase("plan");
    const hooks = createVerifierStageGuardHook(ctx);
    const guardHandler = hooks["tool.execute.before"];
    if (!guardHandler) throw new Error("tool.execute.before handler not defined");

    await expect(
      guardHandler({ tool: "TASK", sessionID: "s1", callID: "c1" }, taskArgs("goop-verifier")),
    ).rejects.toThrow(IntentionalToolDenialError);
  });

  it("fails open when the active workflow cannot be resolved", async () => {
    const env = setupTestEnvironment("verifier-guard-broken-state");
    cleanup = env.cleanup;
    const consoleSpy = spyOn(console, "error").mockImplementation(() => {});
    const ctx = createMockPluginContext({ testDir: env.testDir });
    // Force getActiveWorkflow to throw, simulating an undeterminable phase.
    Object.defineProperty(ctx.stateManager, "getActiveWorkflow", {
      value: () => {
        throw new Error("no active workflow");
      },
    });
    const hooks = createVerifierStageGuardHook(ctx);
    const guardHandler = hooks["tool.execute.before"];
    if (!guardHandler) throw new Error("tool.execute.before handler not defined");

    await expect(
      guardHandler({ tool: "task", sessionID: "s1", callID: "c1" }, taskArgs("goop-verifier")),
    ).resolves.toBeUndefined();
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    consoleSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Merged-pipeline integration: the guard dispatched through the real
// createHooks() chain, not the isolated single-hook handler above.
//
// The single-hook matrix proves the predicate decides correctly; these tests
// prove the decision survives the full merge: the guard is wired into
// DEFAULT_HOOK_FACTORIES, its IntentionalToolDenialError propagates through
// chainHandlers + safeHandler on denial, and a sibling hook's ordinary error
// is still swallowed (graceful degradation) while the deliberate denial is not.
// ---------------------------------------------------------------------------

describe("merged pipeline integration: verifier stage guard through createHooks()", () => {
  let cleanup: () => void;

  afterEach(() => {
    cleanup?.();
  });

  function ctxAtPhase(phase: WorkflowPhase): PluginContext {
    const env = setupTestEnvironment(`verifier-guard-merged-${phase}`);
    cleanup = env.cleanup;
    return createMockPluginContext({ testDir: env.testDir, state: stateAtPhase(phase) });
  }

  describe("goop-verifier timing (accept-only) through the merged pipeline", () => {
    for (const phase of ALL_PHASES) {
      const shouldDeny = phase !== "accept";

      it(`${shouldDeny ? "denies" : "permits"} goop-verifier in ${phase} via createHooks`, async () => {
        const ctx = ctxAtPhase(phase);
        const hooks = createHooks(ctx, [...DEFAULT_HOOK_FACTORIES]);
        const before = hooks["tool.execute.before"];
        if (!before) throw new Error("merged tool.execute.before not defined");

        const call = before(
          { tool: "task", sessionID: "s1", callID: "c1" },
          taskArgs("goop-verifier"),
        );

        if (shouldDeny) {
          await expect(call).rejects.toThrow(IntentionalToolDenialError);
        } else {
          await expect(call).resolves.toBeUndefined();
        }
      });
    }
  });

  describe("goop-wave-verifier timing (execute-only) through the merged pipeline", () => {
    for (const phase of ALL_PHASES) {
      const shouldDeny = phase !== "execute";

      it(`${shouldDeny ? "denies" : "permits"} goop-wave-verifier in ${phase} via createHooks`, async () => {
        const ctx = ctxAtPhase(phase);
        const hooks = createHooks(ctx, [...DEFAULT_HOOK_FACTORIES]);
        const before = hooks["tool.execute.before"];
        if (!before) throw new Error("merged tool.execute.before not defined");

        const call = before(
          { tool: "task", sessionID: "s1", callID: "c1" },
          taskArgs("goop-wave-verifier"),
        );

        if (shouldDeny) {
          await expect(call).rejects.toThrow(IntentionalToolDenialError);
        } else {
          await expect(call).resolves.toBeUndefined();
        }
      });
    }
  });

  it("swallows a sibling hook's ordinary error but propagates the guard's denial", async () => {
    // The one sentinel exception to "a hook error must never crash OpenCode":
    // safeHandler rethrows IntentionalToolDenialError and swallows everything
    // else. A sibling throwing a plain Error must not abort the chain, while
    // the guard's deliberate denial must still reach the caller.
    const siblingErrorFactory: HookFactory = () => ({
      "tool.execute.before": async () => {
        throw new Error("sibling hook exploded");
      },
    });

    const consoleSpy = spyOn(console, "error").mockImplementation(() => {});

    // Permitted dispatch (goop-wave-verifier in execute) + a sibling that
    // throws a plain Error: the merged pipeline resolves — the sibling's
    // error is swallowed by safeHandler and the guard permits the call.
    const permitCtx = ctxAtPhase("execute");
    const permitHooks = createHooks(permitCtx, [...DEFAULT_HOOK_FACTORIES, siblingErrorFactory]);
    const permitBefore = permitHooks["tool.execute.before"];
    if (!permitBefore) throw new Error("merged tool.execute.before not defined");
    await expect(
      permitBefore({ tool: "task", sessionID: "s1", callID: "c1" }, taskArgs("goop-wave-verifier")),
    ).resolves.toBeUndefined();

    // Forbidden dispatch (goop-verifier in plan): the guard's
    // IntentionalToolDenialError propagates through the merged chain and the
    // sibling never runs (the chain aborts on the sentinel).
    const denyCtx = ctxAtPhase("plan");
    const denyHooks = createHooks(denyCtx, [...DEFAULT_HOOK_FACTORIES, siblingErrorFactory]);
    const denyBefore = denyHooks["tool.execute.before"];
    if (!denyBefore) throw new Error("merged tool.execute.before not defined");
    await expect(
      denyBefore({ tool: "task", sessionID: "s1", callID: "c1" }, taskArgs("goop-verifier")),
    ).rejects.toThrow(IntentionalToolDenialError);

    consoleSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// HookFactory wrapper + registration
// ---------------------------------------------------------------------------

describe("verifierStageGuardHookFactory", () => {
  let cleanup: () => void;

  beforeEach(() => {
    const env = setupTestEnvironment("verifier-guard-factory");
    cleanup = env.cleanup;
  });

  afterEach(() => cleanup());

  it("is the same shape as createVerifierStageGuardHook", () => {
    expect(verifierStageGuardHookFactory).toBe(createVerifierStageGuardHook);
  });

  it("is registered exactly once in DEFAULT_HOOK_FACTORIES", () => {
    const occurrences = DEFAULT_HOOK_FACTORIES.filter(
      (factory) => factory === verifierStageGuardHookFactory,
    );
    expect(occurrences).toHaveLength(1);
  });
});
