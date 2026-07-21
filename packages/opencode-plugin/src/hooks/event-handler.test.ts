import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import type { SdkEvent } from "../core/sdk-compat.js";
import { createMockPluginContext, setupTestEnvironment } from "../test-utils.js";
import { IDLE_COMPACTION_DEFER_MS, createEventHandlerHook } from "./event-handler.js";
import type { Hooks } from "./types.js";

type EventInput = { event: SdkEvent };

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

function idleEvent(sessionID: string): EventInput {
  return { event: { type: "session.idle", properties: { sessionID } } as SdkEvent };
}

function flushIdleCompactionDispatch(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, IDLE_COMPACTION_DEFER_MS));
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

  it("registers a session on session.created", async () => {
    const ctx = createMockPluginContext({ testDir });
    const handler = createEventHandlerHook(ctx).event as NonNullable<Hooks["event"]>;
    await handler({
      event: {
        type: "session.created",
        properties: { info: makeSdkSession("sess-1") },
      } as SdkEvent,
    });
    expect(ctx.sessionManager.get("sess-1")?.info.id).toBe("sess-1");
  });

  it("does not duplicate a repeated session.created event", async () => {
    const ctx = createMockPluginContext({ testDir });
    const handler = createEventHandlerHook(ctx).event as NonNullable<Hooks["event"]>;
    const input: EventInput = {
      event: {
        type: "session.created",
        properties: { info: makeSdkSession("sess-duplicate") },
      } as SdkEvent,
    };

    await handler(input);
    await handler(input);

    expect(ctx.sessionManager.size()).toBe(1);
  });

  it("marks a tracked session idle and dispatches queued compaction with auto", async () => {
    const ctx = createMockPluginContext({ testDir });
    const summarize = mock(async () => ({ data: true }));
    Object.assign(ctx.sdk.client, { session: { summarize } });
    ctx.sessionManager.create("sess-compact");
    ctx.pendingCompactions.set("sess-compact", {
      model: { providerID: "opencode", modelID: "deepseek-v4" },
      status: "queued",
      queuedAtMs: Date.now(),
    });
    const handler = createEventHandlerHook(ctx).event as NonNullable<Hooks["event"]>;

    await handler(idleEvent("sess-compact"));

    expect(ctx.sessionManager.get("sess-compact")?.meta.idleSince).not.toBeNull();
    expect(summarize).not.toHaveBeenCalled();
    await flushIdleCompactionDispatch();
    expect(summarize).toHaveBeenCalledWith({
      path: { id: "sess-compact" },
      body: { providerID: "opencode", modelID: "deepseek-v4", auto: true },
    });
  });

  it("dispatches queued compaction for untracked sessions", async () => {
    const ctx = createMockPluginContext({ testDir });
    const summarize = mock(async () => ({ data: true }));
    Object.assign(ctx.sdk.client, { session: { summarize } });
    ctx.pendingCompactions.set("unknown-sess", {
      model: { providerID: "opencode", modelID: "deepseek-v4" },
      status: "queued",
      queuedAtMs: Date.now(),
    });
    const handler = createEventHandlerHook(ctx).event as NonNullable<Hooks["event"]>;

    await handler(idleEvent("unknown-sess"));

    expect(ctx.sessionManager.size()).toBe(0);
    expect(summarize).not.toHaveBeenCalled();
    await flushIdleCompactionDispatch();
    expect(summarize).toHaveBeenCalledWith({
      path: { id: "unknown-sess" },
      body: { providerID: "opencode", modelID: "deepseek-v4", auto: true },
    });
  });

  it("dispatches exactly one summarize when duplicate idle events are deferred", async () => {
    const ctx = createMockPluginContext({ testDir });
    const summarize = mock(async () => ({ data: true }));
    Object.assign(ctx.sdk.client, { session: { summarize } });
    ctx.pendingCompactions.set("sess-deduped", {
      model: { providerID: "opencode", modelID: "deepseek-v4" },
      status: "queued",
      queuedAtMs: Date.now(),
    });
    const handler = createEventHandlerHook(ctx).event as NonNullable<Hooks["event"]>;

    await handler(idleEvent("sess-deduped"));
    await handler(idleEvent("sess-deduped"));

    expect(summarize).not.toHaveBeenCalled();
    await flushIdleCompactionDispatch();
    expect(summarize).toHaveBeenCalledTimes(1);
  });

  it("removes a session on session.deleted", async () => {
    const ctx = createMockPluginContext({ testDir });
    ctx.sessionManager.create("sess-del");
    const handler = createEventHandlerHook(ctx).event as NonNullable<Hooks["event"]>;
    await handler({
      event: {
        type: "session.deleted",
        properties: { info: makeSdkSession("sess-del") },
      } as SdkEvent,
    });
    expect(ctx.sessionManager.get("sess-del")).toBeUndefined();
  });

  it("does not throw when deleting an untracked session", async () => {
    const ctx = createMockPluginContext({ testDir });
    const handler = createEventHandlerHook(ctx).event as NonNullable<Hooks["event"]>;

    await handler({
      event: {
        type: "session.deleted",
        properties: { info: makeSdkSession("missing-session") },
      } as SdkEvent,
    });

    expect(ctx.sessionManager.size()).toBe(0);
  });

  it("silently ignores unknown event types", async () => {
    const ctx = createMockPluginContext({ testDir });
    const getSpy = spyOn(ctx.sessionManager, "get");
    const createSpy = spyOn(ctx.sessionManager, "create");
    const markIdleSpy = spyOn(ctx.sessionManager, "markIdle");
    const deleteSpy = spyOn(ctx.sessionManager, "delete");
    const timerSpy = spyOn(globalThis, "setTimeout");
    const handler = createEventHandlerHook(ctx).event as NonNullable<Hooks["event"]>;
    await handler({
      event: { type: "vcs.branch.updated", properties: { branch: "main" } } as SdkEvent,
    });
    expect(ctx.sessionManager.size()).toBe(0);
    expect(getSpy).not.toHaveBeenCalled();
    expect(createSpy).not.toHaveBeenCalled();
    expect(markIdleSpy).not.toHaveBeenCalled();
    expect(deleteSpy).not.toHaveBeenCalled();
    expect(timerSpy).not.toHaveBeenCalled();
    timerSpy.mockRestore();
  });

  it("ignores malformed and null events", async () => {
    const ctx = createMockPluginContext({ testDir });
    const handler = createEventHandlerHook(ctx).event as NonNullable<Hooks["event"]>;

    // biome-ignore lint/suspicious/noExplicitAny: testing malformed SDK events
    await handler({ event: {} } as any);
    // biome-ignore lint/suspicious/noExplicitAny: testing malformed SDK events
    await handler({ event: null } as any);

    expect(ctx.sessionManager.size()).toBe(0);
  });

  it("does not throw when a lifecycle operation fails", async () => {
    const ctx = createMockPluginContext({ testDir });
    (ctx as { sessionManager: typeof ctx.sessionManager }).sessionManager = {
      ...ctx.sessionManager,
      create: () => {
        throw new Error("simulated failure");
      },
    };
    const consoleSpy = spyOn(console, "error").mockImplementation(() => {});
    const handler = createEventHandlerHook(ctx).event as NonNullable<Hooks["event"]>;

    await handler({
      event: {
        type: "session.created",
        properties: { info: makeSdkSession("fail-sess") },
      } as SdkEvent,
    });

    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
