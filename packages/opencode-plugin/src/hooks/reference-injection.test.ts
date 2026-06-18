import { afterEach, describe, expect, it, spyOn } from "bun:test";
import type { SdkModel } from "../core/sdk-compat.js";
import type { ResolvedResource } from "../core/types.js";
import {
  clearSignals,
  getSignals,
  setSignals,
} from "../features/reference-signals/index.js";
import {
  createMockPluginContext,
  createDefaultWorkflowState,
  setupTestEnvironment,
} from "../test-utils.js";
import {
  createReferenceInjectionHook,
  referenceInjectionFactory,
} from "./reference-injection.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SESSION_ID = "test-session-ref-inject";

/** Build a mock SdkPart with type "text". */
function textPart(text: string) {
  return { type: "text" as const, text };
}

/** Build a mock ChatMessageInput. */
function chatInput(sessionID = SESSION_ID) {
  return { sessionID, agent: "test-agent" };
}

/** Build a mock ChatMessageOutput with text parts. */
function chatOutput(text: string) {
  return {
    message: { role: "user" as const, parts: [textPart(text)] },
    parts: [textPart(text)],
  };
}

/** Build a mock system-transform input. */
function sysInput(sessionID = SESSION_ID) {
  return { sessionID, model: {} as SdkModel };
}

/** Create mock reference resources for the resolver. */
function mockResources(...names: string[]): ResolvedResource[] {
  return names.map((name) => ({
    type: "reference" as const,
    name,
    content: `# ${name}\n\nThis is the ${name} reference content for testing purposes.`,
    path: `references/${name}.md`,
  }));
}

// ---------------------------------------------------------------------------
// Factory shape
// ---------------------------------------------------------------------------

describe("referenceInjectionFactory", () => {
  it("returns object with both chat.message and system-transform handlers", () => {
    const { cleanup } = setupTestEnvironment("ref-inject-factory");
    try {
      const ctx = createMockPluginContext({
        resources: mockResources("debugging", "pr-creation", "dogfooding"),
      });
      const hooks = createReferenceInjectionHook(ctx);

      expect(hooks["chat.message"]).toBeDefined();
      expect(typeof hooks["chat.message"]).toBe("function");
      expect(hooks["experimental.chat.system.transform"]).toBeDefined();
      expect(typeof hooks["experimental.chat.system.transform"]).toBe("function");
    } finally {
      cleanup();
    }
  });

  it("satisfies HookFactory signature", () => {
    const { cleanup } = setupTestEnvironment("ref-inject-factory-sig");
    try {
      const ctx = createMockPluginContext();
      const hooks = referenceInjectionFactory(ctx);

      expect(hooks["chat.message"]).toBeDefined();
      expect(hooks["experimental.chat.system.transform"]).toBeDefined();
    } finally {
      cleanup();
    }
  });
});

// ---------------------------------------------------------------------------
// chat.message handler
// ---------------------------------------------------------------------------

