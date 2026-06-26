import { describe, it, expect } from "bun:test";
import { computeConfigDiff, formatDiff } from "./diff.js";

describe("diff", () => {
  describe("computeConfigDiff", () => {
    it("returns only fields that changed", () => {
      const before = { projectName: "old", defaultModel: "m1" };
      const after = { projectName: "new", defaultModel: "m1" };
      const diffs = computeConfigDiff(before, after);

      expect(diffs).toEqual([
        { key: "projectName", before: "old", after: "new" },
      ]);
    });

    it("detects added fields", () => {
      const before = {};
      const after = { projectName: "demo" };
      const diffs = computeConfigDiff(before, after);

      expect(diffs).toEqual([
        { key: "projectName", before: undefined, after: "demo" },
      ]);
    });

    it("detects removed fields", () => {
      const before = { projectName: "demo" };
      const after = {};
      const diffs = computeConfigDiff(before, after);

      expect(diffs).toEqual([
        { key: "projectName", before: "demo", after: undefined },
      ]);
    });

    it("returns empty when configs are identical", () => {
      const before = { projectName: "demo", memoryEnabled: true };
      const after = { projectName: "demo", memoryEnabled: true };
      const diffs = computeConfigDiff(before, after);

      expect(diffs).toEqual([]);
    });

    it("serializes object fields as JSON", () => {
      const before = { agentModels: { planner: "a" } };
      const after = { agentModels: { planner: "b" } };
      const diffs = computeConfigDiff(before, after);

      expect(diffs).toEqual([
        { key: "agentModels", before: '{"planner":"a"}', after: '{"planner":"b"}' },
      ]);
    });

    it("serializes booleans as JSON", () => {
      const before = { memoryEnabled: false };
      const after = { memoryEnabled: true };
      const diffs = computeConfigDiff(before, after);

      expect(diffs).toEqual([
        { key: "memoryEnabled", before: "false", after: "true" },
      ]);
    });
  });

  describe("formatDiff", () => {
    it("formats changes as before -> after", () => {
      const diffs = [
        { key: "projectName", before: undefined, after: "myproject" },
      ];
      expect(formatDiff(diffs)).toBe("projectName: undefined -> myproject");
    });

    it("joins multiple diffs with newlines", () => {
      const diffs = [
        { key: "projectName", before: "old", after: "new" },
        { key: "memoryEnabled", before: "false", after: "true" },
      ];
      expect(formatDiff(diffs)).toBe(
        "projectName: old -> new\nmemoryEnabled: false -> true",
      );
    });

    it("formats object diffs as JSON", () => {
      const diffs = [
        { key: "agentModels", before: undefined, after: '{"planner":"m1"}' },
      ];
      expect(formatDiff(diffs)).toBe('agentModels: undefined -> {"planner":"m1"}');
    });

    it("returns a no-changes message for an empty diff", () => {
      expect(formatDiff([])).toBe("No changes.");
    });
  });
});
