import { afterEach, describe, expect, it, mock } from "bun:test";
import { posix, win32 } from "path";

describe("paths cross-platform", () => {
  afterEach(() => {
    mock.restore();
  });

  describe("getPackageRoot", () => {
    it("handles /dist ending correctly", async () => {
      const simulatedDir = "/tmp/goopspec/dist";

      mock.module("url", () => ({
        fileURLToPath: () => `${simulatedDir}/paths.js`,
      }));

      mock.module("path", () => ({
        dirname: () => simulatedDir,
        basename: (value: string) => posix.basename(value),
        resolve: (...parts: string[]) => posix.resolve(...parts),
        join: (...parts: string[]) => posix.join(...parts),
      }));

      const module = await import(`./paths.js?unix-dist-${Date.now()}`);
      expect(module.getPackageRoot()).toBe(posix.resolve(simulatedDir, ".."));
    });

    it("handles \\dist ending correctly", async () => {
      const simulatedDir = "C:\\Users\\test\\goopspec\\dist";

      mock.module("url", () => ({
        fileURLToPath: () => `${simulatedDir}\\paths.js`,
      }));

      mock.module("path", () => ({
        dirname: () => simulatedDir,
        basename: (value: string) => win32.basename(value),
        resolve: (...parts: string[]) => win32.resolve(...parts),
        join: (...parts: string[]) => win32.join(...parts),
      }));

      const module = await import(`./paths.js?windows-dist-${Date.now()}`);
      expect(module.getPackageRoot()).toBe(win32.resolve(simulatedDir, ".."));
    });
  });
});
