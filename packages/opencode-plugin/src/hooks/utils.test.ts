import { afterEach, describe, expect, it, spyOn } from "bun:test";
import {
  chainHandlers,
  isGoopspecFile,
  isImplementationFile,
  isOrchestrator,
  safeHandler,
} from "./utils.js";

// ---------------------------------------------------------------------------
// safeHandler
// ---------------------------------------------------------------------------

describe("safeHandler", () => {
  const originalDebug = process.env.GOOPSPEC_DEBUG;

  afterEach(() => {
    process.env.GOOPSPEC_DEBUG = originalDebug;
  });

  it("calls the underlying handler with correct arguments", async () => {
    const calls: unknown[] = [];
    const handler = async (input: { event: unknown }) => {
      calls.push(input);
    };

    const safe = safeHandler("event", handler);
    const input = { event: { type: "session.created" } };
    await safe(input);

    expect(calls).toHaveLength(1);
    expect(calls[0]).toBe(input);
  });

  it.each([undefined, "true"])(
    "catches errors without rejecting when debug is %p",
    async (debug) => {
      process.env.GOOPSPEC_DEBUG = debug;
      const handler = async (_input: { event: unknown }) => {
        throw new Error("boom");
      };
      const consoleSpy = spyOn(console, "error").mockImplementation(() => {});
      const safe = safeHandler("event", handler);

      await expect(safe({ event: { type: "test" } })).resolves.toBeUndefined();

      expect(consoleSpy).toHaveBeenCalledTimes(1);
      expect(consoleSpy.mock.calls[0][0]).toContain('hook "event" error');
      consoleSpy.mockRestore();
    },
  );

  it("awaits a non-throwing handler and resolves", async () => {
    let completed = false;
    const handler = async (_input: { event: unknown }) => {
      await Promise.resolve();
      completed = true;
    };
    const safe = safeHandler("event", handler);
    const result = await safe({ event: { type: "test" } });

    expect(completed).toBe(true);
    expect(result).toBeUndefined();
  });

  it("skips timing and slow-hook logging outside debug mode", async () => {
    process.env.GOOPSPEC_DEBUG = undefined;
    const dateNowSpy = spyOn(Date, "now");
    const consoleSpy = spyOn(console, "log").mockImplementation(() => {});
    const safe = safeHandler("event", async (_input: { event: unknown }) => {
      await Bun.sleep(30);
    });

    await safe({ event: { type: "test" } });

    expect(dateNowSpy).not.toHaveBeenCalled();
    expect(consoleSpy).not.toHaveBeenCalled();
    dateNowSpy.mockRestore();
    consoleSpy.mockRestore();
  });

  it("logs slow hooks in debug mode", async () => {
    process.env.GOOPSPEC_DEBUG = "true";
    const consoleSpy = spyOn(console, "log").mockImplementation(() => {});
    const safe = safeHandler("event", async (_input: { event: unknown }) => {
      await Bun.sleep(30);
    });

    await safe({ event: { type: "test" } });

    expect(consoleSpy).toHaveBeenCalledWith(
      "[goopspec] event: slow hook detected",
      expect.objectContaining({ durationMs: expect.any(Number) }),
    );
    consoleSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// chainHandlers
// ---------------------------------------------------------------------------

describe("chainHandlers", () => {
  it("runs handlers in order", async () => {
    const order: number[] = [];

    const h1 = async (_input: { sessionID: string }, output: { context: string[] }) => {
      order.push(1);
      output.context.push("from-h1");
    };
    const h2 = async (_input: { sessionID: string }, output: { context: string[] }) => {
      order.push(2);
      output.context.push("from-h2");
    };

    const chained = chainHandlers("experimental.session.compacting", [h1, h2]);
    const output = { context: [] as string[] };
    await chained({ sessionID: "s1" }, output);

    expect(order).toEqual([1, 2]);
    expect(output.context).toEqual(["from-h1", "from-h2"]);
  });

  it("continues chain when a handler throws", async () => {
    const consoleSpy = spyOn(console, "error").mockImplementation(() => {});
    const order: number[] = [];

    const h1 = async (_input: { event: unknown }) => {
      order.push(1);
      throw new Error("h1 fails");
    };
    const h2 = async (_input: { event: unknown }) => {
      order.push(2);
    };

    const chained = chainHandlers("event", [h1, h2]);
    await chained({ event: { type: "test" } });

    expect(order).toEqual([1, 2]);
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    consoleSpy.mockRestore();
  });

  it("returns a single handler directly when array has one element", async () => {
    let called = false;
    const h1 = async (_input: { event: unknown }) => {
      called = true;
    };

    const chained = chainHandlers("event", [h1]);
    await chained({ event: { type: "test" } });
    expect(called).toBe(true);
  });

  it("mutations from earlier handlers are visible to later ones", async () => {
    const h1 = async (_input: unknown, output: { system: string[] }) => {
      output.system.push("injected-by-h1");
    };
    const h2 = async (_input: unknown, output: { system: string[] }) => {
      if (output.system.includes("injected-by-h1")) {
        output.system.push("h2-saw-h1");
      }
    };

    const chained = chainHandlers("experimental.chat.system.transform", [h1, h2]);
    const output = { system: [] as string[] };
    await chained({ model: {} }, output);

    expect(output.system).toEqual(["injected-by-h1", "h2-saw-h1"]);
  });
});

// ---------------------------------------------------------------------------
// isOrchestrator
// ---------------------------------------------------------------------------

describe("isOrchestrator", () => {
  it("returns true for orchestrator agent names", () => {
    expect(isOrchestrator("orchestrator")).toBe(true);
    expect(isOrchestrator("goop-orchestrator")).toBe(true);
    expect(isOrchestrator("goopspec-orchestrator")).toBe(true);
    expect(isOrchestrator("ORCHESTRATOR")).toBe(true);
    expect(isOrchestrator("Goop-Orchestrator")).toBe(true);
  });

  it("returns false for executor and other agents", () => {
    expect(isOrchestrator("goop-executor-high")).toBe(false);
    expect(isOrchestrator("goop-executor-medium")).toBe(false);
    expect(isOrchestrator("goop-researcher")).toBe(false);
    expect(isOrchestrator("goop-planner")).toBe(false);
    expect(isOrchestrator("user")).toBe(false);
  });

  it("returns false for undefined/empty", () => {
    expect(isOrchestrator(undefined)).toBe(false);
    expect(isOrchestrator("")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isImplementationFile
// ---------------------------------------------------------------------------

describe("isImplementationFile", () => {
  it("returns true for source files in known directories", () => {
    expect(isImplementationFile("src/hooks/index.ts")).toBe(true);
    expect(isImplementationFile("lib/utils.js")).toBe(true);
    expect(isImplementationFile("app/page.tsx")).toBe(true);
    expect(isImplementationFile("components/Button.vue")).toBe(true);
    expect(isImplementationFile("packages/core/src/index.ts")).toBe(true);
  });

  it("returns true for root-level code files", () => {
    expect(isImplementationFile("index.ts")).toBe(true);
    expect(isImplementationFile("server.mjs")).toBe(true);
    expect(isImplementationFile("config.js")).toBe(true);
  });

  it("returns false for .goopspec files", () => {
    expect(isImplementationFile(".goopspec/SPEC.md")).toBe(false);
    expect(isImplementationFile(".goopspec/state.json")).toBe(false);
    expect(isImplementationFile(".goopspec/plugin-rebuild/BLUEPRINT.md")).toBe(false);
  });

  it("returns false for non-code files", () => {
    expect(isImplementationFile("README.md")).toBe(false);
    expect(isImplementationFile("package.json")).toBe(false);
    expect(isImplementationFile(".gitignore")).toBe(false);
  });

  it("returns false for empty/missing paths", () => {
    expect(isImplementationFile("")).toBe(false);
  });

  it("handles Windows-style backslash paths", () => {
    expect(isImplementationFile("src\\hooks\\index.ts")).toBe(true);
    expect(isImplementationFile(".goopspec\\SPEC.md")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isGoopspecFile
// ---------------------------------------------------------------------------

describe("isGoopspecFile", () => {
  it("returns true for .goopspec paths", () => {
    expect(isGoopspecFile(".goopspec/SPEC.md")).toBe(true);
    expect(isGoopspecFile(".goopspec/state.json")).toBe(true);
    expect(isGoopspecFile(".goopspec\\BLUEPRINT.md")).toBe(true);
  });

  it("returns false for non-.goopspec paths", () => {
    expect(isGoopspecFile("src/index.ts")).toBe(false);
    expect(isGoopspecFile("")).toBe(false);
  });
});
