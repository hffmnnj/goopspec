import { describe, expect, it } from "bun:test";

import {
  FORBIDDEN_TERMS,
  scanForViolations,
  suggest,
} from "./index.js";

// ============================================================================
// FORBIDDEN_TERMS structure
// ============================================================================

describe("FORBIDDEN_TERMS", () => {
  it("has at least 10 entries", () => {
    expect(FORBIDDEN_TERMS.length).toBeGreaterThanOrEqual(10);
  });

  it("each entry has name, pattern, replacement, severity", () => {
    for (const term of FORBIDDEN_TERMS) {
      expect(typeof term.name).toBe("string");
      expect(term.pattern).toBeInstanceOf(RegExp);
      expect(typeof term.replacement).toBe("string");
      expect(["error", "warn"]).toContain(term.severity);
    }
  });
});

// ============================================================================
// scanForViolations
// ============================================================================

describe("scanForViolations", () => {
  it("returns empty array for clean content", () => {
    const result = scanForViolations("This is a perfectly clean PR description.");
    expect(result).toEqual([]);
  });

  // -----------------------------------------------------------------------
  // Error-severity detections
  // -----------------------------------------------------------------------

  it('detects "wave" standalone (error)', () => {
    const result = scanForViolations("Completed wave of changes");
    const match = result.find((v) => v.term === "wave standalone");
    expect(match).toBeDefined();
    expect(match!.severity).toBe("error");
    expect(match!.match.toLowerCase()).toBe("wave");
  });

  it('detects "wave 2/4" pattern (error)', () => {
    const result = scanForViolations("Finished wave 2/4");
    const match = result.find((v) => v.term === "wave N/N");
    expect(match).toBeDefined();
    expect(match!.severity).toBe("error");
    expect(match!.match).toBe("wave 2/4");
  });

  it('detects "task 2.1" pattern (error)', () => {
    const result = scanForViolations("Implements task 2.1");
    const match = result.find((v) => v.term === "task N.N");
    expect(match).toBeDefined();
    expect(match!.severity).toBe("error");
  });

  it('detects "must-have" (error)', () => {
    const result = scanForViolations("This is a must-have feature");
    const match = result.find((v) => v.term === "must-have");
    expect(match).toBeDefined();
    expect(match!.severity).toBe("error");
  });

  it('detects "must haves" (error)', () => {
    const result = scanForViolations("All must haves are done");
    const match = result.find((v) => v.term === "must-have");
    expect(match).toBeDefined();
    expect(match!.severity).toBe("error");
  });

  it('detects "nice-to-have" (error)', () => {
    const result = scanForViolations("This is a nice-to-have");
    const match = result.find((v) => v.term === "nice-to-have");
    expect(match).toBeDefined();
    expect(match!.severity).toBe("error");
  });

  it('detects "MH-3" pattern (error)', () => {
    const result = scanForViolations("Implements MH-3");
    const match = result.find((v) => v.term === "MH-digits");
    expect(match).toBeDefined();
    expect(match!.severity).toBe("error");
    expect(match!.replacement).toBe("requirement");
  });

  it('detects "NH-1" pattern (error)', () => {
    const result = scanForViolations("Also covers NH-1");
    const match = result.find((v) => v.term === "NH-digits");
    expect(match).toBeDefined();
    expect(match!.severity).toBe("error");
    expect(match!.replacement).toBe("enhancement");
  });

  it('detects "goop-executor" (error)', () => {
    const result = scanForViolations("Delegated to goop-executor");
    const match = result.find((v) => v.term === "goop-executor variants");
    expect(match).toBeDefined();
    expect(match!.severity).toBe("error");
  });

  it('detects "goop-executor-medium" (error)', () => {
    const result = scanForViolations("Run by goop-executor-medium");
    const match = result.find((v) => v.term === "goop-executor variants");
    expect(match).toBeDefined();
    expect(match!.severity).toBe("error");
    expect(match!.match).toBe("goop-executor-medium");
  });

  it('detects "chronicle" (error)', () => {
    const result = scanForViolations("Updated the chronicle");
    const match = result.find((v) => v.term === "chronicle");
    expect(match).toBeDefined();
    expect(match!.severity).toBe("error");
  });

  it('detects "ADL" uppercase only (error) — "adl" should NOT match', () => {
    const upper = scanForViolations("Logged in ADL");
    const adlMatch = upper.find((v) => v.term === "ADL");
    expect(adlMatch).toBeDefined();
    expect(adlMatch!.severity).toBe("error");

    // Lowercase "adl" should NOT match (pattern is case-sensitive)
    const lower = scanForViolations("the adl was updated");
    const lowerMatch = lower.find((v) => v.term === "ADL");
    expect(lowerMatch).toBeUndefined();
  });

  it('detects "wiring task" (error)', () => {
    const result = scanForViolations("This is the wiring task");
    const match = result.find((v) => v.term === "wiring task");
    expect(match).toBeDefined();
    expect(match!.severity).toBe("error");
  });

  it('detects "spec locked" (error)', () => {
    const result = scanForViolations("The spec locked state is set");
    const match = result.find((v) => v.term === "spec locked");
    expect(match).toBeDefined();
    expect(match!.severity).toBe("error");
  });

  it('detects "acceptance gate" (error)', () => {
    const result = scanForViolations("Passed the acceptance gate");
    const match = result.find((v) => v.term === "acceptance gate");
    expect(match).toBeDefined();
    expect(match!.severity).toBe("error");
  });

  it('detects "deviation rule" (error)', () => {
    const result = scanForViolations("Applied deviation rule 3");
    const match = result.find((v) => v.term === "deviation rule");
    expect(match).toBeDefined();
    expect(match!.severity).toBe("error");
  });

  // -----------------------------------------------------------------------
  // Warn-severity detections
  // -----------------------------------------------------------------------

  it('detects "blueprint" (warn) — NOT error', () => {
    const result = scanForViolations("See the blueprint for details");
    const match = result.find((v) => v.term === "blueprint");
    expect(match).toBeDefined();
    expect(match!.severity).toBe("warn");
  });

  it('detects "handoff" (warn) — NOT error', () => {
    const result = scanForViolations("Prepared the handoff document");
    const match = result.find((v) => v.term === "handoff");
    expect(match).toBeDefined();
    expect(match!.severity).toBe("warn");
  });

  it('detects "goopspec" (warn) — NOT error', () => {
    const result = scanForViolations("Built with goopspec");
    const match = result.find((v) => v.term === "goopspec");
    expect(match).toBeDefined();
    expect(match!.severity).toBe("warn");
  });

  // -----------------------------------------------------------------------
  // Case insensitivity
  // -----------------------------------------------------------------------

  it('case-insensitive: "WAVE" matches', () => {
    const result = scanForViolations("Completed WAVE of work");
    const match = result.find((v) => v.term === "wave standalone");
    expect(match).toBeDefined();
    expect(match!.match).toBe("WAVE");
  });

  it('case-insensitive: "Must-Have" matches', () => {
    const result = scanForViolations("This is a Must-Have");
    const match = result.find((v) => v.term === "must-have");
    expect(match).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // Multi-line and line numbers
  // -----------------------------------------------------------------------

  it("multi-line input: line numbers are correct", () => {
    const text = "Line one is clean\nLine two has a wave\nLine three is clean";
    const result = scanForViolations(text);
    const match = result.find((v) => v.term === "wave standalone");
    expect(match).toBeDefined();
    expect(match!.line).toBe(2);
    expect(match!.column).toBeGreaterThan(0);
  });

  // -----------------------------------------------------------------------
  // Word boundaries
  // -----------------------------------------------------------------------

  it('word boundary: "microwave" does NOT match "wave"', () => {
    const result = scanForViolations("Put it in the microwave");
    const waveMatch = result.find(
      (v) => v.term === "wave standalone" || v.term === "wave N/N",
    );
    expect(waveMatch).toBeUndefined();
  });

  it('word boundary: "taskbar" does NOT match "task N.N"', () => {
    const result = scanForViolations("Click the taskbar icon");
    const taskMatch = result.find((v) => v.term === "task N.N");
    expect(taskMatch).toBeUndefined();
  });

  // -----------------------------------------------------------------------
  // Multiple violations
  // -----------------------------------------------------------------------

  it("returns multiple violations from same text", () => {
    const text = "Completed wave 2/4 for MH-3 via goop-executor-medium";
    const result = scanForViolations(text);
    expect(result.length).toBeGreaterThanOrEqual(3);

    const terms = result.map((v) => v.term);
    expect(terms).toContain("wave N/N");
    expect(terms).toContain("MH-digits");
    expect(terms).toContain("goop-executor variants");
  });

  // -----------------------------------------------------------------------
  // Violation structure
  // -----------------------------------------------------------------------

  it("violation has: term, match, line, column, severity, replacement", () => {
    const result = scanForViolations("Found a wave here");
    expect(result.length).toBeGreaterThan(0);

    const v = result[0]!;
    expect(typeof v.term).toBe("string");
    expect(typeof v.match).toBe("string");
    expect(typeof v.line).toBe("number");
    expect(typeof v.column).toBe("number");
    expect(["error", "warn"]).toContain(v.severity);
    expect(typeof v.replacement).toBe("string");
  });
});

// ============================================================================
// suggest
// ============================================================================

describe("suggest", () => {
  it('replaces "wave" with "phase"', () => {
    const result = suggest("Completed wave of changes");
    expect(result).toContain("phase");
    expect(result).not.toMatch(/\bwave\b/i);
  });

  it('replaces "MH-3" with "requirement"', () => {
    const result = suggest("Implements MH-3");
    expect(result).toContain("requirement");
    expect(result).not.toContain("MH-3");
  });

  it("leaves clean text unchanged", () => {
    const clean = "This is a perfectly clean description.";
    expect(suggest(clean)).toBe(clean);
  });

  it("handles empty string", () => {
    expect(suggest("")).toBe("");
  });
});
