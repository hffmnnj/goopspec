/**
 * Lazy autopilot nudge rate limiting, abandonment, and observability.
 *
 * Models the session-scoped counter/cooldown shape used by loop-detection:
 * a module-level Map keyed by sessionID, with a factory returning the
 * NudgeRateLimitCheck seam consumed by guard G8.
 */

import type { PluginContext } from "../../core/types.js";
import type { WorkflowState } from "../../core/types.js";
import type { GoopConfig } from "../../features/setup/index.js";
import { log, logError } from "../../shared/logger.js";
import type { NudgeRateLimitCheck, NudgeRateLimitResult } from "./guards.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** User-overridable lazy-autopilot nudge settings. */
export interface LazyAutopilotNudgeConfig {
  enabled?: boolean;
  cap?: number;
  cooldownMs?: number;
}

/** Effective, fully-resolved settings with defaults applied. */
export interface ResolvedLazyAutopilotNudgeConfig {
  readonly enabled: boolean;
  readonly cap: number;
  readonly cooldownMs: number;
}

const DEFAULT_NUDGE_CONFIG: ResolvedLazyAutopilotNudgeConfig = {
  enabled: true,
  cap: 5,
  cooldownMs: 30_000,
};

/**
 * Resolve effective lazy-autopilot nudge config, filling any missing or
 * invalid field from the built-in default.
 */
export function resolveLazyAutopilotNudgeConfig(
  config: GoopConfig,
): ResolvedLazyAutopilotNudgeConfig {
  return {
    enabled: config.lazyAutopilotNudge?.enabled ?? DEFAULT_NUDGE_CONFIG.enabled,
    cap: config.lazyAutopilotNudge?.cap ?? DEFAULT_NUDGE_CONFIG.cap,
    cooldownMs: config.lazyAutopilotNudge?.cooldownMs ?? DEFAULT_NUDGE_CONFIG.cooldownMs,
  };
}

/** Canonical user-visible abandonment message. */
export const LAZY_AUTOPILOT_NUDGE_ABANDONMENT_TEXT =
  "Autonomous continuation stopped: the session received multiple lazy-autopilot nudges without making progress. The loop was broken deliberately to avoid repeated interruptions; continue manually when you are ready.";

/**
 * Three failed requests distinguish a transient host error from a persistent
 * incompatibility while keeping autonomous retries bounded.
 */
export const MAX_CONSECUTIVE_NUDGE_DISPATCH_FAILURES = 3;

// ---------------------------------------------------------------------------
// Per-session state
// ---------------------------------------------------------------------------

interface SessionRateState {
  count: number;
  consecutiveDispatchFailures: number;
  lastNudgeMs: number;
  fingerprint: string;
  abandoned: boolean;
}

const sessions = new Map<string, SessionRateState>();

/** Remove all rate-limit state for a session. Called on lifecycle cleanup. */
export function clearNudgeRateLimitState(sessionID: string): void {
  sessions.delete(sessionID);
}

/** Test-only: reset the module-level state. */
export function __clearNudgeRateLimitState(): void {
  sessions.clear();
}

/** Test-only: inspect the module-level state for a session. */
export function __getNudgeRateLimitState(
  sessionID: string,
): Readonly<SessionRateState> | undefined {
  return sessions.get(sessionID);
}

// ---------------------------------------------------------------------------
// Progress fingerprint
// ---------------------------------------------------------------------------

/**
 * Build a progress fingerprint for the active workflow.
 *
 * Exact composition: `<phase>|<currentWave>|<task-status-digest>|v:<verification-digest>`.
 *
 * - The task-status digest is a comma-separated list of `task_index:status`
 *   for every task in the current wave, ordered by task_index. If no wave
 *   row or tasks exist, the digest is `none`.
 * - The verification digest is a comma-separated list of
 *   `check_name:status` rows attached to the current wave, ordered by row
 *   id ascending so the order in which rows were inserted is preserved.
 *   If no wave row or no verification rows exist, the digest is `none`.
 *
 * The verification digest matters because a wave-verifier turn can record
 * evidence without changing any task status — without it, that turn would
 * look identical to a no-op idle and the consecutive counter would not
 * reset, eventually abandoning the session despite real forward motion.
 *
 * The consecutive counter resets only when this fingerprint changes, so
 * idle -> nudge -> idle with no real progress counts as a repeat, not a
 * fresh start.
 */
export function buildNudgeFingerprint(
  ctx: PluginContext,
  workflowId: string,
  workflow: WorkflowState,
): string {
  const phase = workflow.phase;
  const currentWave = workflow.currentWave;
  const waveRow = ctx.db.getWave(workflowId, currentWave);

  let taskDigest = "none";
  let verificationDigest = "none";
  if (waveRow != null) {
    const tasks = ctx.db.getWaveTasks(waveRow.id);
    if (tasks.length > 0) {
      taskDigest = tasks
        .slice()
        .sort((a, b) => a.task_index - b.task_index)
        .map((t) => `${t.task_index}:${t.status}`)
        .join(",");
    }

    // Order by id ascending so the digest captures insertion order, which
    // is the auditable record of how verification evidence accumulated.
    // getVerifications returns rows newest-first (created_at DESC, id DESC),
    // so reverse to get insertion order.
    const verifications = ctx.db.getVerifications(workflowId, waveRow.id);
    if (verifications.length > 0) {
      verificationDigest = verifications
        .slice()
        .reverse()
        .map((v) => `${v.check_name}:${v.status}`)
        .join(",");
    }
  }

  return `${phase}|${currentWave}|${taskDigest}|v:${verificationDigest}`;
}

