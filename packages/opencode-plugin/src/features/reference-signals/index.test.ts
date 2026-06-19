import { afterEach, describe, expect, it } from "bun:test";
import {
  clearSignals,
  detectReferences,
  getSignals,
  KEYWORD_PATTERNS,
  setSignals,
} from "./index.js";

// ---------------------------------------------------------------------------
// Signal Store
// ---------------------------------------------------------------------------

describe("signal store", () => {
  const SESSION_A = "session-a";
  const SESSION_B = "session-b";

  afterEach(() => {
    clearSignals(SESSION_A);
    clearSignals(SESSION_B);
  });

  it("setSignals + getSignals round-trip", () => {
    setSignals(SESSION_A, ["debugging", "tdd"]);
    expect(getSignals(SESSION_A)).toEqual(["debugging", "tdd"]);
  });

  it("getSignals returns [] for unknown sessionId", () => {
    expect(getSignals("nonexistent-session")).toEqual([]);
  });

  it("clearSignals removes the entry", () => {
    setSignals(SESSION_A, ["debugging"]);
    clearSignals(SESSION_A);
    expect(getSignals(SESSION_A)).toEqual([]);
  });

  it("multiple sessions are independent", () => {
    setSignals(SESSION_A, ["debugging"]);
    setSignals(SESSION_B, ["pr-creation"]);

    expect(getSignals(SESSION_A)).toEqual(["debugging"]);
    expect(getSignals(SESSION_B)).toEqual(["pr-creation"]);

    clearSignals(SESSION_A);
    expect(getSignals(SESSION_A)).toEqual([]);
    expect(getSignals(SESSION_B)).toEqual(["pr-creation"]);
  });

  it("overwriting signals replaces previous values", () => {
    setSignals(SESSION_A, ["debugging"]);
    setSignals(SESSION_A, ["pr-creation", "tdd"]);
    expect(getSignals(SESSION_A)).toEqual(["pr-creation", "tdd"]);
  });
});

// ---------------------------------------------------------------------------
// detectReferences
// ---------------------------------------------------------------------------

describe("detectReferences", () => {
  it("matches 'debug' → ['debugging']", () => {
    expect(detectReferences("debug")).toEqual(["debugging"]);
  });

  it("matches 'debugging this error' → ['debugging']", () => {
    expect(detectReferences("debugging this error")).toEqual(["debugging"]);
  });

  it("matches 'create a PR' → ['pr-creation']", () => {
    expect(detectReferences("create a PR")).toEqual(["pr-creation"]);
  });

  it("matches 'gh pr create' → ['pr-creation']", () => {
    expect(detectReferences("gh pr create")).toEqual(["pr-creation"]);
  });

  it("matches 'dogfood the plugin' → ['dogfooding']", () => {
    expect(detectReferences("dogfood the plugin")).toEqual(["dogfooding"]);
  });

  it("case-insensitive: 'DEBUG' → ['debugging']", () => {
    expect(detectReferences("DEBUG")).toEqual(["debugging"]);
  });

  it("case-insensitive: 'Pull Request' → ['pr-creation']", () => {
    expect(detectReferences("Pull Request")).toEqual(["pr-creation"]);
  });

  it("returns at most 2 results even if 3+ patterns match", () => {
    // "debug the failing test PR" matches debugging, pr-creation, and tdd
    const result = detectReferences("debug the failing test PR");
    expect(result.length).toBeLessThanOrEqual(2);
  });

  it("returns [] for text with no matching keywords", () => {
    expect(detectReferences("hello world")).toEqual([]);
  });

  it("returns [] for empty string", () => {
    expect(detectReferences("")).toEqual([]);
  });

  it("deduplicates: same reference matched by multiple keywords appears once", () => {
    // "debug this error crash" — all match the same debugging pattern
    const result = detectReferences("debug this error crash");
    const unique = new Set(result);
    expect(result.length).toBe(unique.size);
    expect(result).toContain("debugging");
  });

  it("KEYWORD_PATTERNS is exported and non-empty", () => {
    expect(KEYWORD_PATTERNS).toBeDefined();
    expect(KEYWORD_PATTERNS.length).toBeGreaterThan(0);
  });

  it("matches multiple distinct references", () => {
    // "debug the PR" should match debugging and pr-creation
    const result = detectReferences("debug the PR");
    expect(result).toContain("debugging");
    expect(result).toContain("pr-creation");
    expect(result.length).toBe(2);
  });
});
