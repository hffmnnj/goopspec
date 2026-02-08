/**
 * Tests for path utilities
 */

import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import {
  getPackageRoot,
  isDevMode,
  getProjectGoopspecDir,
  getGlobalConfigDir,
  getBundledResourceDir,
  getProjectResourceDir,
  getSessionDir,
  getSessionGoopspecPath,
  getSharedResourcePath,
  ensureSessionDir,
  pathExists,
  joinPath,
  resolvePath,
} from "./paths.js";

describe("paths", () => {
  describe("getPackageRoot", () => {
    it("should return a valid directory path", () => {
      const root = getPackageRoot();
      expect(root).toBeTruthy();
      expect(typeof root).toBe("string");
    });

    it("should return path where package.json exists", () => {
      const root = getPackageRoot();
      const packageJsonPath = joinPath(root, "package.json");
      expect(pathExists(packageJsonPath)).toBe(true);
    });
  });

  describe("isDevMode", () => {
    it("should return a boolean", () => {
      const result = isDevMode();
      expect(typeof result).toBe("boolean");
    });

    it("should return true when src/index.ts exists", () => {
      // In dev mode, src/index.ts should exist
      const result = isDevMode();
      expect(result).toBe(true);
    });
  });

  describe("getProjectGoopspecDir", () => {
    it("should return path ending with .goopspec", () => {
      const dir = getProjectGoopspecDir("/home/user/project");
      expect(dir).toBe(joinPath("/home/user/project", ".goopspec"));
    });
  });

  describe("getGlobalConfigDir", () => {
    const originalHome = process.env.HOME;
    const originalUserProfile = process.env.USERPROFILE;

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

    it("should return path containing .config/opencode", () => {
      const dir = getGlobalConfigDir();
      expect(dir).toContain(".config");
      expect(dir).toContain("opencode");
    });

    it("uses Unix HOME paths", () => {
      process.env.HOME = "/home/test-user";
      delete process.env.USERPROFILE;

      expect(getGlobalConfigDir()).toBe(joinPath("/home/test-user", ".config", "opencode"));
    });

    it("uses Windows-style HOME paths", () => {
      process.env.HOME = "C:\\Users\\test-user";
      delete process.env.USERPROFILE;

      expect(getGlobalConfigDir()).toBe(joinPath("C:\\Users\\test-user", ".config", "opencode"));
    });
  });

  describe("getBundledResourceDir", () => {
    it("should return path for agents", () => {
      const dir = getBundledResourceDir("agent");
      expect(dir).toContain("agents");
    });

    it("should return path for commands", () => {
      const dir = getBundledResourceDir("command");
      expect(dir).toContain("commands");
    });

    it("should return existing directory for agents", () => {
      const dir = getBundledResourceDir("agent");
      expect(pathExists(dir)).toBe(true);
    });
  });

  describe("getProjectResourceDir", () => {
    it("should return path within .goopspec", () => {
      const dir = getProjectResourceDir("/home/user/project", "agent");
      expect(dir).toBe(joinPath("/home/user/project", ".goopspec", "agents"));
    });
  });

  describe("joinPath", () => {
    it("should join paths correctly", () => {
      const result = joinPath("/home", "user", "project");
      expect(result).toContain("user");
      expect(result).toContain("project");
    });
  });

  describe("resolvePath", () => {
    it("should resolve relative paths", () => {
      const result = resolvePath("/home/user", "..", "other");
      expect(result).toContain("other");
      expect(result).not.toContain("..");
    });
  });

  describe("getSessionDir", () => {
    it("should return session directory under .goopspec/sessions", () => {
      const dir = getSessionDir("proj", "feat-auth");
      expect(dir).toBe(joinPath("proj", ".goopspec", "sessions", "feat-auth"));
    });

    it("should return sessions root for empty session id", () => {
      const dir = getSessionDir("proj", "");
      expect(dir).toBe(joinPath("proj", ".goopspec", "sessions"));
    });

    it("should handle missing args", () => {
      const dir = getSessionDir();
      expect(dir).toBe(joinPath(".goopspec", "sessions"));
    });
  });

  describe("getSessionGoopspecPath", () => {
    it("should route to session path when session id provided", () => {
      const path = getSessionGoopspecPath("proj", "state.json", "feat-auth");
      expect(path).toBe(joinPath("proj", ".goopspec", "sessions", "feat-auth", "state.json"));
    });

    it("should route to root path when session id is omitted", () => {
      const path = getSessionGoopspecPath("proj", "state.json");
      expect(path).toBe(joinPath("proj", ".goopspec", "state.json"));
    });

    it("should keep shared resources at root even with session id", () => {
      const memoryPath = getSessionGoopspecPath("proj", "memory.db", "feat-auth");
      const archivePath = getSessionGoopspecPath("proj", "archive/snapshot.json", "feat-auth");

      expect(memoryPath).toBe(joinPath("proj", ".goopspec", "memory.db"));
      expect(archivePath).toBe(joinPath("proj", ".goopspec", "archive", "snapshot.json"));
    });

    it("should handle empty and missing args", () => {
      const empty = getSessionGoopspecPath("", "", "");
      const missing = getSessionGoopspecPath();

      expect(empty).toBe(joinPath(".goopspec"));
      expect(missing).toBe(joinPath(".goopspec"));
    });
  });

  describe("getSharedResourcePath", () => {
    it("should always route to root .goopspec path", () => {
      const path = getSharedResourcePath("proj", "memory.db");
      expect(path).toBe(joinPath("proj", ".goopspec", "memory.db"));
    });

    it("should handle empty and missing args", () => {
      const empty = getSharedResourcePath("", "");
      const missing = getSharedResourcePath();

      expect(empty).toBe(joinPath(".goopspec"));
      expect(missing).toBe(joinPath(".goopspec"));
    });
  });

  describe("ensureSessionDir", () => {
    it("should create session directory and subdirectories", async () => {
      const projectDir = mkdtempSync(joinPath(tmpdir(), "goopspec-paths-"));

      try {
        await ensureSessionDir(projectDir, "feat-auth");

        expect(pathExists(joinPath(projectDir, ".goopspec", "sessions", "feat-auth"))).toBe(true);
        expect(pathExists(joinPath(projectDir, ".goopspec", "sessions", "feat-auth", "checkpoints"))).toBe(true);
        expect(pathExists(joinPath(projectDir, ".goopspec", "sessions", "feat-auth", "history"))).toBe(true);
      } finally {
        rmSync(projectDir, { recursive: true, force: true });
      }
    });

    it("should no-op for empty and missing session ids", async () => {
      const projectDir = mkdtempSync(joinPath(tmpdir(), "goopspec-paths-"));

      try {
        await ensureSessionDir(projectDir, "");
        await ensureSessionDir(projectDir);

        expect(pathExists(joinPath(projectDir, ".goopspec", "sessions"))).toBe(false);
      } finally {
        rmSync(projectDir, { recursive: true, force: true });
      }
    });
  });
});
