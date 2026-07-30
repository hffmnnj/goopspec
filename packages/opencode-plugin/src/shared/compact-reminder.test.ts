import { describe, expect, it } from "bun:test";

import {
  SPEC_LOCK_COMPACT_REMINDER,
  WAVE_COMPLETE_COMPACT_REMINDER,
  isWaveComplete,
} from "./compact-reminder.js";
import { isCompleteStatus } from "./status.js";

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
    });

    it("tolerates legacy 'complete' rows already persisted in existing databases", () => {
      expect(isWaveComplete("complete")).toBe(true);
      expect(isWaveComplete("Complete")).toBe(true);
      expect(isWaveComplete("  complete  ")).toBe(true);
    });

    it("is total and never throws", () => {
      expect(() => isWaveComplete()).not.toThrow();
      expect(() => isWaveComplete("   ")).not.toThrow();
    });

    it("delegates to the shared isCompleteStatus predicate", () => {
      const inputs = [
        "done",
        "completed",
        "complete",
        "Done",
        "COMPLETED",
        "  DoNe  ",
        "pending",
        "in_progress",
        "in-progress",
        "",
        "bogus",
        undefined,
      ];
      for (const input of inputs) {
        expect(isWaveComplete(input)).toBe(isCompleteStatus(input));
      }
    });
  });
});
