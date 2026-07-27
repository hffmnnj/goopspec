/**
 * Event Handler Hook — Session Lifecycle Events
 *
 * Listens to the SDK `event` hook and dispatches session lifecycle events
 * to the SessionManager:
 *
 * - `session.created`   → registers the session
 * - `session.idle`      → marks the session idle and dispatches queued compaction
 * - `session.compacted` → clears pending compaction state for the session
 * - `session.error`     → clears pending compaction state for the failed session
 * - `session.deleted`   → cleans up the session and its compaction state
 *
 * All other event types are silently ignored. Never throws — wrapped
 * with `safeHandler` for graceful degradation.
 */

import type { SdkEvent } from "../core/sdk-compat.js";
import type { PluginContext } from "../core/types.js";
import { dispatchPendingCompaction } from "../tools/goop-compact/index.js";
import type { HookFactory, Hooks } from "./types.js";
import { safeHandler } from "./utils.js";

export const IDLE_COMPACTION_DEFER_MS = 0;
const IGNORED_EVENT_RESULT: Promise<void> = Promise.resolve();

// ---------------------------------------------------------------------------
// Narrow SDK Event union to the session lifecycle members we handle
// ---------------------------------------------------------------------------

type SessionCreatedEvent = Extract<SdkEvent, { type: "session.created" }>;
type SessionIdleEvent = Extract<SdkEvent, { type: "session.idle" }>;
type SessionCompactedEvent = Extract<SdkEvent, { type: "session.compacted" }>;
type SessionErrorEvent = Extract<SdkEvent, { type: "session.error" }>;
type SessionDeletedEvent = Extract<SdkEvent, { type: "session.deleted" }>;

function isSessionCreated(event: SdkEvent): event is SessionCreatedEvent {
  return event.type === "session.created";
}

function isSessionIdle(event: SdkEvent): event is SessionIdleEvent {
  return event.type === "session.idle";
}

function isSessionCompacted(event: SdkEvent): event is SessionCompactedEvent {
  return event.type === "session.compacted";
}

function isSessionError(event: SdkEvent): event is SessionErrorEvent {
  return event.type === "session.error";
}

function isSessionDeleted(event: SdkEvent): event is SessionDeletedEvent {
  return event.type === "session.deleted";
}

// ---------------------------------------------------------------------------
// Compaction state cleanup
// ---------------------------------------------------------------------------

function clearCompactionState(ctx: PluginContext, sessionID: string): void {
  ctx.pendingCompactions.delete(sessionID);
  ctx.compactionHandoff.delete(sessionID);
}

// ---------------------------------------------------------------------------
// Hook factory
// ---------------------------------------------------------------------------

export const createEventHandlerHook: HookFactory = (ctx: PluginContext): Partial<Hooks> => {
  const lifecycleHandler: NonNullable<Hooks["event"]> = safeHandler(
    "event-handler",
    async (input) => {
      const event = input.event;

      if (!event || typeof event.type !== "string") return;

      if (isSessionCreated(event)) {
        ctx.sessionManager.create(event.properties.info.id);
        return;
      }

      if (isSessionIdle(event)) {
        const sessionId = event.properties.sessionID;
        if (ctx.sessionManager.get(sessionId)) {
          ctx.sessionManager.markIdle(sessionId);
        }
        // Defer to a fresh macrotask: OpenCode 1.15.3 fires event handlers without
        // awaiting them and the SDK client is an in-process fetch. Calling summarize
        // synchronously here causes in-process fetch reentrancy that stalls the
        // request before it reaches the summarize route. Returning from the callback
        // first, then dispatching on a fresh macrotask, avoids the reentrancy.
        setTimeout(() => dispatchPendingCompaction(ctx, sessionId), IDLE_COMPACTION_DEFER_MS);
        return;
      }

      if (isSessionCompacted(event)) {
        clearCompactionState(ctx, event.properties.sessionID);
        ctx.stateManager.invalidate();
        return;
      }

      if (isSessionError(event)) {
        const sessionID = event.properties?.sessionID;
        if (typeof sessionID === "string" && sessionID.length > 0) {
          clearCompactionState(ctx, sessionID);
        }
        return;
      }

      if (isSessionDeleted(event)) {
        const sessionID = event.properties.info.id;
        ctx.sessionManager.delete(sessionID);
        clearCompactionState(ctx, sessionID);
        return;
      }

      // All other event types: silently ignored
    },
  );

  const handler: NonNullable<Hooks["event"]> = (input) => {
    const eventType = input.event?.type;
    if (
      eventType !== "session.created" &&
      eventType !== "session.idle" &&
      eventType !== "session.compacted" &&
      eventType !== "session.error" &&
      eventType !== "session.deleted"
    ) {
      return IGNORED_EVENT_RESULT;
    }

    return lifecycleHandler(input);
  };

  return {
    event: handler,
  };
};
