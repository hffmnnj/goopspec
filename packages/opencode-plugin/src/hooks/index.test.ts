import { describe, expect, it, spyOn } from "bun:test";
import type { GoopState, WorkflowPhase } from "../core/types.js";
import {
  createDefaultWorkflowState,
  createMockPluginContext,
  setupTestEnvironment,
} from "../test-utils.js";
import { DEFAULT_HOOK_FACTORIES, createHooks, mergeHooks, registerHookFactory } from "./index.js";
import type { HookFactory, Hooks } from "./types.js";
import { IntentionalToolDenialError } from "./utils.js";

/** Builds a `Partial<GoopState>` override that puts the default workflow at `phase`. */
function stateAtPhase(phase: WorkflowPhase): Partial<GoopState> {
  return { workflows: { default: createDefaultWorkflowState({ phase }) } };
}

// ---------------------------------------------------------------------------
// mergeHooks
// ---------------------------------------------------------------------------

describe("mergeHooks", () => {
  it("returns empty Hooks when given no partials", () => {
    const result = mergeHooks([]);
    expect(result).toEqual({});
  });

  it("passes through a single partial unchanged", async () => {
    let called = false;
    const handler = async () => {
      called = true;
    };

    const result = mergeHooks([{ event: handler }]);
    expect(result.event).toBeDefined();

    await result.event?.({ event: { type: "test" } as never });
    expect(called).toBe(true);
  });

  it("chains multiple handlers for the same event", async () => {
    const order: number[] = [];

    const p1: Partial<Hooks> = {
      event: async () => {
        order.push(1);
      },
    };
    const p2: Partial<Hooks> = {
      event: async () => {
        order.push(2);
      },
    };
    const p3: Partial<Hooks> = {
      event: async () => {
        order.push(3);
      },
    };

    const result = mergeHooks([p1, p2, p3]);
    await result.event?.({ event: { type: "test" } as never });

    expect(order).toEqual([1, 2, 3]);
  });

  it("merges different events from different partials", async () => {
    const eventCalled: string[] = [];

    const p1: Partial<Hooks> = {
      event: async () => {
        eventCalled.push("event");
      },
    };
    const p2: Partial<Hooks> = {
      "permission.ask": async (_input, output) => {
        eventCalled.push("permission");
        output.status = "deny";
      },
    };

    const result = mergeHooks([p1, p2]);

    await result.event?.({ event: { type: "test" } as never });
    const permOutput: { status: "ask" | "deny" | "allow" } = { status: "ask" };
    await result["permission.ask"]?.({} as never, permOutput);

    expect(eventCalled).toEqual(["event", "permission"]);
    expect(permOutput.status).toBe("deny");
  });

  it("shallow-merges tool registrations", () => {
    const p1: Partial<Hooks> = {
      tool: { tool_a: { description: "A" } as never },
    };
    const p2: Partial<Hooks> = {
      tool: { tool_b: { description: "B" } as never },
    };

    const result = mergeHooks([p1, p2]);
    expect(result.tool).toBeDefined();
    expect(Object.keys(result.tool ?? {})).toEqual(["tool_a", "tool_b"]);
  });

  it("later tool registrations override earlier ones for same key", () => {
    const p1: Partial<Hooks> = {
      tool: { my_tool: { description: "v1" } as never },
    };
    const p2: Partial<Hooks> = {
      tool: { my_tool: { description: "v2" } as never },
    };

    const result = mergeHooks([p1, p2]);
    expect((result.tool?.my_tool as { description: string }).description).toBe("v2");
  });

  it("uses last-defined auth hook", () => {
    const auth1 = { provider: "p1", methods: [] } as unknown as Hooks["auth"];
    const auth2 = { provider: "p2", methods: [] } as unknown as Hooks["auth"];

    const result = mergeHooks([{ auth: auth1 }, { auth: auth2 }]);
    expect(result.auth).toBe(auth2);
  });

  it("gracefully handles a throwing handler in a chain", async () => {
    const consoleSpy = spyOn(console, "error").mockImplementation(() => {});
    const order: number[] = [];

    const p1: Partial<Hooks> = {
      event: async () => {
        order.push(1);
        throw new Error("p1 fails");
      },
    };
    const p2: Partial<Hooks> = {
      event: async () => {
        order.push(2);
      },
    };

    const result = mergeHooks([p1, p2]);
    await result.event?.({ event: { type: "test" } as never });

    expect(order).toEqual([1, 2]);
    consoleSpy.mockRestore();
  });

  it("propagates an IntentionalToolDenialError through merged tool.execute.before handlers and stops later ones", async () => {
    const order: string[] = [];

    const p1: Partial<Hooks> = {
      "tool.execute.before": async () => {
        order.push("p1-lifecycle");
      },
    };
    const p2: Partial<Hooks> = {
      "tool.execute.before": async () => {
        order.push("p2-guard");
        throw new IntentionalToolDenialError("goop-verifier is acceptance-only");
      },
    };
    const p3: Partial<Hooks> = {
      "tool.execute.before": async () => {
        order.push("p3-never-runs");
      },
    };

    const result = mergeHooks([p1, p2, p3]);

    await expect(
      result["tool.execute.before"]?.(
        { tool: "task", sessionID: "s1", callID: "c1" },
        { args: { subagent_type: "goop-verifier" } },
      ),
    ).rejects.toThrow("goop-verifier is acceptance-only");
    expect(order).toEqual(["p1-lifecycle", "p2-guard"]);
  });

  it("still swallows an ordinary error thrown from a tool.execute.before handler in a merged chain", async () => {
    const consoleSpy = spyOn(console, "error").mockImplementation(() => {});
    const order: string[] = [];

    const p1: Partial<Hooks> = {
      "tool.execute.before": async () => {
        order.push("p1");
        throw new Error("unexpected bug");
      },
    };
    const p2: Partial<Hooks> = {
      "tool.execute.before": async () => {
        order.push("p2");
      },
    };

    const result = mergeHooks([p1, p2]);
    await result["tool.execute.before"]?.(
      { tool: "read", sessionID: "s1", callID: "c1" },
      { args: {} },
    );

    expect(order).toEqual(["p1", "p2"]);
    consoleSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// createHooks
// ---------------------------------------------------------------------------

describe("createHooks", () => {
  it("produces a valid Hooks object from extra factories", () => {
    const { testDir, cleanup } = setupTestEnvironment("hooks-create");
    try {
      const ctx = createMockPluginContext({ testDir });

      const factory: HookFactory = () => ({
        event: async () => {
          // no-op
        },
      });

      const hooks = createHooks(ctx, [factory]);
      expect(hooks.event).toBeDefined();
      expect(typeof hooks.event).toBe("function");
    } finally {
      cleanup();
    }
  });

  it("merges multiple extra factories", async () => {
    const { testDir, cleanup } = setupTestEnvironment("hooks-merge");
    try {
      const ctx = createMockPluginContext({ testDir });
      const order: number[] = [];

      const f1: HookFactory = () => ({
        event: async () => {
          order.push(1);
        },
      });
      const f2: HookFactory = () => ({
        event: async () => {
          order.push(2);
        },
      });

      const hooks = createHooks(ctx, [f1, f2]);
      await hooks.event?.({ event: { type: "test" } as never });

      expect(order).toEqual([1, 2]);
    } finally {
      cleanup();
    }
  });

  it("passes PluginContext to each factory", () => {
    const { testDir, cleanup } = setupTestEnvironment("hooks-ctx");
    try {
      const ctx = createMockPluginContext({ testDir });
      let receivedCtx: unknown;

      const factory: HookFactory = (c) => {
        receivedCtx = c;
        return {};
      };

      createHooks(ctx, [factory]);
      expect(receivedCtx).toBe(ctx);
    } finally {
      cleanup();
    }
  });

  it("returns empty Hooks when no factories are registered", () => {
    const { testDir, cleanup } = setupTestEnvironment("hooks-empty");
    try {
      const ctx = createMockPluginContext({ testDir });
      const hooks = createHooks(ctx, []);
      expect(hooks).toEqual({});
    } finally {
      cleanup();
    }
  });

  it("chains tool.execute.after from multiple factories", async () => {
    const { testDir, cleanup } = setupTestEnvironment("hooks-tool-after");
    try {
      const ctx = createMockPluginContext({ testDir });
      const calls: string[] = [];

      const f1: HookFactory = () => ({
        "tool.execute.after": async (_input, output) => {
          calls.push("auto-progression");
          output.output += " [auto-progressed]";
        },
      });
      const f2: HookFactory = () => ({
        "tool.execute.after": async (_input, output) => {
          calls.push("memory-distill");
          output.output += " [distilled]";
        },
      });

      const hooks = createHooks(ctx, [f1, f2]);
      const output = { title: "test", output: "original", metadata: {} };
      await hooks["tool.execute.after"]?.(
        { tool: "goop_state", sessionID: "s1", callID: "c1", args: {} },
        output,
      );

      expect(calls).toEqual(["auto-progression", "memory-distill"]);
      expect(output.output).toBe("original [auto-progressed] [distilled]");
    } finally {
      cleanup();
    }
  });
});

// ---------------------------------------------------------------------------
// registerHookFactory
// ---------------------------------------------------------------------------

describe("registerHookFactory", () => {
  it("registered factories are included in createHooks output", async () => {
    const { testDir, cleanup } = setupTestEnvironment("hooks-register");
    try {
      const ctx = createMockPluginContext({ testDir });
      let registered = false;

      registerHookFactory(() => ({
        event: async () => {
          registered = true;
        },
      }));

      const hooks = createHooks(ctx);
      await hooks.event?.({ event: { type: "test" } as never });

      expect(registered).toBe(true);
    } finally {
      cleanup();
    }
  });
});

// ---------------------------------------------------------------------------
// AD7 boundary — experimental.compaction.autocontinue deferral
// ---------------------------------------------------------------------------

describe("DEFAULT_HOOK_FACTORIES — AD7 boundary", () => {
  it("no factory registers experimental.compaction.autocontinue (SPEC AD7)", () => {
    const { testDir, cleanup } = setupTestEnvironment("ad7-autocontinue");
    try {
      const ctx = createMockPluginContext({ testDir });

      for (const factory of DEFAULT_HOOK_FACTORIES) {
        const partial = factory(ctx);
        // SPEC AD7: experimental.compaction.autocontinue is deliberately NOT
        // implemented. If this assertion fails, a factory was added that
        // registers the autocontinue hook — revisit AD7 before doing so.
        expect(partial["experimental.compaction.autocontinue"]).toBeUndefined();
      }
    } finally {
      cleanup();
    }
  });
});

// ---------------------------------------------------------------------------
// DEFAULT_HOOK_FACTORIES — verifier stage-dispatch guard reaches the host
// through the full production pipeline (createHooks -> mergeHooks -> chain),
// alongside the other two already-registered tool.execute.before hooks.
// ---------------------------------------------------------------------------

describe("DEFAULT_HOOK_FACTORIES — verifier stage-dispatch guard end to end", () => {
  it("blocks a goop-verifier task delegation outside accept via the real production wiring", async () => {
    const { testDir, cleanup } = setupTestEnvironment("verifier-guard-e2e-deny");
    try {
      const ctx = createMockPluginContext({ testDir, state: stateAtPhase("plan") });
      const hooks = createHooks(ctx, [...DEFAULT_HOOK_FACTORIES]);

      await expect(
        hooks["tool.execute.before"]?.(
          { tool: "task", sessionID: "s1", callID: "c1" },
          { args: { description: "verify", prompt: "check it", subagent_type: "goop-verifier" } },
        ),
      ).rejects.toThrow(IntentionalToolDenialError);
    } finally {
      cleanup();
    }
  });

  it("permits a goop-verifier task delegation during accept via the real production wiring", async () => {
    const { testDir, cleanup } = setupTestEnvironment("verifier-guard-e2e-allow");
    try {
      const ctx = createMockPluginContext({ testDir, state: stateAtPhase("accept") });
      const hooks = createHooks(ctx, [...DEFAULT_HOOK_FACTORIES]);

      await expect(
        hooks["tool.execute.before"]?.(
          { tool: "task", sessionID: "s1", callID: "c1" },
          { args: { description: "verify", prompt: "check it", subagent_type: "goop-verifier" } },
        ),
      ).resolves.toBeUndefined();
    } finally {
      cleanup();
    }
  });

  it("leaves an unrelated task delegation untouched by the guard", async () => {
    const { testDir, cleanup } = setupTestEnvironment("verifier-guard-e2e-unrelated");
    try {
      const ctx = createMockPluginContext({ testDir, state: stateAtPhase("plan") });
      const hooks = createHooks(ctx, [...DEFAULT_HOOK_FACTORIES]);

      await expect(
        hooks["tool.execute.before"]?.(
          { tool: "task", sessionID: "s1", callID: "c1" },
          {
            args: {
              description: "implement",
              prompt: "build it",
              subagent_type: "goop-executor-high",
            },
          },
        ),
      ).resolves.toBeUndefined();
    } finally {
      cleanup();
    }
  });
});

// ---------------------------------------------------------------------------
// DEFAULT_HOOK_FACTORIES — idle-triage reaches the host through the full
// production pipeline (createHooks -> mergeHooks -> chain). This test goes
// through the real assembly path the plugin entry point uses; it fails if
// idleTriageHookFactory is removed from DEFAULT_HOOK_FACTORIES, which is the
// acceptance bar for closing the "tested in isolation but never wired" gap.
// ---------------------------------------------------------------------------

describe("DEFAULT_HOOK_FACTORIES — idle-triage end to end", () => {
  // Minimal handler call shapes (handlers only read these fields; see
  // hooks/idle-triage/index.ts). Casts avoid fabricating SDK-internal types.
  type ChatCall = (
    input: { sessionID: string },
    output: { parts: { type: string; text: string }[] },
  ) => Promise<void>;
  type SystemCall = (input: { sessionID?: string }, output: { system: string[] }) => Promise<void>;

  async function runThroughProductionHooks(
    ctx: ReturnType<typeof createMockPluginContext>,
    sessionID: string,
    prompt: string,
  ): Promise<string[]> {
    const hooks = createHooks(ctx, [...DEFAULT_HOOK_FACTORIES]);
    const chat = hooks["chat.message"] as unknown as ChatCall | undefined;
    const system = hooks["experimental.chat.system.transform"] as unknown as SystemCall | undefined;
    if (!chat || !system) {
      throw new Error("production hooks did not register chat.message and system.transform");
    }
    await chat({ sessionID }, { parts: [{ type: "text", text: prompt }] });
    const output = { system: [] as string[] };
    await system({ sessionID }, output);
    return output.system;
  }

  it("injects a <goopspec_triage> block for a substantive idle prompt through createHooks([...DEFAULT_HOOK_FACTORIES])", async () => {
    const { testDir, cleanup } = setupTestEnvironment("idle-triage-e2e-registered");
    try {
      // Default mock state is phase "idle" — the positive case.
      const ctx = createMockPluginContext({ testDir });
      const system = await runThroughProductionHooks(
        ctx,
        "sess-prod",
        "implement a new authentication form with validation and error handling",
      );

      const block = system.find((s) => s.startsWith("<goopspec_triage>"));
      expect(block, "expected <goopspec_triage> block from the production hook path").toBeDefined();
      // Field presence — the registered hook chain ran the live classifiers.
      expect(block).toContain("intent:");
      expect(block).toContain("recommended_effort:");
      expect(block).toContain("confidence:");
      expect(block).toContain("reasoning:");
    } finally {
      cleanup();
    }
  });

  it("does not inject when the workflow is not idle, through the same production path", async () => {
    const { testDir, cleanup } = setupTestEnvironment("idle-triage-e2e-not-idle");
    try {
      const ctx = createMockPluginContext({ testDir, state: stateAtPhase("execute") });
      const system = await runThroughProductionHooks(
        ctx,
        "sess-exec",
        "implement a new authentication form with validation and error handling",
      );
      expect(system.find((s) => s.startsWith("<goopspec_triage>"))).toBeUndefined();
    } finally {
      cleanup();
    }
  });
});