// ---------------------------------------------------------------------------
// Observability — chronicle + ADL, failures swallowed
// ---------------------------------------------------------------------------

function appendNudgeAuditTrail(
  ctx: PluginContext,
  workflowId: string,
  sessionID: string,
  consecutiveCount: number,
  event: "fired" | "abandoned",
): void {
  const timestamp = new Date().toISOString();
  const summary =
    event === "fired"
      ? `Lazy autopilot nudge fired for session ${sessionID} (consecutive count: ${consecutiveCount}).`
      : `Lazy autopilot nudge abandoned for session ${sessionID} after ${consecutiveCount} consecutive nudges without progress.`;

  try {
    ctx.db.appendChronicleEvent(workflowId, summary);
  } catch (error: unknown) {
    logError("Failed to append lazy-autopilot nudge chronicle event", error);
  }

  try {
    ctx.db.appendDocument(workflowId, "chronicle", `### ${timestamp}\n\n${summary}`);
  } catch (error: unknown) {
    logError("Failed to append lazy-autopilot nudge chronicle document", error);
  }

  try {
    ctx.stateManager.appendADL({
      timestamp,
      type: "observation",
      description: summary,
      action:
        event === "fired"
          ? "Dispatched lazy-autopilot nudge to continue autonomous execution."
          : "Stopped autonomous continuation to break the nudge-idle loop.",
      files: ["src/hooks/lazy-autopilot-nudge/rate-limit.ts"],
    });
  } catch (error: unknown) {
    logError("Failed to append lazy-autopilot nudge ADL entry", error);
  }
}

// ---------------------------------------------------------------------------
// Rate-limit check factory
// ---------------------------------------------------------------------------

/**
 * Create the G8 rate-limit check backed by session-scoped state.
 *
 * The check is synchronous and may mutate per-session state. It records
 * abandonment audit entries when the cap is reached, but it does not itself
 * perform SDK calls — the caller surfaces the abandonment message.
 */
export function createNudgeRateLimitCheck(
  _ctx: PluginContext,
  config: ResolvedLazyAutopilotNudgeConfig,
): NudgeRateLimitCheck {
  if (!config.enabled) {
    return {
      check(): NudgeRateLimitResult {
        return {
          allowed: false,
          reason: "lazy autopilot nudge disabled via config kill switch",
        };
      },
    };
  }

  return {
    check(checkCtx: PluginContext, sessionID: string): NudgeRateLimitResult {
      const workflowId = checkCtx.stateManager.getActiveWorkflowId();
      const workflow = checkCtx.stateManager.getActiveWorkflow();
      const fingerprint = buildNudgeFingerprint(checkCtx, workflowId, workflow);

      let state = sessions.get(sessionID);
      if (state == null || state.fingerprint !== fingerprint) {
        // Progress changed (or first nudge for this session) — start fresh.
        state = {
          count: 0,
          consecutiveDispatchFailures: 0,
          lastNudgeMs: 0,
          fingerprint,
          abandoned: false,
        };
        sessions.set(sessionID, state);
      }

      if (state.abandoned) {
        return {
          allowed: false,
          reason: "autonomous continuation abandoned for this wave",
        };
      }

      if (state.consecutiveDispatchFailures >= MAX_CONSECUTIVE_NUDGE_DISPATCH_FAILURES) {
        return {
          allowed: false,
          reason: `reached ${MAX_CONSECUTIVE_NUDGE_DISPATCH_FAILURES} consecutive promptAsync failures`,
          consecutiveDispatchFailures: state.consecutiveDispatchFailures,
          maxConsecutiveDispatchFailures: MAX_CONSECUTIVE_NUDGE_DISPATCH_FAILURES,
        };
      }

      const now = Date.now();
      const sinceLast = now - state.lastNudgeMs;
      if (state.count > 0 && sinceLast < config.cooldownMs) {
        return {
          allowed: false,
          reason: `cooldown active (${sinceLast}ms since last nudge, ${config.cooldownMs}ms required)`,
        };
      }

      if (state.count >= config.cap) {
        state.abandoned = true;
        const reason = `reached ${config.cap} consecutive nudges without progress`;
        logError("Lazy autopilot abandoned", {
          sessionID,
          workflowId,
          consecutiveCount: state.count,
          reason,
        });
        appendNudgeAuditTrail(checkCtx, workflowId, sessionID, state.count, "abandoned");
        return {
          allowed: false,
          reason,
          abandoned: true,
          message: LAZY_AUTOPILOT_NUDGE_ABANDONMENT_TEXT,
        };
      }

      return { allowed: true };
    },
  };
}

/**
 * Record that a nudge was actually dispatched for a session. Increments the
 * consecutive counter, updates the timestamp, logs, and writes the audit trail.
 * Failures in the audit path are swallowed.
 */
export function recordNudge(ctx: PluginContext, sessionID: string, workflowId: string): void {
  const state = sessions.get(sessionID);
  if (state == null) return;

  state.count += 1;
  state.lastNudgeMs = Date.now();

  log("Lazy autopilot nudge fired", {
    sessionID,
    workflowId,
    consecutiveCount: state.count,
  });

  appendNudgeAuditTrail(ctx, workflowId, sessionID, state.count, "fired");
}

/** Record a rejected promptAsync request without letting the failure escape the hook. */
export function recordNudgeDispatchFailure(sessionID: string): void {
  const state = sessions.get(sessionID);
  if (state != null) state.consecutiveDispatchFailures += 1;
}

/** Acknowledged requests break the consecutive dispatch-failure sequence. */
export function recordNudgeDispatchSuccess(sessionID: string): void {
  const state = sessions.get(sessionID);
  if (state != null) state.consecutiveDispatchFailures = 0;
}
