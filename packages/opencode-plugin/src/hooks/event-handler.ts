/**
 * Event Handler Hook — Session Lifecycle Events
 *
 * Listens to the SDK `event` hook and dispatches session lifecycle events
 * to the SessionManager:
 *
 * - `session.created`  → registers the session
 * - `session.idle`     → marks the session idle
 * - `session.deleted`  → cleans up the session
 *
 * All other event types are silently ignored. Never throws — wrapped
 * with `safeHandler` for graceful degradation.
 */

import type { SdkEvent } from "../core/sdk-compat.js";
import type { PluginContext } from "../core/types.js";
import { dispatchPendingCompaction } from "../tools/goop-compact/index.js";
import type { HookFactory, Hooks } from "./types.js";
import { safeHandler } from "./utils.js";

// ---------------------------------------------------------------------------
// Narrow SDK Event union to the session lifecycle members we handle
// ---------------------------------------------------------------------------

type SessionCreatedEvent = Extract<SdkEvent, { type: "session.created" }>;
type SessionIdleEvent = Extract<SdkEvent, { type: "session.idle" }>;
type SessionDeletedEvent = Extract<SdkEvent, { type: "session.deleted" }>;

function isSessionCreated(event: SdkEvent): event is SessionCreatedEvent {
  return event.type === "session.created";
}

function isSessionIdle(event: SdkEvent): event is SessionIdleEvent {
  return event.type === "session.idle";
}

function isSessionDeleted(event: SdkEvent): event is SessionDeletedEvent {
  return event.type === "session.deleted";
}

// ---------------------------------------------------------------------------
// Hook factory
// ---------------------------------------------------------------------------

export const createEventHandlerHook: HookFactory = (ctx: PluginContext): Partial<Hooks> => {
  const handler: NonNullable<Hooks["event"]> = async (input) => {
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
      dispatchPendingCompaction(ctx, sessionId);
      return;
    }

    if (isSessionDeleted(event)) {
      ctx.sessionManager.delete(event.properties.info.id);
      return;
    }

    // All other event types: silently ignored
  };

  return {
    event: safeHandler("event-handler", handler),
  };
};
