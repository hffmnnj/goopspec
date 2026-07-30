import { describe, expect, it } from "bun:test";

import { isCompleteStatus } from "./status.js";

describe("isCompleteStatus", () => {
  it("returns true for done, completed, and legacy complete (any case, trimmed)", () => {
    expect(isCompleteStatus("done")).toBe(true);
    expect(isCompleteStatus("completed")).toBe(true);
    expect(isCompleteStatus("complete")).toBe(true);
    expect(isCompleteStatus("Done")).toBe(true);
    expect(isCompleteStatus("COMPLETED")).toBe(true);
    expect(isCompleteStatus("Complete")).toBe(true);
    expect(isCompleteStatus("  DoNe  ")).toBe(true);
    expect(isCompleteStatus("\tcompleted\n")).toBe(true);
  });

  it("returns false for non-terminal or missing statuses", () => {
    expect(isCompleteStatus(undefined)).toBe(false);
    expect(isCompleteStatus("")).toBe(false);
    expect(isCompleteStatus("   ")).toBe(false);
    expect(isCompleteStatus("pending")).toBe(false);
    expect(isCompleteStatus("in_progress")).toBe(false);
    expect(isCompleteStatus("in-progress")).toBe(false);
    expect(isCompleteStatus("bogus")).toBe(false);
  });

  it("is total and never throws", () => {
    expect(() => isCompleteStatus()).not.toThrow();
    expect(() => isCompleteStatus("   ")).not.toThrow();
    expect(() => isCompleteStatus(null as unknown as string)).not.toThrow();
  });
});
