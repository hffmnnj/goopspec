import { describe, expect, it, spyOn } from "bun:test";
import { createMockPluginContext, setupTestEnvironment } from "../test-utils.js";
import { createHooks, mergeHooks, registerHookFactory } from "./index.js";
import type { HookFactory, Hooks } from "./types.js";

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
