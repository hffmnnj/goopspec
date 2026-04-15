import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  basename,
  dirname,
  ensurePosixPath,
  getHomeDir,
  getTempDir,
  isWindows,
  join,
  normalizePath,
  resolve,
  sep,
  safeDirname,
} from "./platform.js";

describe("platform abstraction layer", () => {
  let originalHome: string | undefined;
  let originalUserProfile: string | undefined;

  beforeEach(() => {
    originalHome = process.env.HOME;
    originalUserProfile = process.env.USERPROFILE;
  });

  afterEach(() => {
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }

    if (originalUserProfile === undefined) {
      delete process.env.USERPROFILE;
    } else {
      process.env.USERPROFILE = originalUserProfile;
    }
  });

  describe("isWindows", () => {
    it("returns a boolean without throwing", () => {
      expect(() => isWindows()).not.toThrow();
      expect(typeof isWindows()).toBe("boolean");
    });
  });

  describe("getHomeDir", () => {
    it("returns HOME when set", () => {
      process.env.HOME = "/home/test-user";
      process.env.USERPROFILE = "C:\\Users\\test-user";

      expect(getHomeDir()).toBe("/home/test-user");
    });

    it("falls back to USERPROFILE when HOME is unset", () => {
      delete process.env.HOME;
      process.env.USERPROFILE = "C:\\Users\\fallback";

      expect(getHomeDir()).toBe("C:\\Users\\fallback");
    });

    it("throws when HOME and USERPROFILE are both unset", () => {
      delete process.env.HOME;
      delete process.env.USERPROFILE;

      expect(() => getHomeDir()).toThrow(
        "Unable to resolve home directory: HOME and USERPROFILE are not set",
      );
    });
  });

  describe("getTempDir", () => {
    it("returns a non-empty string", () => {
      const value = getTempDir();

      expect(typeof value).toBe("string");
      expect(value.length).toBeGreaterThan(0);
    });
  });

  describe("normalizePath", () => {
    it("converts backslashes to forward slashes", () => {
      expect(normalizePath("C:\\Users\\test")).toBe("C:/Users/test");
    });

    it("leaves forward slashes unchanged", () => {
      expect(normalizePath("/home/user")).toBe("/home/user");
    });
  });

  describe("ensurePosixPath", () => {
    it("converts backslashes to forward slashes", () => {
      expect(ensurePosixPath("C:\\Users\\test")).toBe("C:/Users/test");
    });

    it("keeps forward slash paths unchanged", () => {
      expect(ensurePosixPath("/home/user")).toBe("/home/user");
    });
  });

  describe("safeDirname", () => {
    it("handles Windows-style paths", () => {
      expect(safeDirname("C:\\Users\\test\\.config\\opencode\\goopspec.json")).toBe(
        "C:\\Users\\test\\.config\\opencode",
      );
    });

    it("handles Unix-style paths", () => {
      expect(safeDirname("/home/test/.config/opencode/goopspec.json")).toBe(
        "/home/test/.config/opencode",
      );
    });
  });

  describe("path re-exports", () => {
    it("exports dirname, basename, join, resolve, and sep", () => {
      expect(typeof dirname).toBe("function");
      expect(typeof basename).toBe("function");
      expect(typeof join).toBe("function");
      expect(typeof resolve).toBe("function");
      expect(typeof sep).toBe("string");
      expect(sep === "/" || sep === "\\").toBe(true);
    });
  });
});
