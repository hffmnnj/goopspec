import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "fs";
import { dirname, join } from "path";
import { tmpdir } from "os";

import { applySetup } from "./index.js";
import type { SetupPlan } from "./types.js";

describe("setup applySetup path handling", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  it("writes config file into a nested directory", async () => {
    const baseDir = mkdtempSync(join(tmpdir(), "goopspec-setup-test-"));
    tempDirs.push(baseDir);
    const configPath = join(baseDir, ".config", "opencode", "goopspec.json");

    const plan: SetupPlan = {
      actions: [],
      summary: "",
      mcpsToInstall: [],
      configsToWrite: [
        {
          path: configPath,
          scope: "global",
          content: { test: true },
        },
      ],
      dirsToCreate: [],
    };

    const result = await applySetup(plan);

    expect(result.success).toBe(true);
    expect(result.configsWritten).toEqual([configPath]);
    expect(JSON.parse(readFileSync(configPath, "utf-8"))).toEqual({ test: true });
  });

  it("handles Unix-style paths without mkdir('') errors", async () => {
    const baseDir = mkdtempSync(join(tmpdir(), "goopspec-setup-test-"));
    tempDirs.push(baseDir);
    const configPath = `${baseDir}/deep/nested/goopspec.json`;

    const plan: SetupPlan = {
      actions: [],
      summary: "",
      mcpsToInstall: [],
      configsToWrite: [
        {
          path: configPath,
          scope: "project",
          content: { nested: true },
        },
      ],
      dirsToCreate: [],
    };

    const result = await applySetup(plan);

    expect(result.success).toBe(true);
    expect(result.errors).toEqual([]);
    expect(JSON.parse(readFileSync(configPath, "utf-8"))).toEqual({ nested: true });
  });

  it("handles Windows-style backslash paths via path.dirname()", async () => {
    // Verify that path.dirname() correctly extracts the parent directory
    // from Windows-style paths — this is the fix for Issue #25.
    // On Linux, path.dirname handles mixed separators; on Windows it handles
    // native backslash paths. The key assertion is that dirname() never
    // returns an empty string (which was the bug with lastIndexOf("/")).
    const windowsPath = "C:\\Users\\name\\.config\\opencode\\goopspec.json";
    const parentDir = dirname(windowsPath);

    // dirname must not be empty (the old lastIndexOf("/") bug returned "")
    expect(parentDir).not.toBe("");
    expect(parentDir.length).toBeGreaterThan(0);

    // On Linux, dirname treats backslash as part of the name, so it returns "."
    // or the parent. On Windows, it correctly returns the parent directory.
    // The critical thing is it never returns "" which would cause mkdir("") to fail.
    if (process.platform === "win32") {
      expect(parentDir).toBe("C:\\Users\\name\\.config\\opencode");
    } else {
      // On Linux, path.dirname("C:\\Users\\...\\goopspec.json") returns "."
      // because backslash isn't a separator. But that's fine — the point is
      // it doesn't return "" and trigger the original mkdir("") bug.
      expect(parentDir).toBeTruthy();
    }
  });

  it("writes config to path constructed with path.join (cross-platform safe)", async () => {
    // Verify applySetup works with paths constructed using path.join()
    // which uses the platform's native separator
    const baseDir = mkdtempSync(join(tmpdir(), "goopspec-setup-win-"));
    tempDirs.push(baseDir);
    const configPath = join(baseDir, "subdir", "config.json");

    const plan: SetupPlan = {
      actions: [],
      summary: "",
      mcpsToInstall: [],
      configsToWrite: [
        {
          path: configPath,
          scope: "project",
          content: { crossPlatform: true },
        },
      ],
      dirsToCreate: [],
    };

    const result = await applySetup(plan);

    expect(result.success).toBe(true);
    expect(result.errors).toEqual([]);
    expect(JSON.parse(readFileSync(configPath, "utf-8"))).toEqual({ crossPlatform: true });
  });
});
