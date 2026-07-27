/**
 * Lazy autopilot nudge suppression guards.
 *
 * ONE auditable module that decides when the nudge must NOT fire.
 * Returns a discriminated suppression reason so a reviewer can answer
 * "why didn't it nudge" from a single file read.
 *
 * All guards evaluate BEFORE any SDK call.
 */

import type { WorkflowPhase } from "../../core/constants.js";
import { getLivePendingCompaction } from "../../core/pending-compaction.js";
import type { PluginContext } from "../../core/types.js";

// ---------------------------------------------------------------------------
// G8 seam — consumed by guard G8, supplied by Task 3.3 rate-limit module.
// Default implementation returns "allowed" so guards.ts is complete
// before the real rate-limiter lands.
// ---------------------------------------------------------------------------

export interface NudgeRateLimitResult {
  readonly allowed: boolean;
  readonly reason?: string;
  /** Set when the cap is reached and the wave's nudges are abandoned. */
  readonly abandoned?: boolean;
  /** User-visible message to surface on abandonment. */
  readonly message?: string;
}

export interface NudgeRateLimitCheck {
  check(ctx: PluginContext, sessionID: string): NudgeRateLimitResult;
}

const DEFAULT_RATE_LIMIT_CHECK: NudgeRateLimitCheck = {
  check: () => ({ allowed: true }),
};

// ---------------------------------------------------------------------------
// Discriminated suppression reason
// ---------------------------------------------------------------------------

export type NudgeSuppressionReason =
  | { readonly kind: "lazy-autopilot-disabled" }
  | { readonly kind: "wrong-phase"; readonly phase: WorkflowPhase | "unknown" }
  | { readonly kind: "pending-compaction"; readonly status: "queued" | "in-flight" }
  | { readonly kind: "awaiting-acceptance" }
  | { readonly kind: "high-severity-blocker"; readonly blockerId: number }
  | { readonly kind: "hard-stop-question"; readonly category: "credentials" | "destructive" }
  | { readonly kind: "mid-work"; readonly lastRole: string | "unknown" }
  | { readonly kind: "rate-limited"; readonly detail: string }
  | { readonly kind: "kill-switch-off" };

export interface NudgeGuardResult {
  readonly suppressed: boolean;
  readonly reason: NudgeSuppressionReason | null;
}

export const ALLOWED: NudgeGuardResult = { suppressed: false, reason: null };

function suppress(reason: NudgeSuppressionReason): NudgeGuardResult {
  return { suppressed: true, reason };
}

// ---------------------------------------------------------------------------
// Guard inputs
// ---------------------------------------------------------------------------

export interface NudgeGuardInput {
  readonly sessionID: string;
  readonly workflowId: string;
  readonly phase: WorkflowPhase;
  readonly lazyAutopilot: boolean;
  readonly acceptanceConfirmed: boolean;
  readonly lastMessages?: unknown;
  readonly lastAssistantText?: string;
  readonly rateLimitCheck?: NudgeRateLimitCheck;
  readonly killSwitch?: boolean;
}

// ---------------------------------------------------------------------------
// Helper: extract the last message role from an SDK messages response.
// ---------------------------------------------------------------------------

export function lastMessageRole(messages: unknown): string | undefined {
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

// ---------------------------------------------------------------------------
// Hard-stop classification (G6)
// ---------------------------------------------------------------------------

const CREDENTIALS_PATTERN =
  /\b(credential|secret|password|token|api[_\s-]?key|private[_\s-]?key|auth)\b/i;

const DESTRUCTIVE_PATTERN =
  /\b(delete|remove|drop|wipe|destroy|rm\s+-rf|format|overwrite|irreversible|cannot be undone|permanent)\b/i;

function isHardStop(text: string | undefined): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  return CREDENTIALS_PATTERN.test(lower) || DESTRUCTIVE_PATTERN.test(lower);
}

function buildHardStopReason(text: string | undefined): NudgeSuppressionReason {
  const category = (() => {
    if (!text) return "credentials";
    const lower = text.toLowerCase();
    if (DESTRUCTIVE_PATTERN.test(lower)) return "destructive";
    return "credentials";
  })();
  return { kind: "hard-stop-question", category };
}

// ---------------------------------------------------------------------------
// Guard evaluation
// ---------------------------------------------------------------------------

export function evaluateNudgeGuards(ctx: PluginContext, input: NudgeGuardInput): NudgeGuardResult {
  if (input.lazyAutopilot !== true) {
    return suppress({ kind: "lazy-autopilot-disabled" });
  }

  if (input.phase !== "execute") {
    return suppress({ kind: "wrong-phase", phase: input.phase });
  }

  const liveCompaction = getLivePendingCompaction(ctx, input.sessionID);
  if (liveCompaction != null) {
    return suppress({
      kind: "pending-compaction",
      status: liveCompaction.status,
    });
  }

  if (input.acceptanceConfirmed !== true) {
    return suppress({ kind: "awaiting-acceptance" });
  }

  const openBlockers = ctx.db.getBlockers(input.workflowId, "open");
  const highBlocker = openBlockers.find((b) => b.severity === "high" || b.severity === "critical");
  if (highBlocker != null) {
    return suppress({ kind: "high-severity-blocker", blockerId: highBlocker.id });
  }

  if (isHardStop(input.lastAssistantText)) {
    return suppress(buildHardStopReason(input.lastAssistantText));
  }

  const lastRole = lastMessageRole(input.lastMessages);
  if (lastRole !== "assistant") {
    return suppress({ kind: "mid-work", lastRole: lastRole ?? "unknown" });
  }

  const rateLimit = (input.rateLimitCheck ?? DEFAULT_RATE_LIMIT_CHECK).check(ctx, input.sessionID);
  if (!rateLimit.allowed) {
    return suppress({
      kind: "rate-limited",
      detail: rateLimit.reason ?? "rate-limit check denied nudge",
    });
  }

  if (input.killSwitch === false) {
    return suppress({ kind: "kill-switch-off" });
  }

  return ALLOWED;
}
