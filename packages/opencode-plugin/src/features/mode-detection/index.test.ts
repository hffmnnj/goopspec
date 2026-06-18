import { describe, expect, it } from "bun:test";
import { detectTaskMode, shouldPromptForMode } from "./index.js";
import type { ModeDetectionResult } from "./index.js";

// ---------------------------------------------------------------------------
// Quick mode
// ---------------------------------------------------------------------------

describe("detectTaskMode — quick", () => {
  it("detects typo fixes", () => {
    const r = detectTaskMode("Fix typo in README");
    expect(r.mode).toBe("quick");
    expect(r.confidence).toBeGreaterThan(0.5);
  });

  it("detects single-file scope", () => {
    const r = detectTaskMode("Update single file with new import");
    expect(r.mode).toBe("quick");
  });

  it("detects bug fixes", () => {
    const r = detectTaskMode("Quick bug fix for login validation");
    expect(r.mode).toBe("quick");
  });

  it("detects formatting/whitespace", () => {
    const r = detectTaskMode("Fix indentation in utils.ts");
    expect(r.mode).toBe("quick");
  });

  it("detects rename tasks", () => {
    const r = detectTaskMode("Rename the variable foo");
    expect(r.mode).toBe("quick");
  });
});

// ---------------------------------------------------------------------------
// Standard mode
// ---------------------------------------------------------------------------

describe("detectTaskMode — standard", () => {
  it("detects feature additions", () => {
    const r = detectTaskMode("Add new user profile component with avatar and bio");
    expect(r.mode).toBe("standard");
  });

  it("detects API endpoint creation", () => {
    const r = detectTaskMode("Create API endpoint for user authentication");
    expect(r.mode).toBe("standard");
  });

  it("detects component implementation", () => {
    const r = detectTaskMode("Implement modal dialog component with form validation");
    expect(r.mode).toBe("standard");
  });

  it("detects UI component work", () => {
    const r = detectTaskMode("Build a new table component for the dashboard page");
    expect(r.mode).toBe("standard");
  });
});

// ---------------------------------------------------------------------------
// Comprehensive mode
// ---------------------------------------------------------------------------

describe("detectTaskMode — comprehensive", () => {
  it("detects system refactors", () => {
    const r = detectTaskMode(
      "Refactor the entire authentication system to use JWT tokens across all endpoints and update the database schema",
    );
    expect(r.mode).toBe("comprehensive");
  });

  it("detects architecture changes", () => {
    const r = detectTaskMode(
      "Redesign the application architecture to support microservices and migrate all API routes",
    );
    expect(r.mode).toBe("comprehensive");
  });

  it("detects migration work", () => {
    const r = detectTaskMode(
      "Migrate the entire codebase from JavaScript to TypeScript with proper type definitions throughout",
    );
    expect(r.mode).toBe("comprehensive");
  });

  it("detects project-wide scope", () => {
    const r = detectTaskMode("Restructure the codebase level organization");
    expect(r.mode).toBe("comprehensive");
  });
});

// ---------------------------------------------------------------------------
// Milestone mode
// ---------------------------------------------------------------------------

describe("detectTaskMode — milestone", () => {
  it("detects version releases", () => {
    const r = detectTaskMode(
      "Plan and implement v2.0 release with new dashboard, API improvements, and user management system",
    );
    expect(r.mode).toBe("milestone");
  });

  it("detects MVP work", () => {
    const r = detectTaskMode(
      "Build MVP with core features: user authentication, profile management, and basic dashboard for beta launch",
    );
    expect(r.mode).toBe("milestone");
  });

  it("detects multi-phase projects", () => {
    const r = detectTaskMode(
      "Roadmap for Q1: Phase 1 - authentication, Phase 2 - user profiles, Phase 3 - admin dashboard",
    );
    expect(r.mode).toBe("milestone");
  });

  it("detects production deployment", () => {
    const r = detectTaskMode("Prepare the go-live rollout for production");
    expect(r.mode).toBe("milestone");
  });
});

// ---------------------------------------------------------------------------
// Confidence
// ---------------------------------------------------------------------------

describe("detectTaskMode — confidence", () => {
  it("high confidence for clear signals", () => {
    const r = detectTaskMode("Fix typo");
    expect(r.confidence).toBeGreaterThan(0.7);
  });

  it("lower confidence for ambiguous requests", () => {
    const r = detectTaskMode("Update the system");
    expect(r.confidence).toBeLessThan(0.7);
  });
});

// ---------------------------------------------------------------------------
// Defaults & edge cases
// ---------------------------------------------------------------------------

describe("detectTaskMode — defaults", () => {
  it("defaults to standard on empty input", () => {
    const r = detectTaskMode("  ");
    expect(r.mode).toBe("standard");
    expect(r.confidence).toBe(0);
  });

  it("defaults to standard on empty string", () => {
    const r = detectTaskMode("");
    expect(r.mode).toBe("standard");
    expect(r.confidence).toBe(0);
  });

  it("respects custom default mode", () => {
    const r = detectTaskMode("", { defaultMode: "quick" });
    expect(r.mode).toBe("quick");
  });

  it("returns reasoning even for defaults", () => {
    const r = detectTaskMode("");
    expect(r.reasoning.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Depth hints
// ---------------------------------------------------------------------------

describe("detectTaskMode — depth hints", () => {
  it("deep hint boosts comprehensive", () => {
    const r = detectTaskMode("Do a deep dive on auth refactor");
    expect(r.mode).toBe("comprehensive");
  });

  it("shallow hint boosts quick", () => {
    const r = detectTaskMode("Brief look at the config");
    expect(r.mode).toBe("quick");
  });

  it("explicit depthHint option overrides text detection", () => {
    const r = detectTaskMode("Add a feature", { depthHint: "deep" });
    expect(r.reasoning).toContain('Depth hint "deep" boosts comprehensive');
  });
});

// ---------------------------------------------------------------------------
// Alternatives
// ---------------------------------------------------------------------------

describe("detectTaskMode — alternatives", () => {
  it("suggests alternatives for ambiguous requests", () => {
    const r = detectTaskMode("Add feature");
    expect(r.alternatives.length).toBeGreaterThan(0);
  });

  it("few alternatives for clear requests", () => {
    const r = detectTaskMode("Fix typo in README file");
    expect(r.alternatives.length).toBeLessThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// shouldPromptForMode
// ---------------------------------------------------------------------------

describe("shouldPromptForMode", () => {
  it("prompts when confidence is low", () => {
    const r = detectTaskMode("Update something");
    expect(shouldPromptForMode(r)).toBe(true);
  });

  it("does not prompt when confidence is high", () => {
    const r = detectTaskMode("Fix typo in README");
    expect(shouldPromptForMode(r)).toBe(false);
  });

  it("prompts when multiple alternatives exist", () => {
    const result: ModeDetectionResult = {
      mode: "standard",
      confidence: 0.7,
      reasoning: [],
      alternatives: ["quick", "comprehensive"],
    };
    expect(shouldPromptForMode(result)).toBe(true);
  });

  it("does not prompt for high confidence with no alternatives", () => {
    const result: ModeDetectionResult = {
      mode: "quick",
      confidence: 0.9,
      reasoning: ["Trivial change"],
      alternatives: [],
    };
    expect(shouldPromptForMode(result)).toBe(false);
  });
});
