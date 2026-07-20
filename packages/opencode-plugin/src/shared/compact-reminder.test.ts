import { describe, expect, it } from "bun:test";

import {
  SPEC_LOCK_COMPACT_REMINDER,
  WAVE_COMPLETE_COMPACT_REMINDER,
  isWaveComplete,
} from "./compact-reminder.js";

describe("compact-reminder", () => {
  describe("SPEC_LOCK_COMPACT_REMINDER", () => {
    it("contains the goop_compact tool name", () => {
      expect(SPEC_LOCK_COMPACT_REMINDER).toContain("goop_compact");
    });

    it("mentions the required next_step argument", () => {
      expect(SPEC_LOCK_COMPACT_REMINDER).toContain("next_step");
    });
  });

  describe("WAVE_COMPLETE_COMPACT_REMINDER", () => {
    it("contains the goop_compact tool name", () => {
      expect(WAVE_COMPLETE_COMPACT_REMINDER).toContain("goop_compact");
    });

    it("mentions the required next_step argument", () => {
      expect(WAVE_COMPLETE_COMPACT_REMINDER).toContain("next_step");
    });
  });

  describe("isWaveComplete", () => {
    it("returns true for done and completed (any case)", () => {
      expect(isWaveComplete("done")).toBe(true);
      expect(isWaveComplete("completed")).toBe(true);
      expect(isWaveComplete("Done")).toBe(true);
      expect(isWaveComplete("COMPLETED")).toBe(true);
      expect(isWaveComplete("  DoNe  ")).toBe(true);
    });

    it("returns false for non-terminal or missing statuses", () => {
      expect(isWaveComplete(undefined)).toBe(false);
      expect(isWaveComplete("")).toBe(false);
      expect(isWaveComplete("pending")).toBe(false);
      expect(isWaveComplete("in_progress")).toBe(false);
      expect(isWaveComplete("complete")).toBe(false);
    });

    it("is total and never throws", () => {
      expect(() => isWaveComplete()).not.toThrow();
      expect(() => isWaveComplete("   ")).not.toThrow();
    });
  });
});
