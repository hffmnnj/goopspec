/**
 * Idle-prompt triage hook — captures substantive idle prompts on
 * `chat.message`, runs live classifiers, and injects `<goopspec_triage>`
 * via `experimental.chat.system.transform`.
 *
 * Seam choice: a dedicated dual-event factory (not an expansion of
 * `system-transform.ts`). System-transform never receives the user prompt and
 * already owns a single `<goopspec_state>` block plus a 30s memory cache;
 * chat.message sees the prompt but must not mutate the message flow. The
 * session-scoped `pendingIdleTriages` map is the same handoff pattern as
 * lazy-autopilot nudge. Registered only in `DEFAULT_HOOK_FACTORIES` so V2
 * adapters pick it up without editing hooks-v2.
 *
 * @module hooks/idle-triage
 */

import type { SdkPart } from "../../core/sdk-compat.js";
import type { PluginContext } from "../../core/types.js";
import {
  buildTriageBlock,
  isSubstantivePrompt,
  runIdleTriage,
  toPendingIdleTriage,
} from "../../features/idle-triage/index.js";
import { log, logError } from "../../shared/logger.js";
import { extractTextFromParts } from "../chat-message.js";
import type { HookFactory, Hooks } from "../types.js";
import { safeHandler } from "../utils.js";

export interface IdleTriageChatInput {
  sessionID: string;
}

export interface IdleTriageChatOutput {
  parts: SdkPart[];
}

/**
 * Capture triage on chat.message when the active workflow is idle and the
 * prompt is substantive. Failures are logged and swallowed — triage must
 * never block a turn.
 */
export function captureIdleTriage(ctx: PluginContext, sessionID: string, prompt: string): boolean {
  try {
    if (!sessionID) return false;
    if (!isSubstantivePrompt(prompt)) return false;

    const workflow = ctx.stateManager.getActiveWorkflow();
    if (workflow.phase !== "idle") return false;

    const result = runIdleTriage(prompt);
    ctx.pendingIdleTriages.set(sessionID, toPendingIdleTriage(result));
    log("idle-triage: captured", {
      sessionID,
      intent: result.intent,
      recommendedEffort: result.recommendedEffort,
      confidence: result.confidence,
    });
    return true;
  } catch (error) {
    logError("idle-triage: capture failed", error);
    return false;
  }
}

/**
 * Consume a pending triage and push `<goopspec_triage>` onto output.system.
 * Read-then-delete so a missed turn does not replay stale recommendations.
 */
export function injectPendingIdleTriage(
  ctx: PluginContext,
  sessionID: string | undefined,
  output: { system: string[] },
): boolean {
  try {
    if (typeof sessionID !== "string" || !sessionID) return false;
    const pending = ctx.pendingIdleTriages.get(sessionID);
    if (!pending) return false;

    ctx.pendingIdleTriages.delete(sessionID);
    output.system.push(buildTriageBlock(pending));
    log("idle-triage: injected", { sessionID, intent: pending.intent });
    return true;
  } catch (error) {
    logError("idle-triage: inject failed", error);
    if (typeof sessionID === "string") {
      ctx.pendingIdleTriages.delete(sessionID);
    }
    return false;
  }
}

export function createIdleTriageHook(ctx: PluginContext): Partial<Hooks> {
  const onChatMessage = safeHandler(
    "idle-triage:chat-message",
    async (input: IdleTriageChatInput, output: IdleTriageChatOutput): Promise<void> => {
      const text = extractTextFromParts(output.parts);
      if (!text.trim()) return;
      captureIdleTriage(ctx, input.sessionID, text);
    },
  );

  const onSystemTransform = safeHandler(
    "idle-triage:system-transform",
    async (input: { sessionID?: string }, output: { system: string[] }): Promise<void> => {
      injectPendingIdleTriage(ctx, input.sessionID, output);
    },
  );

  return {
    "chat.message": onChatMessage,
    "experimental.chat.system.transform": onSystemTransform,
  };
}

export const idleTriageHookFactory: HookFactory = createIdleTriageHook;
