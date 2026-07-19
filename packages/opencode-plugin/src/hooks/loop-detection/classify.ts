/**
 * Two-tier loop classifier for the loop-detection engine.
 *
 * Pure function: no side effects, no I/O, no mutation of the provided history.
 */

import type { LoopTracker } from "./tracker.js";
import type { Entry, LoopDetectionConfig } from "./types.js";

export interface ClassificationResult {
  tier: "none" | "tier1" | "tier2";
  tool?: string;
  argsSignature?: string;
  repeatCount?: number;
}

/**
 * Classify a tool-call history according to the configured thresholds.
 *
 * Tier 1: the last `tier1Threshold` entries are strictly consecutive and share
 * the same tool + normalized args hash + output hash.
 *
 * Tier 2: at least `tier2Threshold` of the last `windowSize` entries share the
 * same tool + normalized args hash (input-only match). Tier 1 takes precedence,
 * so tier 2 is only evaluated when tier 1 does not fire.
 */
export function classify(
  history: readonly Entry[],
  config: Required<LoopDetectionConfig>,
): ClassificationResult {
  if (history.length === 0) {
    return { tier: "none" };
  }

  const tier1 = classifyTier1(history, config.tier1Threshold);
  if (tier1.tier !== "none") {
    return tier1;
  }

  return classifyTier2(history, config.windowSize, config.tier2Threshold);
}

function signatureOf(entry: Entry): string {
  return `${entry.tool}:${entry.normalizedArgsHash}:${entry.outputHash}`;
}

function inputSignatureOf(entry: Entry): string {
  return `${entry.tool}:${entry.normalizedArgsHash}`;
}

function classifyTier1(history: readonly Entry[], threshold: number): ClassificationResult {
  if (threshold <= 0 || history.length < threshold) {
    return { tier: "none" };
  }

  const window = history.slice(-threshold);
  const first = window[0];
  if (!first) {
    return { tier: "none" };
  }

  const target = signatureOf(first);
  const allMatch = window.every((entry) => signatureOf(entry) === target);

  if (!allMatch) {
    return { tier: "none" };
  }

  return {
    tier: "tier1",
    tool: first.tool,
    argsSignature: first.normalizedArgsHash,
    repeatCount: threshold,
  };
}

function classifyTier2(
  history: readonly Entry[],
  windowSize: number,
  threshold: number,
): ClassificationResult {
  if (windowSize <= 0 || threshold <= 0 || history.length === 0) {
    return { tier: "none" };
  }

  const window = history.slice(-windowSize);
  const counts = new Map<string, { tool: string; argsSignature: string; count: number }>();

  for (const entry of window) {
    const key = inputSignatureOf(entry);
    const existing = counts.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      counts.set(key, {
        tool: entry.tool,
        argsSignature: entry.normalizedArgsHash,
        count: 1,
      });
    }
  }

  for (const [_, { tool, argsSignature, count }] of counts) {
    if (count >= threshold) {
      return {
        tier: "tier2",
        tool,
        argsSignature,
        repeatCount: count,
      };
    }
  }

  return { tier: "none" };
}

/**
 * Reset a tracker signature so the same loop can be re-detected later.
 *
 * For tier 1 results this clears all entries matching the offending tool +
 * args hash from the given session. Other results are no-ops because no
 * signature has been flagged.
 */
export function resetSignature(
  tracker: LoopTracker,
  sessionID: string,
  result: ClassificationResult,
): void {
  if (result.tier !== "tier1" || !result.tool || !result.argsSignature) {
    return;
  }

  tracker.clearSignature(sessionID, result.tool, result.argsSignature);
}
