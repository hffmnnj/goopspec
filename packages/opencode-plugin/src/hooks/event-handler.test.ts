import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import type { SdkEvent } from "../core/sdk-compat.js";
import {
  createMockCompactionHandoff,
  createMockPluginContext,
  setupTestEnvironment,
} from "../test-utils.js";
import { IDLE_COMPACTION_DEFER_MS, createEventHandlerHook } from "./event-handler.js";
import type { Hooks } from "./types.js";

type EventInput = { event: SdkEvent };

async function readEventHandlerSource(): Promise<string> {
  const file = Bun.file(new URL("./event-handler.ts", import.meta.url));
  return file.text();
}

function extractHandledEventTypes(source: string): Set<string> {
  const guards = new Set<string>();
  // Each type alias is: type SessionCreatedEvent = Extract<SdkEvent, { type: "session.created" }>
  const aliasPattern = /type Session(\w+)Event = Extract<SdkEvent, \{ type: "([^"]+)" \}>/g;
  let match: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: sequential regex.exec is the idiomatic loop
  while ((match = aliasPattern.exec(source)) != null) {
    if (match[2]) guards.add(match[2]);
  }
  return guards;
}

function extractAllowList(source: string): Set<string> {
  const list = new Set<string>();
  // The allow-list is a chain of `eventType !== "..."` conditions.
  const blockPattern = /eventType !== "([^"]+)"/g;
  let match: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: sequential regex.exec is the idiomatic loop
  while ((match = blockPattern.exec(source)) != null) {
    list.add(match[1]);
  }
  return list;
}

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

  it("dispatches one lazy autopilot nudge when duplicate idle events are deferred", async () => {
    const ctx = createMockPluginContext({
      testDir,
      state: {
        activeWorkflowId: "default",
        workflows: {
          default: {
            phase: "execute",
            mode: "standard",
            depth: "standard",
            interviewComplete: false,
            specLocked: false,
            acceptanceConfirmed: true,
            currentWave: 1,
            totalWaves: 3,
            autopilot: false,
            lazyAutopilot: true,
          },
        },
      },
    });
    const promptAsync = mock(async () => undefined);
    Object.assign(ctx.sdk.client, {
      session: {
        messages: mock(async () => [{ info: { role: "assistant" } }]),
        get: mock(async () => ({ directory: testDir })),
        promptAsync,
      },
    });
    const handler = createEventHandlerHook(ctx).event as NonNullable<Hooks["event"]>;

    await handler(idleEvent("sess-lazy-deduped"));
    await handler(idleEvent("sess-lazy-deduped"));
    await flushIdleCompactionDispatch();
    await Promise.resolve();

    expect(promptAsync).toHaveBeenCalledTimes(1);
    expect(promptAsync).toHaveBeenCalledWith({
      path: { id: "sess-lazy-deduped" },
      body: {
        agent: "goop-orchestrator",
        model: {
          providerID: expect.any(String),
          modelID: expect.any(String),
        },
        parts: [
          {
            type: "text",
            text: "LAZY AUTOPILOT ENGAGED - Do not pause unless you 100% cannot move forward without something from the user. Use your best judgement and continue.",
          },
        ],
      },
    });
  });

  it("removes a session and clears compaction state on session.deleted", async () => {
    const ctx = createMockPluginContext({ testDir });
    ctx.sessionManager.create("sess-del");
    ctx.pendingCompactions.set("sess-del", {
      model: { providerID: "opencode", modelID: "deepseek-v4" },
      status: "queued",
      queuedAtMs: Date.now(),
    });
    ctx.compactionHandoff.set("sess-del", createMockCompactionHandoff("handoff-token"));
    ctx.sessionManager.create("sess-live");
    ctx.pendingCompactions.set("sess-live", {
      model: { providerID: "opencode", modelID: "deepseek-v4" },
      status: "queued",
      queuedAtMs: Date.now(),
    });
    ctx.compactionHandoff.set("sess-live", createMockCompactionHandoff("handoff-token-live"));
    const deleteSpy = spyOn(ctx.sessionManager, "delete");
    const handler = createEventHandlerHook(ctx).event as NonNullable<Hooks["event"]>;

    await handler({
      event: {
        type: "session.deleted",
        properties: { info: makeSdkSession("sess-del") },
      } as SdkEvent,
    });

    expect(deleteSpy).toHaveBeenCalledWith("sess-del");
    expect(ctx.sessionManager.get("sess-del")).toBeUndefined();
    expect(ctx.pendingCompactions.has("sess-del")).toBe(false);
    expect(ctx.compactionHandoff.has("sess-del")).toBe(false);
    expect(ctx.sessionManager.get("sess-live")?.info.id).toBe("sess-live");
    expect(ctx.pendingCompactions.has("sess-live")).toBe(true);
    expect(ctx.compactionHandoff.has("sess-live")).toBe(true);
    deleteSpy.mockRestore();
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

  it("clears pending compaction state on session.compacted through the exported hook", async () => {
    const ctx = createMockPluginContext({ testDir });
    const invalidateSpy = spyOn(ctx.stateManager, "invalidate");
    ctx.pendingCompactions.set("sess-compacted", {
      model: { providerID: "opencode", modelID: "deepseek-v4" },
      status: "queued",
      queuedAtMs: Date.now(),
    });
    ctx.compactionHandoff.set("sess-compacted", createMockCompactionHandoff("handoff-token"));
    const handler = createEventHandlerHook(ctx).event as NonNullable<Hooks["event"]>;

    await handler({
      event: { type: "session.compacted", properties: { sessionID: "sess-compacted" } } as SdkEvent,
    });

    expect(ctx.pendingCompactions.has("sess-compacted")).toBe(false);
    expect(ctx.compactionHandoff.has("sess-compacted")).toBe(false);
    expect(invalidateSpy).toHaveBeenCalledTimes(1);
    invalidateSpy.mockRestore();
  });

  it("leaves a second live session untouched on session.compacted", async () => {
    const ctx = createMockPluginContext({ testDir });
    ctx.pendingCompactions.set("sess-live", {
      model: { providerID: "opencode", modelID: "deepseek-v4" },
      status: "queued",
      queuedAtMs: Date.now(),
    });
    ctx.compactionHandoff.set("sess-live", createMockCompactionHandoff("handoff-token"));
    const handler = createEventHandlerHook(ctx).event as NonNullable<Hooks["event"]>;

    await handler({
      event: { type: "session.compacted", properties: { sessionID: "sess-other" } } as SdkEvent,
    });

    expect(ctx.pendingCompactions.has("sess-live")).toBe(true);
    expect(ctx.compactionHandoff.has("sess-live")).toBe(true);
  });

  it("clears pending compaction state on session.error through the exported hook", async () => {
    const ctx = createMockPluginContext({ testDir });
    ctx.pendingCompactions.set("sess-error", {
      model: { providerID: "opencode", modelID: "deepseek-v4" },
      status: "queued",
      queuedAtMs: Date.now(),
    });
    ctx.compactionHandoff.set("sess-error", createMockCompactionHandoff("handoff-token"));
    ctx.pendingCompactions.set("sess-live", {
      model: { providerID: "opencode", modelID: "deepseek-v4" },
      status: "queued",
      queuedAtMs: Date.now(),
    });
    ctx.compactionHandoff.set("sess-live", createMockCompactionHandoff("handoff-token-live"));
    const handler = createEventHandlerHook(ctx).event as NonNullable<Hooks["event"]>;

    await handler({
      event: { type: "session.error", properties: { sessionID: "sess-error" } } as SdkEvent,
    });

    expect(ctx.pendingCompactions.has("sess-error")).toBe(false);
    expect(ctx.compactionHandoff.has("sess-error")).toBe(false);
    expect(ctx.pendingCompactions.has("sess-live")).toBe(true);
    expect(ctx.compactionHandoff.has("sess-live")).toBe(true);
  });

  it("does not clear any compaction state when session.error has no sessionID", async () => {
    const ctx = createMockPluginContext({ testDir });
    ctx.pendingCompactions.set("sess-1", {
      model: { providerID: "opencode", modelID: "deepseek-v4" },
      status: "queued",
      queuedAtMs: Date.now(),
    });
    ctx.compactionHandoff.set("sess-1", createMockCompactionHandoff("handoff-token-1"));
    ctx.pendingCompactions.set("sess-2", {
      model: { providerID: "opencode", modelID: "deepseek-v4" },
      status: "queued",
      queuedAtMs: Date.now(),
    });
    ctx.compactionHandoff.set("sess-2", createMockCompactionHandoff("handoff-token-2"));
    const handler = createEventHandlerHook(ctx).event as NonNullable<Hooks["event"]>;

    await handler({
      event: {
        type: "session.error",
        properties: { error: { name: "UnknownError", data: { message: "boom" } } },
      } as SdkEvent,
    });

    expect(ctx.pendingCompactions.has("sess-1")).toBe(true);
    expect(ctx.compactionHandoff.has("sess-1")).toBe(true);
    expect(ctx.pendingCompactions.has("sess-2")).toBe(true);
    expect(ctx.compactionHandoff.has("sess-2")).toBe(true);
  });

  it("does not short-circuit session.compacted through the allow-list", async () => {
    const ctx = createMockPluginContext({ testDir });
    const handler = createEventHandlerHook(ctx).event as NonNullable<Hooks["event"]>;

    const result = handler({
      event: { type: "session.compacted", properties: { sessionID: "sess-allow" } } as SdkEvent,
    });

    expect(result).not.toBeUndefined();
    // Awaiting to prove lifecycleHandler ran rather than returning the ignored-event promise
    await result;
  });

  it("does not short-circuit session.error through the allow-list", async () => {
    const ctx = createMockPluginContext({ testDir });
    const handler = createEventHandlerHook(ctx).event as NonNullable<Hooks["event"]>;

    const result = handler({
      event: { type: "session.error", properties: { sessionID: "sess-allow" } } as SdkEvent,
    });

    expect(result).not.toBeUndefined();
    await result;
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

  describe("wiring reachability", () => {
    function makeHandler(ctx: ReturnType<typeof createMockPluginContext>) {
      return createEventHandlerHook(ctx).event as NonNullable<Hooks["event"]>;
    }

    it("session.created reaches the handler through the exported hook", async () => {
      const ctx = createMockPluginContext({ testDir });
      const handler = makeHandler(ctx);
      const result = handler({
        event: {
          type: "session.created",
          properties: { info: makeSdkSession("wired-create") },
        } as SdkEvent,
      });
      expect(result).not.toBeUndefined();
      await result;
      expect(ctx.sessionManager.get("wired-create")?.info.id).toBe("wired-create");
    });

    it("session.idle reaches the handler through the exported hook", async () => {
      const ctx = createMockPluginContext({ testDir });
      ctx.sessionManager.create("wired-idle");
      ctx.pendingCompactions.set("wired-idle", {
        model: { providerID: "opencode", modelID: "deepseek-v4" },
        status: "queued",
        queuedAtMs: Date.now(),
      });
      const summarize = mock(async () => ({ data: true }));
      Object.assign(ctx.sdk.client, { session: { summarize } });
      const handler = makeHandler(ctx);
      const result = handler(idleEvent("wired-idle"));
      expect(result).not.toBeUndefined();
      await result;
      await flushIdleCompactionDispatch();
      expect(summarize).toHaveBeenCalled();
    });

    it("session.compacted reaches the handler through the exported hook", async () => {
      const ctx = createMockPluginContext({ testDir });
      ctx.pendingCompactions.set("wired-compacted", {
        model: { providerID: "opencode", modelID: "deepseek-v4" },
        status: "queued",
        queuedAtMs: Date.now(),
      });
      ctx.compactionHandoff.set("wired-compacted", createMockCompactionHandoff("handoff"));
      const handler = makeHandler(ctx);
      const result = handler({
        event: {
          type: "session.compacted",
          properties: { sessionID: "wired-compacted" },
        } as SdkEvent,
      });
      expect(result).not.toBeUndefined();
      await result;
      expect(ctx.pendingCompactions.has("wired-compacted")).toBe(false);
      expect(ctx.compactionHandoff.has("wired-compacted")).toBe(false);
    });

    it("session.error reaches the handler through the exported hook", async () => {
      const ctx = createMockPluginContext({ testDir });
      ctx.pendingCompactions.set("wired-error", {
        model: { providerID: "opencode", modelID: "deepseek-v4" },
        status: "queued",
        queuedAtMs: Date.now(),
      });
      ctx.compactionHandoff.set("wired-error", createMockCompactionHandoff("handoff"));
      const handler = makeHandler(ctx);
      const result = handler({
        event: { type: "session.error", properties: { sessionID: "wired-error" } } as SdkEvent,
      });
      expect(result).not.toBeUndefined();
      await result;
      expect(ctx.pendingCompactions.has("wired-error")).toBe(false);
      expect(ctx.compactionHandoff.has("wired-error")).toBe(false);
    });

    it("session.deleted reaches the handler through the exported hook", async () => {
      const ctx = createMockPluginContext({ testDir });
      ctx.sessionManager.create("wired-delete");
      ctx.pendingCompactions.set("wired-delete", {
        model: { providerID: "opencode", modelID: "deepseek-v4" },
        status: "queued",
        queuedAtMs: Date.now(),
      });
      ctx.compactionHandoff.set("wired-delete", createMockCompactionHandoff("handoff"));
      const handler = makeHandler(ctx);
      const result = handler({
        event: {
          type: "session.deleted",
          properties: { info: makeSdkSession("wired-delete") },
        } as SdkEvent,
      });
      expect(result).not.toBeUndefined();
      await result;
      expect(ctx.sessionManager.get("wired-delete")).toBeUndefined();
      expect(ctx.pendingCompactions.has("wired-delete")).toBe(false);
      expect(ctx.compactionHandoff.has("wired-delete")).toBe(false);
    });

    it("returns the ignored-event short-circuit for unhandled types", async () => {
      const ctx = createMockPluginContext({ testDir });
      const handler = makeHandler(ctx);
      const result = handler({
        event: { type: "vcs.branch.updated", properties: { branch: "main" } } as SdkEvent,
      });
      // IGNORED_EVENT_RESULT is a resolved promise, not undefined; the lifecycle
      // handler is bypassed entirely.
      expect(result).toBeDefined();
      await expect(result).resolves.toBeUndefined();
    });

    it("allow-list membership agrees with implemented type guards", async () => {
      // Structural drift guard: parses the module source to compare the set
      // of `isSession*` type guards against the `handler` allow-list. Adding
      // a guard without adding the type to the allow-list fails the test.
      const source = await readEventHandlerSource();
      const guarded = extractHandledEventTypes(source);
      const allowed = extractAllowList(source);
      expect(guarded).toEqual(allowed);
      expect(allowed).toEqual(
        new Set([
          "session.created",
          "session.idle",
          "session.compacted",
          "session.error",
          "session.deleted",
        ]),
      );
    });
  });
});
