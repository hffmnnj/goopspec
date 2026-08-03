import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import type { GoopState, WorkflowPhase } from "../../core/types.js";
import {
  type PluginContext,
  createDefaultWorkflowState,
  createMockPluginContext,
  setupTestEnvironment,
} from "../../test-utils.js";
import { DEFAULT_HOOK_FACTORIES } from "../index.js";
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
