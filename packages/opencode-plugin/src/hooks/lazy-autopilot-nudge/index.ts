import { join } from "node:path";

import type { PluginContext } from "../../core/types.js";
import { loadAgentConfigs } from "../../features/agents/index.js";
import { loadMergedConfig } from "../../features/setup/index.js";
import { log, logError } from "../../shared/logger.js";
import { getPackageRoot } from "../../shared/paths.js";
import type { HookFactory, Hooks } from "../types.js";
import { safeHandler } from "../utils.js";
import {
  type NudgeGuardInput,
  type NudgeSessionMetadata,
  evaluateNudgeGuards,
  lastAssistantAgent,
  lastAssistantMessageText,
  lastMessageRole,
} from "./guards.js";
import {
  clearNudgeRateLimitState,
  createNudgeRateLimitCheck,
  recordNudge,
  recordNudgeDispatchFailure,
  recordNudgeDispatchSuccess,
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

function toNudgeSessionMetadata(response: unknown): NudgeSessionMetadata {
  if (response === null || typeof response !== "object") {
    return { status: "unavailable", reason: "invalid-response" };
  }

  const session = response as { parentID?: unknown; directory?: unknown };
  if (typeof session.directory !== "string") {
    return { status: "unavailable", reason: "invalid-response" };
  }
  if (session.parentID !== undefined && typeof session.parentID !== "string") {
    return { status: "unavailable", reason: "invalid-response" };
  }

  return {
    status: "available",
    directory: session.directory,
    ...(session.parentID === undefined ? {} : { parentID: session.parentID }),
  };
}

function parseModelIdentifier(
  model: string | undefined,
): { providerID: string; modelID: string } | undefined {
  if (!model) return undefined;

  const separatorIndex = model.indexOf("/");
  if (separatorIndex <= 0 || separatorIndex === model.length - 1) return undefined;

  const providerID = model.slice(0, separatorIndex).trim();
  const modelID = model.slice(separatorIndex + 1).trim();
  return providerID && modelID ? { providerID, modelID } : undefined;
}

function resolveOrchestratorModel(
  projectDir: string,
): { providerID: string; modelID: string } | undefined {
  const config = loadMergedConfig(projectDir);
  const configuredModel = config.agentModels?.orchestrator ?? config.defaultModel;
  const frontmatterModel = loadAgentConfigs(join(getPackageRoot(), "agents"))["goop-orchestrator"]
    ?.model;
  return parseModelIdentifier(configuredModel ?? frontmatterModel);
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
  if (!sessionID) return;

  // D3: an unconsumed "system-transform" entry is a stale fallback, not
  // active work, so it must not latch out every later idle forever. Only
  // "prompt-async" sourced entries (mid-fetch "queued" or promptAsync
  // "in-flight") represent dispatch actually in progress and still block a
  // concurrent attempt, preserving the single-dispatch invariant.
  const existingPending = ctx.pendingLazyAutopilotNudges.get(sessionID);
  if (existingPending && existingPending.source !== "system-transform") return;

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

  let promptAsyncStarted = false;
  try {
    const messagesRequest = Promise.resolve().then(() =>
      session.messages({ path: { id: sessionID } }),
    );
    const sessionRequest =
      typeof session.get === "function"
        ? Promise.resolve().then(() => session.get({ path: { id: sessionID } }))
        : Promise.reject<NudgeSessionMetadata>(new Error("session.get is unavailable"));
    const [messagesResult, sessionResult] = await Promise.allSettled([
      messagesRequest,
      sessionRequest,
    ]);
    if (messagesResult.status === "rejected") throw messagesResult.reason;

    const response = messagesResult.value;
    const sessionMetadata =
      sessionResult.status === "fulfilled"
        ? toNudgeSessionMetadata(sessionResult.value)
        : {
            status: "unavailable" as const,
            reason:
              typeof session.get === "function"
                ? ("get-failed" as const)
                : ("get-unavailable" as const),
          };
    if (lastMessageRole(response) !== "assistant") {
      clearNudge(ctx, sessionID);
      return;
    }

    const workflow = ctx.stateManager.getActiveWorkflow();
    const guardInput: NudgeGuardInput = {
      sessionID,
      session: sessionMetadata,
      workflowId: ctx.stateManager.getActiveWorkflowId(),
      phase: workflow.phase,
      lazyAutopilot: workflow.lazyAutopilot,
      acceptanceConfirmed: workflow.acceptanceConfirmed,
      agent: lastAssistantAgent(response),
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
    if (livePending !== pending) {
      // Our own slot was replaced or removed while messages/session were
      // being fetched (event-handler session cleanup, or a later idle that
      // legitimately reclaimed a stale fallback per the guard above).
      // Whatever now occupies it belongs to another owner or to nothing --
      // clearing it here would either destroy state we do not own or be a
      // harmless no-op, so leave it alone either way.
      return;
    }
    if (pending.status !== "queued" || pending.source !== "prompt-async") {
      // Defensive: nothing else mutates this exact object in place before
      // this point, so this should be unreachable. Clear it explicitly
      // rather than leaving a malformed entry no later idle would ever
      // re-evaluate.
      clearNudge(ctx, sessionID);
      return;
    }

    // Transition before promptAsync: concurrent idle events cannot both send.
    livePending.status = "in-flight";
    const workflowId = ctx.stateManager.getActiveWorkflowId();
    recordNudge(ctx, sessionID, workflowId);

    const model = resolveOrchestratorModel(ctx.sdk.directory);
    promptAsyncStarted = true;
    const request = session.promptAsync({
      path: { id: sessionID },
      body: {
        agent: "goop-orchestrator",
        ...(model ? { model } : {}),
        parts: [{ type: "text", text: LAZY_AUTOPILOT_NUDGE_TEXT }],
      },
    });
    // Keep in-flight until the request is acknowledged so concurrent idle events
    // cannot both send. Once acknowledged, G8's cooldown rejects duplicate idle
    // events for this injected turn and permits genuinely later attempts.
    void Promise.resolve(request).then(
      () => {
        recordNudgeDispatchSuccess(sessionID);
        clearNudge(ctx, sessionID);
      },
      () => {
        recordNudgeDispatchFailure(sessionID);
        clearNudge(ctx, sessionID);
        log("Lazy autopilot nudge request failed", { sessionID });
      },
    );
  } catch (error) {
    clearNudge(ctx, sessionID);
    if (promptAsyncStarted) {
      recordNudgeDispatchFailure(sessionID);
      log("Lazy autopilot nudge request failed", { sessionID });
      return;
    }
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
