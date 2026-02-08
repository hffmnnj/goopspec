import { describe, expect, it } from "bun:test";
import { posix, win32 } from "path";

import { isDistDirectory } from "./paths.js";

describe("paths cross-platform", () => {
  describe("isDistDirectory", () => {
    it("handles /dist ending correctly", () => {
      const simulatedDir = "/tmp/goopspec/dist";
      expect(
        isDistDirectory(simulatedDir, {
          basename: (value: string) => posix.basename(value),
          resolve: (...parts: string[]) => posix.resolve(...parts),
        }),
      ).toBe(true);
    });

    it("handles \\dist ending correctly", () => {
      const simulatedDir = "C:\\Users\\test\\goopspec\\dist";
      expect(
        isDistDirectory(simulatedDir, {
          basename: (value: string) => win32.basename(value),
          resolve: (...parts: string[]) => win32.resolve(...parts),
        }),
      ).toBe(true);
    });
  });
});
