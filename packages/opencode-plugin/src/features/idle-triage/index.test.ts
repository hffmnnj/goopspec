/**
 * Pure-feature tests for the idle-triage confidence threshold (A5).
 *
 * The hook-level reachability of the classifiers is covered in
 * `src/hooks/idle-triage/index.test.ts`. These tests isolate the A5
 * contract: below the threshold the triage block must present its
 * recommendation for confirmation; at or above it the block is
 * byte-identical to the verified high-confidence output.
 */

import { describe, expect, it } from "bun:test";
import {
  LOW_TRIAGE_CONFIDENCE_THRESHOLD,
  buildTriageBlock,
  triageRequiresConfirmation,
  type IdleTriageResult,
} from "./index.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Minimal IdleTriageResult; only `confidence` varies across the A5 cases. */
function resultWith(confidence: number): IdleTriageResult {
  return {
    intent: "general",
    recommendedEffort: "high",
    confidence,
    reasoning: "No auto-delegation or strong routing match.",
    sources: {
      autoDelegationDetected: false,
      autoDelegationIntent: undefined,
      routingCategory: "fallback",
      routingAgent: "explorer",
      mode: "standard",
      modeConfidence: 0.3,
    },
  };
}

/** Parse a `<goopspec_triage>` block into an ordered field map. */
function parseBlock(block: string): Map<string, string> {
  const fields = new Map<string, string>();
  for (const line of block.split("\n")) {
    if (line.startsWith("<") || line.startsWith(">")) continue;
    const idx = line.indexOf(": ");
    if (idx > 0) fields.set(line.slice(0, idx), line.slice(idx + 2));
  }
  return fields;
}

describe("LOW_TRIAGE_CONFIDENCE_THRESHOLD", () => {
  it("is 0.5 — the natural cut between the no-signal band (≤0.45) and the mixed-signal band (>0.5)", () => {
    expect(LOW_TRIAGE_CONFIDENCE_THRESHOLD).toBe(0.5);
  });
});

describe("triageRequiresConfirmation", () => {
  it("returns true strictly below the threshold", () => {
    expect(triageRequiresConfirmation(0)).toBe(true);
    expect(triageRequiresConfirmation(0.45)).toBe(true);
    expect(triageRequiresConfirmation(0.49)).toBe(true);
  });

  it("returns false at the exact boundary (the boundary is trusted)", () => {
    expect(triageRequiresConfirmation(LOW_TRIAGE_CONFIDENCE_THRESHOLD)).toBe(false);
  });

  it("returns false above the threshold, including the auto-delegation band ≥0.75", () => {
    expect(triageRequiresConfirmation(0.51)).toBe(false);
    expect(triageRequiresConfirmation(0.75)).toBe(false);
    expect(triageRequiresConfirmation(1)).toBe(false);
  });
});

describe("buildTriageBlock — A5 confirmation band", () => {
  it("below threshold: adds confirmation_required + guidance and asks rather than acts", () => {
    const block = buildTriageBlock(resultWith(0.3));
    const fields = parseBlock(block);

    expect(fields.get("confirmation_required")).toBe("true");
    const guidance = fields.get("guidance");
    expect(guidance).toBeDefined();
    // Phrasing must direct the orchestrator to ask, not to apply.
    expect(guidance!).toMatch(/confirm/i);
    expect(guidance!).toMatch(/do not auto-apply/i);
    expect(guidance!).toContain(String(LOW_TRIAGE_CONFIDENCE_THRESHOLD));
  });

  it("below threshold: still carries intent, recommended_effort, confidence, and reasoning", () => {
    const block = buildTriageBlock(resultWith(0.2));
    const fields = parseBlock(block);

    expect(fields.get("intent")).toBe("general");
    expect(fields.get("recommended_effort")).toBe("high");
    expect(fields.get("confidence")).toBe("0.2");
    expect(fields.get("reasoning")!.length).toBeGreaterThan(0);
  });

  it("at the exact boundary (0.5): no confirmation fields — boundary is trusted", () => {
    const block = buildTriageBlock(resultWith(0.5));
    const fields = parseBlock(block);

    expect(fields.has("confirmation_required")).toBe(false);
    expect(fields.has("guidance")).toBe(false);
  });

  it("just above threshold (0.51): no confirmation fields", () => {
    const block = buildTriageBlock(resultWith(0.51));
    const fields = parseBlock(block);

    expect(fields.has("confirmation_required")).toBe(false);
    expect(fields.has("guidance")).toBe(false);
  });

  // -------------------------------------------------------------------------
  // A5 byte-compatibility: the ≥0.75 auto-delegation band is unchanged
  // -------------------------------------------------------------------------

  it("above threshold: block is byte-identical to the verified high-confidence output", () => {
    // This is the canonical 6-line shape Task 3.1 verified.
    const expected = [
      "<goopspec_triage>",
      "intent: general",
      "recommended_effort: high",
      "confidence: 0.85",
      "reasoning: No auto-delegation or strong routing match.",
      "</goopspec_triage>",
    ].join("\n");

    expect(buildTriageBlock(resultWith(0.85))).toBe(expected);
  });

  it("auto-delegation band (≥0.75): byte-identical across the whole band", () => {
    // Every value in the auto-delegation band must produce the canonical
    // shape — no confirmation fields leak in at the 0.75 boundary.
    for (const confidence of [0.75, 0.8, 0.9, 1]) {
      const block = buildTriageBlock(resultWith(confidence));
      const fields = parseBlock(block);
      expect(fields.has("confirmation_required"), `confidence=${confidence}`).toBe(false);
      expect(fields.has("guidance"), `confidence=${confidence}`).toBe(false);
      // Canonical 6-line shape: open + 4 fields + close.
      expect(block.split("\n").length, `confidence=${confidence}`).toBe(6);
    }
  });
});
