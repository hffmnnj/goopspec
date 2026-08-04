/**
 * Idle-prompt triage — pure detection and block formatting.
 *
 * Runs live `detectAutoDelegation`, routing `route`/`classify`, and
 * `detectTaskMode` when a substantive prompt arrives while idle. Recommended
 * effort is advisory only (Wave 4 persists it; Task 3.2 acts on low confidence).
 *
 * @module features/idle-triage
 */

import type { TaskMode } from "../../core/constants.js";
import type { PendingIdleTriage } from "../../core/types.js";
import { detectTaskMode } from "../mode-detection/index.js";
import type { ThinkingLevel } from "../setup/index.js";
import { detectAutoDelegation, route } from "../routing/index.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type RecommendedEffort = ThinkingLevel;

export interface IdleTriageResult {
  readonly intent: string;
  readonly recommendedEffort: RecommendedEffort;
  readonly confidence: number;
  readonly reasoning: string;
  /** Internal diagnostics — not injected into the prompt block. */
  readonly sources: {
    readonly autoDelegationDetected: boolean;
    readonly autoDelegationIntent: "research" | "debug" | undefined;
    readonly routingCategory: string;
    readonly routingAgent: string;
    readonly mode: TaskMode;
    readonly modeConfidence: number;
  };
}

// ---------------------------------------------------------------------------
// Effort mapping — TaskMode → recommended effort label
// ---------------------------------------------------------------------------

/**
 * Map resurrected mode-detection signals onto the canonical five effort
 * labels. Weak/ambiguous signals favour `high` (workflow default).
 *
 * Spec effort values are `low | medium | high | xhigh`; `none` is reserved
 * for the thinking-level catalog and is never recommended from triage.
 */
const MODE_TO_EFFORT: Readonly<Record<TaskMode, RecommendedEffort>> = {
  quick: "low",
  standard: "medium",
  comprehensive: "high",
  milestone: "xhigh",
};

/** Default when mode-detection confidence is too weak to trust. */
const WEAK_SIGNAL_DEFAULT: RecommendedEffort = "high";

/** Mode-confidence below this falls back to the weak-signal default. */
const WEAK_MODE_CONFIDENCE = 0.35;

// ---------------------------------------------------------------------------
// Substantive prompt gate
// ---------------------------------------------------------------------------

/**
 * A prompt is substantive when it is non-empty, not a slash command, and
 * carries enough content or an action/question signal to warrant triage.
 *
 * Slash commands and trivial acknowledgements must not fire triage (A3).
 */
export function isSubstantivePrompt(prompt: string): boolean {
  const text = prompt.trim();
  if (!text) return false;
  if (text.startsWith("/")) return false;
  if (text.length < 10) return false;
  if (text.includes("?")) return true;
  if (text.length > 40) return true;
  return /\b(implement|create|build|fix|debug|refactor|research|investigate|add|design|migrate|upgrade|rewrite|overhaul)\b/i.test(
    text,
  );
}

// ---------------------------------------------------------------------------
// Core triage
// ---------------------------------------------------------------------------

/**
 * Execute live triage classifiers against a user prompt.
 *
 * Always reaches `detectAutoDelegation`, `route` (classifier), and
 * `detectTaskMode`. Intent prefers auto-delegation when detected; otherwise
 * the routing category label. Recommended effort derives from mode-detection
 * with a weak-signal fallback to `high`.
 */
export function runIdleTriage(prompt: string): IdleTriageResult {
  const auto = detectAutoDelegation(prompt);
  const routing = route(prompt);
  const mode = detectTaskMode(prompt);

  const intent = auto.detected
    ? (auto.intent ?? "unknown")
    : routing.category !== "fallback"
      ? routing.category
      : "general";

  const modeEffort = MODE_TO_EFFORT[mode.mode];
  const recommendedEffort =
    mode.confidence < WEAK_MODE_CONFIDENCE ? WEAK_SIGNAL_DEFAULT : modeEffort;

  // Confidence: blend mode-detection with routing when no auto-delegation;
  // auto-delegation is a strong discrete signal — boost when present.
  let confidence: number;
  if (auto.detected) {
    confidence = Math.max(0.75, mode.confidence);
  } else if (routing.category === "fallback") {
    confidence = Math.min(mode.confidence, 0.45);
  } else {
    confidence = Math.max(0, Math.min(1, mode.confidence * 0.55 + routing.confidence * 0.45));
  }

  const reasoningParts: string[] = [];
  if (auto.detected) {
    reasoningParts.push(
      `Auto-delegation detected ${auto.intent} intent (→ goop-${auto.agent})${auto.matchedPattern ? ` via "${auto.matchedPattern}"` : ""}`,
    );
  } else {
    reasoningParts.push(
      routing.category === "fallback"
        ? "No auto-delegation or strong routing match"
        : `Routing classified as ${routing.category} (${routing.agent}${routing.tier ? `/${routing.tier}` : ""})`,
    );
  }

  if (mode.confidence < WEAK_MODE_CONFIDENCE) {
    reasoningParts.push(
      `Mode signals weak (mode=${mode.mode}, conf=${mode.confidence.toFixed(2)}); defaulting recommended effort to ${WEAK_SIGNAL_DEFAULT}`,
    );
  } else {
    reasoningParts.push(
      `Mode detection → ${mode.mode} (conf=${mode.confidence.toFixed(2)}) maps to effort ${recommendedEffort}`,
    );
    if (mode.reasoning.length > 0) {
      reasoningParts.push(`Signals: ${mode.reasoning.slice(0, 3).join("; ")}`);
    }
  }

  return {
    intent,
    recommendedEffort,
    confidence: Math.round(confidence * 100) / 100,
    reasoning: reasoningParts.join(". ") + ".",
    sources: {
      autoDelegationDetected: auto.detected,
      autoDelegationIntent: auto.intent,
      routingCategory: routing.category,
      routingAgent: routing.agent,
      mode: mode.mode,
      modeConfidence: mode.confidence,
    },
  };
}

/**
 * Format a triage result as a `<goopspec_triage>` system block.
 */
export function buildTriageBlock(result: IdleTriageResult | PendingIdleTriage): string {
  return [
    "<goopspec_triage>",
    `intent: ${result.intent}`,
    `recommended_effort: ${result.recommendedEffort}`,
    `confidence: ${result.confidence}`,
    `reasoning: ${result.reasoning}`,
    "</goopspec_triage>",
  ].join("\n");
}

/**
 * Convert a triage result into the ephemeral handoff payload.
 */
export function toPendingIdleTriage(result: IdleTriageResult): PendingIdleTriage {
  return {
    intent: result.intent,
    recommendedEffort: result.recommendedEffort,
    confidence: result.confidence,
    reasoning: result.reasoning,
    capturedAtMs: Date.now(),
  };
}