describe("chat.message handler", () => {
  afterEach(() => {
    clearSignals(SESSION_ID);
  });

  it("sets signals when user message contains 'debug'", async () => {
    const ctx = createMockPluginContext({
      resources: mockResources("debugging"),
    });
    const hooks = createReferenceInjectionHook(ctx);
    const handler = hooks["chat.message"]!;

    await handler(chatInput(), chatOutput("I need to debug this issue"));

    const signals = getSignals(SESSION_ID);
    expect(signals).toContain("debugging");
  });

  it("sets signals when user message contains 'PR'", async () => {
    const ctx = createMockPluginContext({
      resources: mockResources("pr-creation"),
    });
    const hooks = createReferenceInjectionHook(ctx);
    const handler = hooks["chat.message"]!;

    await handler(chatInput(), chatOutput("open a PR for this feature"));

    const signals = getSignals(SESSION_ID);
    expect(signals).toContain("pr-creation");
  });

  it("does not set signals when no keywords match", async () => {
    const ctx = createMockPluginContext();
    const hooks = createReferenceInjectionHook(ctx);
    const handler = hooks["chat.message"]!;

    await handler(chatInput(), chatOutput("hello world"));

    expect(getSignals(SESSION_ID)).toEqual([]);
  });

  it("does not set signals for empty text", async () => {
    const ctx = createMockPluginContext();
    const hooks = createReferenceInjectionHook(ctx);
    const handler = hooks["chat.message"]!;

    await handler(chatInput(), chatOutput("   "));

    expect(getSignals(SESSION_ID)).toEqual([]);
  });

  it("graceful degradation: does not crash on error", async () => {
    const ctx = createMockPluginContext();
    const hooks = createReferenceInjectionHook(ctx);
    const handler = hooks["chat.message"]!;

    const consoleSpy = spyOn(console, "error").mockImplementation(() => {});

    // Pass malformed output with no parts array
    const badOutput = { message: {}, parts: null } as unknown;
    await handler(chatInput(), badOutput);

    // Should not throw — safeHandler catches it
    consoleSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// experimental.chat.system.transform handler
// ---------------------------------------------------------------------------

describe("experimental.chat.system.transform handler", () => {
  afterEach(() => {
    clearSignals(SESSION_ID);
  });

  it("injects <goopspec_references> block when signals exist", async () => {
    const ctx = createMockPluginContext({
      resources: mockResources("debugging"),
    });
    const hooks = createReferenceInjectionHook(ctx);
    const handler = hooks["experimental.chat.system.transform"]!;

    // Pre-set signals manually
    setSignals(SESSION_ID, ["debugging"]);

    const output = { system: ["existing prompt"] };
    await handler(sysInput(), output);

    expect(output.system.length).toBe(2);
    const injected = output.system[1];
    expect(injected).toContain("<goopspec_references>");
    expect(injected).toContain("</goopspec_references>");
    expect(injected).toContain("debugging");
  });

  it("includes matched reference name(s) in the block", async () => {
    const ctx = createMockPluginContext({
      resources: mockResources("debugging", "pr-creation"),
    });
    const hooks = createReferenceInjectionHook(ctx);
    const handler = hooks["experimental.chat.system.transform"]!;

    setSignals(SESSION_ID, ["debugging", "pr-creation"]);

    const output = { system: [] as string[] };
    await handler(sysInput(), output);

    expect(output.system.length).toBe(1);
    const injected = output.system[0];
    expect(injected).toContain("Reference: debugging");
    expect(injected).toContain("Reference: pr-creation");
  });

  it("clears signals after injection", async () => {
    const ctx = createMockPluginContext({
      resources: mockResources("debugging"),
    });
    const hooks = createReferenceInjectionHook(ctx);
    const handler = hooks["experimental.chat.system.transform"]!;

    setSignals(SESSION_ID, ["debugging"]);

    const output = { system: [] as string[] };
    await handler(sysInput(), output);

    // Signals should be cleared after injection
    expect(getSignals(SESSION_ID)).toEqual([]);
  });

  it("does nothing when no signals exist", async () => {
    const ctx = createMockPluginContext({
      resources: mockResources("debugging"),
    });
    const hooks = createReferenceInjectionHook(ctx);
    const handler = hooks["experimental.chat.system.transform"]!;

    // No signals set
    const output = { system: ["original prompt"] };
    await handler(sysInput(), output);

    expect(output.system).toEqual(["original prompt"]);
  });

  it("does nothing when sessionID is missing", async () => {
    const ctx = createMockPluginContext({
      resources: mockResources("debugging"),
    });
    const hooks = createReferenceInjectionHook(ctx);
    const handler = hooks["experimental.chat.system.transform"]!;

    setSignals(SESSION_ID, ["debugging"]);

    const output = { system: ["original"] };
    // Pass input without sessionID
    await handler({ model: {} as SdkModel }, output);

    expect(output.system).toEqual(["original"]);
  });

  it("token budget: injected content is within ~200 tokens per reference", async () => {
    // Create a resource with very long content
    const longContent = "x".repeat(5000);
    const ctx = createMockPluginContext({
      resources: [
        {
          type: "reference" as const,
          name: "debugging",
          content: longContent,
          path: "references/debugging.md",
        },
      ],
    });
    const hooks = createReferenceInjectionHook(ctx);
    const handler = hooks["experimental.chat.system.transform"]!;

    setSignals(SESSION_ID, ["debugging"]);

    const output = { system: [] as string[] };
    await handler(sysInput(), output);

    expect(output.system.length).toBe(1);
    const injected = output.system[0];

    // ~200 tokens ≈ 800 chars per reference, plus block tags and header
    // The total block should be well under 1200 chars for a single reference
    expect(injected.length).toBeLessThan(1200);
    expect(injected).toContain("<goopspec_references>");
    expect(injected).toContain("</goopspec_references>");
  });

  it("skips references that the resolver cannot find", async () => {
    // Resolver has no resources — resolve returns null
    const ctx = createMockPluginContext({ resources: [] });
    const hooks = createReferenceInjectionHook(ctx);
    const handler = hooks["experimental.chat.system.transform"]!;

    setSignals(SESSION_ID, ["debugging", "nonexistent"]);

    const output = { system: ["original"] };
    await handler(sysInput(), output);

    // No references resolved, so nothing injected (only original remains)
    expect(output.system).toEqual(["original"]);
    // Signals should still be cleared
    expect(getSignals(SESSION_ID)).toEqual([]);
  });

  it("graceful degradation: does not throw when resolver throws", async () => {
    const ctx = createMockPluginContext({
      resources: mockResources("debugging"),
    });

    // Make resolver.resolve throw
    const originalResolve = ctx.resolver.resolve;
    (ctx.resolver as unknown as { resolve: () => never }).resolve = () => {
      throw new Error("resolver explosion");
    };

    const consoleSpy = spyOn(console, "error").mockImplementation(() => {});

    const hooks = createReferenceInjectionHook(ctx);
    const handler = hooks["experimental.chat.system.transform"]!;

    setSignals(SESSION_ID, ["debugging"]);

    const output = { system: ["original prompt"] };
    await handler(sysInput(), output);

    // safeHandler catches the error — original prompt preserved
    expect(output.system).toEqual(["original prompt"]);

    consoleSpy.mockRestore();
    (ctx.resolver as unknown as { resolve: typeof originalResolve }).resolve = originalResolve;
  });
});

// ---------------------------------------------------------------------------
// Integration: chat.message → system-transform pipeline
// ---------------------------------------------------------------------------

describe("chat.message → system-transform integration", () => {
  afterEach(() => {
    clearSignals(SESSION_ID);
  });

  it("end-to-end: keyword in message → reference injected in system prompt", async () => {
    const ctx = createMockPluginContext({
      resources: mockResources("debugging", "pr-creation", "dogfooding"),
    });
    const hooks = createReferenceInjectionHook(ctx);

    // Step 1: chat.message detects keywords
    await hooks["chat.message"]!(
      chatInput(),
      chatOutput("I need to debug this crash"),
    );

    // Step 2: system-transform injects references
    const output = { system: [] as string[] };
    await hooks["experimental.chat.system.transform"]!(sysInput(), output);

    expect(output.system.length).toBe(1);
    expect(output.system[0]).toContain("<goopspec_references>");
    expect(output.system[0]).toContain("debugging");

    // Step 3: signals are cleared
    expect(getSignals(SESSION_ID)).toEqual([]);
  });

  it("end-to-end: no keywords → nothing injected", async () => {
    const ctx = createMockPluginContext({
      resources: mockResources("debugging"),
    });
    const hooks = createReferenceInjectionHook(ctx);

    // Step 1: chat.message with no keywords
    await hooks["chat.message"]!(
      chatInput(),
      chatOutput("hello world"),
    );

    // Step 2: system-transform — nothing to inject
    const output = { system: ["original"] };
    await hooks["experimental.chat.system.transform"]!(sysInput(), output);

    expect(output.system).toEqual(["original"]);
  });
});
