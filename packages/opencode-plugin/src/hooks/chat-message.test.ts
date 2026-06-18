import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import type { SdkPart } from "../core/sdk-compat.js";
import {
  type PluginContext,
  createMockPluginContext,
  setupTestEnvironment,
} from "../test-utils.js";
import {
  chatMessageFactory,
  createChatMessageHook,
  extractTextFromParts,
  isSignificantMessage,
} from "./chat-message.js";

// ---------------------------------------------------------------------------
// extractTextFromParts
// ---------------------------------------------------------------------------

describe("extractTextFromParts", () => {
  it("extracts text from text parts", () => {
    const parts = [
      { type: "text", text: "hello" },
      { type: "text", text: "world" },
    ] as SdkPart[];
    expect(extractTextFromParts(parts)).toBe("hello\nworld");
  });

  it("ignores non-text parts", () => {
    const parts = [
      { type: "text", text: "hello" },
      { type: "tool-invocation", toolInvocationId: "x", toolName: "y", state: "result" },
    ] as SdkPart[];
    expect(extractTextFromParts(parts)).toBe("hello");
  });

  it("returns empty string for empty parts array", () => {
    expect(extractTextFromParts([])).toBe("");
  });
});

// ---------------------------------------------------------------------------
// isSignificantMessage
// ---------------------------------------------------------------------------

describe("isSignificantMessage", () => {
  it("returns false for very short messages", () => {
    expect(isSignificantMessage("hi")).toBe(false);
    expect(isSignificantMessage("ok")).toBe(false);
    expect(isSignificantMessage("")).toBe(false);
  });

  it("returns true for questions", () => {
    expect(isSignificantMessage("How does this work?")).toBe(true);
  });

  it("returns true for slash commands", () => {
    expect(isSignificantMessage("/goop-execute")).toBe(true);
  });

  it("returns true for long messages (>100 chars)", () => {
    const long = "a".repeat(101);
    expect(isSignificantMessage(long)).toBe(true);
  });

  it("returns true for action keywords", () => {
    expect(isSignificantMessage("please implement the auth flow")).toBe(true);
    expect(isSignificantMessage("we need to fix the login bug")).toBe(true);
    expect(isSignificantMessage("refactor the database layer")).toBe(true);
    expect(isSignificantMessage("build the user dashboard")).toBe(true);
  });

  it("returns false for short non-significant messages", () => {
    expect(isSignificantMessage("sounds good")).toBe(false);
    expect(isSignificantMessage("yes please")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// createChatMessageHook
// ---------------------------------------------------------------------------

describe("createChatMessageHook", () => {
  let ctx: PluginContext;
  let cleanup: () => void;

  beforeEach(() => {
    const env = setupTestEnvironment("chat-message-hook");
    cleanup = env.cleanup;
    ctx = createMockPluginContext({ testDir: env.testDir });
  });

  afterEach(() => cleanup());

  it("returns a Partial<Hooks> with chat.message handler", () => {
    const hooks = createChatMessageHook(ctx);
    expect(hooks["chat.message"]).toBeDefined();
    expect(typeof hooks["chat.message"]).toBe("function");
  });

  it("clears checkpoint on activity", async () => {
    ctx.stateManager.updateWorkflow({ checkpoint: "old-checkpoint" });

    const hooks = createChatMessageHook(ctx);
    await hooks["chat.message"]?.(
      { sessionID: "s1" },
      {
        message: { role: "user", content: "hello world test message" } as never,
        parts: [{ type: "text", text: "hello world test message" }] as SdkPart[],
      },
    );

    const wf = ctx.stateManager.getActiveWorkflow();
    expect(wf.checkpoint).toBeUndefined();
  });

  it("captures significant messages to memory", async () => {
    const hooks = createChatMessageHook(ctx);
    await hooks["chat.message"]?.(
      { sessionID: "s1" },
      {
        message: { role: "user", content: "" } as never,
        parts: [{ type: "text", text: "How do I implement authentication?" }] as SdkPart[],
      },
    );

    const results = await ctx.memory.search({ query: "authentication" });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].memory.type).toBe("note");
    expect(results[0].memory.importance).toBe(6);
  });

  it("does not capture short non-significant messages", async () => {
    const hooks = createChatMessageHook(ctx);
    await hooks["chat.message"]?.(
      { sessionID: "s1" },
      {
        message: { role: "user", content: "" } as never,
        parts: [{ type: "text", text: "ok" }] as SdkPart[],
      },
    );

    const results = await ctx.memory.search({ query: "ok" });
    expect(results.length).toBe(0);
  });

  it("does not capture empty messages", async () => {
    const hooks = createChatMessageHook(ctx);
    await hooks["chat.message"]?.(
      { sessionID: "s1" },
      {
        message: { role: "user", content: "" } as never,
        parts: [],
      },
    );

    const results = await ctx.memory.search({ query: "" });
    expect(results.length).toBe(0);
  });

  it("truncates long titles to 80 chars with ellipsis", async () => {
    const hooks = createChatMessageHook(ctx);
    const longText = `implement ${"a".repeat(200)}`;
    await hooks["chat.message"]?.(
      { sessionID: "s1" },
      {
        message: { role: "user", content: "" } as never,
        parts: [{ type: "text", text: longText }] as SdkPart[],
      },
    );

    const results = await ctx.memory.search({ query: "implement" });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].memory.title.length).toBeLessThanOrEqual(83);
    expect(results[0].memory.title.endsWith("...")).toBe(true);
  });

  it("sets importance 5 for non-question significant messages", async () => {
    const hooks = createChatMessageHook(ctx);
    await hooks["chat.message"]?.(
      { sessionID: "s1" },
      {
        message: { role: "user", content: "" } as never,
        parts: [{ type: "text", text: "please implement the user dashboard" }] as SdkPart[],
      },
    );

    const results = await ctx.memory.search({ query: "dashboard" });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].memory.importance).toBe(5);
  });

  it("does not throw on errors (safeHandler)", async () => {
    const brokenCtx = createMockPluginContext({ testDir: cleanup as unknown as string });
    brokenCtx.memory.save = async () => {
      throw new Error("memory exploded");
    };

    const hooks = createChatMessageHook(brokenCtx);

    await hooks["chat.message"]?.(
      { sessionID: "s1" },
      {
        message: { role: "user", content: "" } as never,
        parts: [{ type: "text", text: "How do I fix this bug?" }] as SdkPart[],
      },
    );
  });
});

// ---------------------------------------------------------------------------
// chatMessageFactory
// ---------------------------------------------------------------------------

describe("chatMessageFactory", () => {
  it("is a valid HookFactory", () => {
    const { testDir, cleanup } = setupTestEnvironment("chat-msg-factory");
    try {
      const ctx = createMockPluginContext({ testDir });
      const hooks = chatMessageFactory(ctx);
      expect(hooks["chat.message"]).toBeDefined();
    } finally {
      cleanup();
    }
  });
});
