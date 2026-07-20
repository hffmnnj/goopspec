import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import type { SdkEvent } from "../core/sdk-compat.js";
import { createMockPluginContext, setupTestEnvironment } from "../test-utils.js";
import { createEventHandlerHook } from "./event-handler.js";
import type { Hooks } from "./types.js";

type EventInput = { event: SdkEvent };

/** Build a minimal SDK Session object for event payloads. */
function makeSdkSession(id: string) {
  return {
    id,
    slug: id,
    projectID: "proj-1",
    directory: "/tmp/test",
    title: "Test Session",
    version: "1",
    time: { created: Date.now(), updated: Date.now() },
  };
}

describe("event-handler hook", () => {
  let cleanup: () => void;
  let testDir: string;

  beforeEach(() => {
    const env = setupTestEnvironment("event-handler");
    cleanup = env.cleanup;
    testDir = env.testDir;
  });

  afterEach(() => cleanup());

  // -----------------------------------------------------------------------
  // session.created
  // -----------------------------------------------------------------------

  it("registers a session on session.created", async () => {
    const ctx = createMockPluginContext({ testDir });
    const hooks = createEventHandlerHook(ctx);
    const handler = hooks.event as NonNullable<Hooks["event"]>;

    const input: EventInput = {
      event: {
        type: "session.created",
        properties: { info: makeSdkSession("sess-1") },
      } as SdkEvent,
    };

    await handler(input);

    const session = ctx.sessionManager.get("sess-1");
    expect(session).toBeDefined();
    expect(session?.info.id).toBe("sess-1");
  });

  it("does not duplicate session on repeated session.created", async () => {
    const ctx = createMockPluginContext({ testDir });
    const hooks = createEventHandlerHook(ctx);
    const handler = hooks.event as NonNullable<Hooks["event"]>;

    const input: EventInput = {
      event: {
        type: "session.created",
        properties: { info: makeSdkSession("sess-dup") },
      } as SdkEvent,
    };

    await handler(input);
    await handler(input);

    expect(ctx.sessionManager.size()).toBe(1);
  });

  // -----------------------------------------------------------------------
  // session.idle
  // -----------------------------------------------------------------------

  it("marks a tracked session idle on session.idle", async () => {
    const ctx = createMockPluginContext({ testDir });
    const hooks = createEventHandlerHook(ctx);
    const handler = hooks.event as NonNullable<Hooks["event"]>;

    // First create the session
    ctx.sessionManager.create("sess-idle");

    const input: EventInput = {
      event: {
        type: "session.idle",
        properties: { sessionID: "sess-idle" },
      } as SdkEvent,
    };

    await handler(input);

    const session = ctx.sessionManager.get("sess-idle");
    expect(session?.meta.idleSince).not.toBeNull();
  });

  it("marks a tracked session idle without dispatching a compaction", async () => {
    const ctx = createMockPluginContext({ testDir });
    const summarize = mock(async () => ({ data: true }));
    Object.assign(ctx.sdk.client, { session: { summarize } });
    ctx.sessionManager.create("sess-compact");
    ctx.compactionHandoff.set("sess-compact", "Resume after compaction.");
    ctx.pendingCompactions.set("sess-compact", {
      model: { providerID: "opencode", modelID: "deepseek-v4" },
      status: "in-flight",
    });
    const hooks = createEventHandlerHook(ctx);
    const handler = hooks.event as NonNullable<Hooks["event"]>;

    await handler({
      event: {
        type: "session.idle",
        properties: { sessionID: "sess-compact" },
      } as SdkEvent,
    });

    expect(ctx.sessionManager.get("sess-compact")?.meta.idleSince).not.toBeNull();
    expect(summarize).not.toHaveBeenCalled();
    expect(ctx.pendingCompactions.has("sess-compact")).toBeTrue();
  });

  it("ignores session.idle for untracked sessions", async () => {
    const ctx = createMockPluginContext({ testDir });
    const hooks = createEventHandlerHook(ctx);
    const handler = hooks.event as NonNullable<Hooks["event"]>;

    const input: EventInput = {
      event: {
        type: "session.idle",
        properties: { sessionID: "unknown-sess" },
      } as SdkEvent,
    };

    // Should not throw
    await handler(input);

    expect(ctx.sessionManager.size()).toBe(0);
  });

  // -----------------------------------------------------------------------
  // session.deleted
  // -----------------------------------------------------------------------

  it("removes a session on session.deleted", async () => {
    const ctx = createMockPluginContext({ testDir });
    const hooks = createEventHandlerHook(ctx);
    const handler = hooks.event as NonNullable<Hooks["event"]>;

    // Pre-register the session
    ctx.sessionManager.create("sess-del");
    expect(ctx.sessionManager.size()).toBe(1);

    const input: EventInput = {
      event: {
        type: "session.deleted",
        properties: { info: makeSdkSession("sess-del") },
      } as SdkEvent,
    };

    await handler(input);

    expect(ctx.sessionManager.get("sess-del")).toBeUndefined();
    expect(ctx.sessionManager.size()).toBe(0);
  });

  it("does not throw when deleting an untracked session", async () => {
    const ctx = createMockPluginContext({ testDir });
    const hooks = createEventHandlerHook(ctx);
    const handler = hooks.event as NonNullable<Hooks["event"]>;

    const input: EventInput = {
      event: {
        type: "session.deleted",
        properties: { info: makeSdkSession("nonexistent") },
      } as SdkEvent,
    };

    // Should not throw
    await handler(input);
    expect(ctx.sessionManager.size()).toBe(0);
  });

  // -----------------------------------------------------------------------
  // Unknown event types — silently ignored
  // -----------------------------------------------------------------------

  it("silently ignores unknown event types", async () => {
    const ctx = createMockPluginContext({ testDir });
    const hooks = createEventHandlerHook(ctx);
    const handler = hooks.event as NonNullable<Hooks["event"]>;

    const input: EventInput = {
      event: {
        type: "vcs.branch.updated",
        properties: { branch: "main" },
      } as SdkEvent,
    };

    await handler(input);

    expect(ctx.sessionManager.size()).toBe(0);
  });

  // -----------------------------------------------------------------------
  // Malformed events — graceful degradation
  // -----------------------------------------------------------------------

  it("handles malformed event with missing type gracefully", async () => {
    const ctx = createMockPluginContext({ testDir });
    const hooks = createEventHandlerHook(ctx);
    const handler = hooks.event as NonNullable<Hooks["event"]>;

    // biome-ignore lint/suspicious/noExplicitAny: testing malformed input
    const input = { event: {} } as any;

    await handler(input);
    expect(ctx.sessionManager.size()).toBe(0);
  });

  it("handles null event gracefully", async () => {
    const ctx = createMockPluginContext({ testDir });
    const hooks = createEventHandlerHook(ctx);
    const handler = hooks.event as NonNullable<Hooks["event"]>;

    // biome-ignore lint/suspicious/noExplicitAny: testing malformed input
    const input = { event: null } as any;

    await handler(input);
    expect(ctx.sessionManager.size()).toBe(0);
  });

  // -----------------------------------------------------------------------
  // safeHandler wrapping — never throws
  // -----------------------------------------------------------------------

  it("does not throw even when sessionManager throws internally", async () => {
    const ctx = createMockPluginContext({ testDir });

    // Force sessionManager.create to throw
    const originalCreate = ctx.sessionManager.create;
    (ctx as { sessionManager: typeof ctx.sessionManager }).sessionManager = {
      ...ctx.sessionManager,
      create: () => {
        throw new Error("simulated failure");
      },
    };

    const consoleSpy = spyOn(console, "error").mockImplementation(() => {});

    const hooks = createEventHandlerHook(ctx);
    const handler = hooks.event as NonNullable<Hooks["event"]>;

    const input: EventInput = {
      event: {
        type: "session.created",
        properties: { info: makeSdkSession("fail-sess") },
      } as SdkEvent,
    };

    // safeHandler catches the error
    await handler(input);

    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();

    // Restore original
    (ctx as { sessionManager: typeof ctx.sessionManager }).sessionManager = {
      ...ctx.sessionManager,
      create: originalCreate,
    };
  });
});
