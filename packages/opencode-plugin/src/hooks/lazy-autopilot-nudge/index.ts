import type { PluginContext } from "../../core/types.js";
import { logError } from "../../shared/logger.js";
import type { HookFactory, Hooks } from "../types.js";
import { safeHandler } from "../utils.js";

export const LAZY_AUTOPILOT_NUDGE_TEXT =
  "LAZY AUTOPILOT ENGAGED - Do not pause unless you 100% cannot move forward without something from the user. Use your best judgement and continue.";

let didLogPromptAsyncUnavailable = false;

function logPromptAsyncUnavailable(): void {
  if (didLogPromptAsyncUnavailable) return;
  didLogPromptAsyncUnavailable = true;
  logError("Lazy autopilot nudge is best-effort: session.promptAsync is unavailable on this host");
}

function lastMessageRole(messages: unknown): string | undefined {
  const response =
    messages !== null && typeof messages === "object"
      ? (messages as { data?: unknown })
      : undefined;
  const entries = Array.isArray(messages)
    ? messages
    : Array.isArray(response?.data)
      ? response.data
      : undefined;
  const last = entries?.at(-1);
  if (last === null || typeof last !== "object") return undefined;

  const message = last as { role?: unknown; info?: { role?: unknown } };
  const role = message.info?.role ?? message.role;
  return typeof role === "string" ? role : undefined;
}

function clearNudge(ctx: PluginContext, sessionID: string): void {
  ctx.pendingLazyAutopilotNudges.delete(sessionID);
}

/**
 * Sends the lazy-autopilot user nudge after session.idle has fully returned.
 * The map is the single-dispatch gate; SDK failures are observed, never thrown.
 */
export async function dispatchLazyAutopilotNudge(
  ctx: PluginContext,
  sessionID: string,
): Promise<void> {
  if (!sessionID || ctx.pendingLazyAutopilotNudges.has(sessionID)) return;
  ctx.pendingLazyAutopilotNudges.set(sessionID, { status: "queued", source: "prompt-async" });
  const pending = ctx.pendingLazyAutopilotNudges.get(sessionID);
  if (!pending) return;

  const session = ctx.sdk.client?.session;
  if (typeof session?.promptAsync !== "function") {
    pending.source = "system-transform";
    logPromptAsyncUnavailable();
    return;
  }

  if (typeof session.messages !== "function") {
    clearNudge(ctx, sessionID);
    logError("Lazy autopilot nudge skipped: session.messages is unavailable on this host");
    return;
  }

  try {
    const response = await session.messages({ path: { id: sessionID } });
    if (lastMessageRole(response) !== "assistant") {
      clearNudge(ctx, sessionID);
      return;
    }

    const livePending = ctx.pendingLazyAutopilotNudges.get(sessionID);
    if (!livePending || livePending.status !== "queued" || livePending.source !== "prompt-async") {
      return;
    }

    // Transition before promptAsync: concurrent idle events cannot both send.
    livePending.status = "in-flight";
    const request = session.promptAsync({
      path: { id: sessionID },
      body: { parts: [{ type: "text", text: LAZY_AUTOPILOT_NUDGE_TEXT }] },
    });
    // promptAsync acknowledges the request with 204, not turn completion. Keep
    // in-flight state until lifecycle cleanup so duplicate idle events emitted
    // for the injected turn cannot send a second nudge.
    void Promise.resolve(request).catch((error: unknown) => {
      clearNudge(ctx, sessionID);
      logError("Lazy autopilot nudge request failed", error);
    });
  } catch (error) {
    clearNudge(ctx, sessionID);
    logError("Lazy autopilot nudge dispatch failed", error);
  }
}

/** Registers the minimal fallback for hosts without session.promptAsync. */
export const lazyAutopilotNudgeHookFactory: HookFactory = (ctx: PluginContext): Partial<Hooks> => ({
  "experimental.chat.system.transform": safeHandler(
    "lazy-autopilot-nudge-fallback",
    async (input: { sessionID?: string }, output: { system: string[] }): Promise<void> => {
      if (typeof input.sessionID !== "string") return;
      const pending = ctx.pendingLazyAutopilotNudges.get(input.sessionID);
      if (pending?.source !== "system-transform") return;
      ctx.pendingLazyAutopilotNudges.delete(input.sessionID);
      output.system.push(LAZY_AUTOPILOT_NUDGE_TEXT);
    },
  ),
});
