/**
 * Lazy autopilot nudge suppression guards.
 *
 * ONE auditable module that decides when the nudge must NOT fire.
 * Returns a discriminated suppression reason so a reviewer can answer
 * "why didn't it nudge" from a single file read.
 *
 * All guards evaluate BEFORE any SDK call.
 */

import { realpathSync } from "node:fs";
import { resolve } from "node:path";

import type { WorkflowPhase } from "../../core/constants.js";
import { getLivePendingCompaction } from "../../core/pending-compaction.js";
import type { PluginContext } from "../../core/types.js";
import { isOrchestrator } from "../utils.js";

// ---------------------------------------------------------------------------
// G8 seam — consumed by guard G8, supplied by Task 3.3 rate-limit module.
// Default implementation returns "allowed" so guards.ts is complete
// before the real rate-limiter lands.
// ---------------------------------------------------------------------------

export interface NudgeRateLimitResult {
  readonly allowed: boolean;
  readonly reason?: string;
  /** Set when repeated promptAsync rejections suppress this session. */
  readonly consecutiveDispatchFailures?: number;
  /** The dispatch-failure threshold that triggered suppression. */
  readonly maxConsecutiveDispatchFailures?: number;
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
  | {
      readonly kind: "session-not-nudge-eligible";
      readonly reason: "metadata-unavailable" | "subagent";
      readonly detail: string;
    }
  | {
      readonly kind: "agent-not-eligible";
      readonly reason: "unknown" | "not-orchestrator";
      /** Observed agent name for diagnosis; absent when the identity signal was indeterminate. */
      readonly agent?: string;
    }
  | {
      readonly kind: "project-scope-unverified";
      readonly reason: "directory-mismatch" | "sdk-directory-unavailable";
      readonly sessionDirectory: string;
      readonly projectDirectory?: string;
    }
  | { readonly kind: "pending-compaction"; readonly status: "queued" | "in-flight" }
  | { readonly kind: "high-severity-blocker"; readonly blockerId: number }
  | { readonly kind: "hard-stop-question"; readonly category: "credentials" | "destructive" }
  | { readonly kind: "mid-work"; readonly lastRole: string | "unknown" }
  | { readonly kind: "dispatch-failure-cap"; readonly failures: number; readonly cap: number }
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

/**
 * Session metadata fetched alongside messages before guard evaluation.
 *
 * `unavailable` deliberately does not flatten to optional fields: a top-level
 * session legitimately has no parentID, while a failed lookup is indeterminate.
 */
export type NudgeSessionMetadata =
  | {
      readonly status: "available";
      readonly parentID?: string;
      readonly directory: string;
    }
  | {
      readonly status: "unavailable";
      readonly reason: "get-unavailable" | "get-failed" | "invalid-response";
    };

/**
 * Agent identity behind the session's final assistant turn.
 *
 * Mirrors `NudgeSessionMetadata`: an indeterminate identity is a distinct
 * variant, never collapsed into `string | undefined`. Collapsing it would
 * make "we couldn't tell" indistinguishable from "we don't yet have a field
 * for it", and both must fail closed identically but be reportable
 * separately (see `NudgeSuppressionReason`'s `agent-not-eligible` reasons).
 */
export type NudgeAgentIdentity =
  | { readonly status: "known"; readonly agent: string }
  | { readonly status: "unknown" };

export interface NudgeGuardInput {
  readonly sessionID: string;
  readonly session: NudgeSessionMetadata;
  readonly workflowId: string;
  readonly phase: WorkflowPhase;
  readonly lazyAutopilot: boolean;
  /** Workflow state is retained for production-call fidelity; G2 owns phase eligibility. */
  readonly acceptanceConfirmed: boolean;
  /**
   * Optional until Task 2.2 plumbs the signal into `index.ts`'s guardInput.
   * The evaluator treats an absent field identically to `{ status: "unknown" }`
   * — fail closed, never permissive-by-omission.
   */
  readonly agent?: NudgeAgentIdentity;
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

/**
 * Extract the identity of the agent behind the session's final turn.
 *
 * `AssistantMessage.mode` (verified against `@opencode-ai/sdk` 1.18.3,
 * `dist/gen/types.gen.d.ts:98-110`) is a REQUIRED `string` field carrying the
 * agent name (e.g. `"goop-orchestrator"`, `"build"`) and is already present
 * in the exact `{ data: [{ info, parts }] }` / bare-array envelope this hook
 * reads via `lastMessageRole`/`lastAssistantMessageText` — no new SDK call is
 * needed (see Field Note fn_20260802_gdckcep3). Mirrors those helpers' shape
 * tolerance: any unexpected or missing `mode` deliberately returns the
 * indeterminate `NudgeAgentIdentity` variant rather than throwing, so
 * `evaluateNudgeGuards` can fail closed exactly as it does for `unknown`.
 */
export function lastAssistantAgent(messages: unknown): NudgeAgentIdentity {
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
  if (last === null || typeof last !== "object") return { status: "unknown" };

  const mode = (last as { info?: { mode?: unknown } }).info?.mode;
  return typeof mode === "string" && mode.length > 0
    ? { status: "known", agent: mode }
    : { status: "unknown" };
}

/**
 * Extract text parts from the final SDK message without trusting its shape.
 * SessionMessagesResponse entries are `{ info, parts }`; unknown or malformed
 * responses deliberately produce no hard-stop text rather than throwing.
 */
export function lastAssistantMessageText(messages: unknown): string | undefined {
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

  const parts = (last as { parts?: unknown }).parts;
  if (!Array.isArray(parts)) return undefined;

  const text = parts
    .filter(
      (part): part is { type: "text"; text: string } =>
        part !== null &&
        typeof part === "object" &&
        (part as { type?: unknown }).type === "text" &&
        typeof (part as { text?: unknown }).text === "string",
    )
    .map((part) => part.text)
    .join("\n");
  return text || undefined;
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

/**
 * Canonicalize directories before comparing session and plugin scope. Realpath
 * resolves symlink aliases when possible; resolve still normalizes relative
 * paths and trailing separators for paths that no longer exist.
 */
function normalizeDirectory(directory: unknown): string | undefined {
  if (typeof directory !== "string" || directory.length === 0) return undefined;

  const absolute = resolve(directory);
  try {
    return realpathSync.native(absolute);
  } catch {
    return absolute;
  }
}

// ---------------------------------------------------------------------------
// Guard evaluation
// ---------------------------------------------------------------------------

export function evaluateNudgeGuards(ctx: PluginContext, input: NudgeGuardInput): NudgeGuardResult {
  if (input.lazyAutopilot !== true) {
    return suppress({ kind: "lazy-autopilot-disabled" });
  }

  // G2: Execute-only phase eligibility is intentional and retained (SPEC
  // Decision 1, settled under Rule 4). Non-execute phases — idle, discuss,
  // plan, accept — may be waiting on a deliberate user gate; nudging through
  // them would bypass human checkpoints. Phase-gate policy is explicitly out
  // of scope; the D1/D3 defects account for the reported injection failures
  // without widening phase eligibility. Pinned by guards.test.ts.
  if (input.phase !== "execute") {
    return suppress({ kind: "wrong-phase", phase: input.phase });
  }

  // G2a: Session identity takes precedence over later operational guards. A
  // nudge sent to a subagent, or after an indeterminate lookup, is unsafe.
  if (input.session.status === "unavailable") {
    return suppress({
      kind: "session-not-nudge-eligible",
      reason: "metadata-unavailable",
      detail: input.session.reason,
    });
  }
  if (input.session.parentID) {
    return suppress({
      kind: "session-not-nudge-eligible",
      reason: "subagent",
      detail: input.session.parentID,
    });
  }

  // Agent identity guard: force-switching an innocent session's agent (the
  // dispatch body hard-codes agent: 'goop-orchestrator') is worse than a
  // missed nudge, so an indeterminate identity fails closed exactly like a
  // known-wrong one. isOrchestrator() is reused rather than exact-matching
  // 'goop-orchestrator' so the three recognised naming patterns all pass.
  if (input.agent === undefined || input.agent.status === "unknown") {
    return suppress({ kind: "agent-not-eligible", reason: "unknown" });
  }
  if (!isOrchestrator(input.agent.agent)) {
    return suppress({
      kind: "agent-not-eligible",
      reason: "not-orchestrator",
      agent: input.agent.agent,
    });
  }

  // G2b: A session belongs to the project only when canonical directories
  // match. An unavailable plugin directory is indeterminate, so fail closed
  // rather than treating `undefined !== session.directory` as a comparison.
  const sessionDirectory = normalizeDirectory(input.session.directory);
  const projectDirectory = normalizeDirectory((ctx.sdk as { directory?: unknown }).directory);
  if (sessionDirectory === undefined || projectDirectory === undefined) {
    return suppress({
      kind: "project-scope-unverified",
      reason: "sdk-directory-unavailable",
      sessionDirectory: sessionDirectory ?? input.session.directory,
    });
  }
  if (sessionDirectory !== projectDirectory) {
    return suppress({
      kind: "project-scope-unverified",
      reason: "directory-mismatch",
      sessionDirectory,
      projectDirectory,
    });
  }

  const liveCompaction = getLivePendingCompaction(ctx, input.sessionID);
  if (liveCompaction != null) {
    return suppress({
      kind: "pending-compaction",
      status: liveCompaction.status,
    });
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
    if (
      rateLimit.consecutiveDispatchFailures != null &&
      rateLimit.maxConsecutiveDispatchFailures != null
    ) {
      return suppress({
        kind: "dispatch-failure-cap",
        failures: rateLimit.consecutiveDispatchFailures,
        cap: rateLimit.maxConsecutiveDispatchFailures,
      });
    }
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
