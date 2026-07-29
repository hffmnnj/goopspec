import type { PluginContext } from "../../core/types.js";
import { loadMergedConfig } from "../../features/setup/index.js";
import { log, logError } from "../../shared/logger.js";
import type { HookFactory, Hooks } from "../types.js";
import { safeHandler } from "../utils.js";
import {
  type NudgeGuardInput,
  evaluateNudgeGuards,
  lastAssistantMessageText,
  lastMessageRole,
} from "./guards.js";
import {
  clearNudgeRateLimitState,
  createNudgeRateLimitCheck,
  recordNudge,
  resolveLazyAutopilotNudgeConfig,
} from "./rate-limit.js";

export const LAZY_AUTOPILOT_NUDGE_TEXT =
  "LAZY AUTOPILOT ENGAGED - Do not pause unless you 100% cannot move forward without something from the user. Use your best judgement and continue.";

let didLogPromptAsyncUnavailable = false;

function logPromptAsyncUnavailable(): void {
  if (didLogPromptAsyncUnavailable) return;
  didLogPromptAsyncUnavailable = true;
  logError("Lazy autopilot nudge is best-effort: session.promptAsync is unavailable on this host");
}

function clearNudge(ctx: PluginContext, sessionID: string): void {
  ctx.pendingLazyAutopilotNudges.delete(sessionID);
}

/**
 * Sends the lazy-autopilot user nudge after session.idle has fully returned.
 * The map is a single-dispatch gate until promptAsync acknowledges the request;
 * subsequent idle events are bounded by the rate limiter.
 */
export async function dispatchLazyAutopilotNudge(
  ctx: PluginContext,
  sessionID: string,
): Promise<void> {
  if (!sessionID || ctx.pendingLazyAutopilotNudges.has(sessionID)) return;

  const nudgeConfig = resolveLazyAutopilotNudgeConfig(loadMergedConfig(ctx.sdk.directory));
  if (!nudgeConfig.enabled) return;

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

    const workflow = ctx.stateManager.getActiveWorkflow();
    const guardInput: NudgeGuardInput = {
      sessionID,
      workflowId: ctx.stateManager.getActiveWorkflowId(),
      phase: workflow.phase,
      lazyAutopilot: workflow.lazyAutopilot,
      acceptanceConfirmed: workflow.acceptanceConfirmed,
      lastMessages: response,
      lastAssistantText: lastAssistantMessageText(response),
      rateLimitCheck: createNudgeRateLimitCheck(ctx, nudgeConfig),
      killSwitch: true,
    };

    const guardResult = evaluateNudgeGuards(ctx, guardInput);
    if (guardResult.suppressed) {
      log("Lazy autopilot nudge suppressed", {
        sessionID,
        reason: guardResult.reason,
      });
      clearNudge(ctx, sessionID);
      return;
    }

    const livePending = ctx.pendingLazyAutopilotNudges.get(sessionID);
    if (!livePending || livePending.status !== "queued" || livePending.source !== "prompt-async") {
      return;
    }

    // Transition before promptAsync: concurrent idle events cannot both send.
    livePending.status = "in-flight";
    const workflowId = ctx.stateManager.getActiveWorkflowId();
    recordNudge(ctx, sessionID, workflowId);

    const request = session.promptAsync({
      path: { id: sessionID },
      body: { parts: [{ type: "text", text: LAZY_AUTOPILOT_NUDGE_TEXT }] },
    });
    // Keep in-flight until the request is acknowledged so concurrent idle events
    // cannot both send. Once acknowledged, G8's cooldown rejects duplicate idle
    // events for this injected turn and permits genuinely later attempts.
    void Promise.resolve(request).then(
      () => clearNudge(ctx, sessionID),
      (error: unknown) => {
        clearNudge(ctx, sessionID);
        logError("Lazy autopilot nudge request failed", error);
      },
    );
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

/** Exported for event-handler lifecycle cleanup (MH8). */
export { clearNudgeRateLimitState };
