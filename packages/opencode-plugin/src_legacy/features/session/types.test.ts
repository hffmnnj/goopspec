import { describe, expect, it } from "bun:test";
import {
  SESSION_ID_PATTERN,
  SESSION_SCOPED_FILES,
  SHARED_RESOURCES,
  validateSessionId,
} from "./types.js";

describe("session types", () => {
  describe("validateSessionId", () => {
    it("accepts valid kebab-case ids", () => {
      expect(validateSessionId("feat-auth")).toBe(true);
      expect(validateSessionId("my-session-1")).toBe(true);
      expect(validateSessionId("a1")).toBe(true);
      expect(validateSessionId("session-123")).toBe(true);
    });

    it("rejects invalid ids", () => {
      expect(validateSessionId("-bad")).toBe(false);
      expect(validateSessionId("BAD")).toBe(false);
      expect(validateSessionId("a")).toBe(false);
      expect(validateSessionId("has spaces")).toBe(false);
      expect(validateSessionId("has_underscores")).toBe(false);
      expect(validateSessionId("bad-")).toBe(false);
    });

    it("rejects ids longer than 50 chars", () => {
      expect(validateSessionId("a".repeat(51))).toBe(false);
    });

    it("shares the canonical regex behavior", () => {
      expect(SESSION_ID_PATTERN.test("feat-auth")).toBe(true);
      expect(SESSION_ID_PATTERN.test("a")).toBe(false);
    });
  });

  describe("resource split constants", () => {
    it("defines shared resources in root goopspec directory", () => {
      expect(SHARED_RESOURCES).toEqual(["memory.db", "config.json", "archive/"]);
    });

    it("defines session-scoped files and directories", () => {
      expect(SESSION_SCOPED_FILES).toEqual([
        "state.json",
        "SPEC.md",
        "BLUEPRINT.md",
        "CHRONICLE.md",
        "RESEARCH.md",
        "REQUIREMENTS.md",
        "HANDOFF.md",
        "checkpoints/",
        "history/",
      ]);
    });
  });
});
