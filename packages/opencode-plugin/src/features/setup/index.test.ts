import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { StateManager } from "../../core/types.js";
import { createMockStateManager, setupTestEnvironment } from "../../test-utils.js";
import {
  DEFAULT_MODEL_MAP,
  detect,
  ensureGitignoreEntry,
  formatModelInfo,
  getEffectiveModelMap,
  getStatus,
  init,
  readConfig,
  reset,
  updateConfig,
  verify,
  writeConfig,
} from "./index.js";
import type { GoopConfig } from "./index.js";

describe("setup feature", () => {
  let testDir: string;
  let cleanup: () => void;
  let stateManager: StateManager;

  beforeEach(() => {
    const env = setupTestEnvironment("setup-feature");
    testDir = env.testDir;
    cleanup = env.cleanup;
    stateManager = createMockStateManager();
  });

  afterEach(() => cleanup());

  // =========================================================================
  // detect
  // =========================================================================

  describe("detect", () => {
    it("detects existing .goopspec directory", () => {
      // init creates goopspec.db on disk
      init(testDir, stateManager);
      const result = detect(testDir);
      expect(result.hasGoopspecDir).toBe(true);
      expect(result.hasStateFile).toBe(true);
      expect(result.goopspecDir).toContain(".goopspec");
    });

    it("detects missing .goopspec in empty dir", () => {
      const emptyDir = join(testDir, "empty-project");
      mkdirSync(emptyDir, { recursive: true });
      const result = detect(emptyDir);
      expect(result.hasGoopspecDir).toBe(false);
      expect(result.hasStateFile).toBe(false);
      expect(result.hasConfigFile).toBe(false);
    });

    it("detects package.json and extracts project name", () => {
      writeFileSync(
        join(testDir, "package.json"),
        JSON.stringify({ name: "my-project", dependencies: { typescript: "^5.0.0" } }),
      );
      const result = detect(testDir);
      expect(result.hasPackageJson).toBe(true);
      expect(result.projectName).toBe("my-project");
      expect(result.detectedStack).toContain("typescript");
    });

    it("detects bun runtime from bun.lockb", () => {
      writeFileSync(join(testDir, "package.json"), JSON.stringify({ name: "bun-proj" }));
      writeFileSync(join(testDir, "bun.lockb"), "");
      const result = detect(testDir);
      expect(result.detectedStack).toContain("bun");
    });

    it("detects frameworks from dependencies", () => {
      writeFileSync(
        join(testDir, "package.json"),
        JSON.stringify({ name: "web-app", dependencies: { react: "^18", next: "^14" } }),
      );
      const result = detect(testDir);
      expect(result.detectedStack).toContain("React");
      expect(result.detectedStack).toContain("Next.js");
    });

    it("falls back to directory name when no package.json", () => {
      const subDir = join(testDir, "my-cool-project");
      mkdirSync(subDir, { recursive: true });
      const result = detect(subDir);
      expect(result.projectName).toBe("my-cool-project");
    });

    it("handles malformed package.json gracefully", () => {
      writeFileSync(join(testDir, "package.json"), "not json");
      const result = detect(testDir);
      expect(result.hasPackageJson).toBe(true);
      // Should not throw, falls back to dir name
      expect(result.projectName).toBeDefined();
    });
  });

  // =========================================================================
  // init
  // =========================================================================

  describe("init", () => {
    it("creates .goopspec structure and config", () => {
      const freshDir = join(testDir, "fresh-project");
      mkdirSync(freshDir, { recursive: true });
      const freshMgr = createMockStateManager();

      const result = init(freshDir, freshMgr, { projectName: "test-proj" });
      expect(result.success).toBe(true);
      expect(result.created.length).toBeGreaterThan(0);
      expect(existsSync(join(freshDir, ".goopspec"))).toBe(true);
      expect(existsSync(join(freshDir, ".goopspec", "config.json"))).toBe(true);
    });

    it("writes config with provided options", () => {
      const freshDir = join(testDir, "config-test");
      mkdirSync(freshDir, { recursive: true });
      const freshMgr = createMockStateManager();

      init(freshDir, freshMgr, {
        projectName: "my-app",
        defaultModel: "openai/gpt-4o",
        agentModels: { "executor-low": "anthropic/claude-sonnet-4-6" },
        memoryEnabled: true,
      });

      const config = readConfig(freshDir);
      expect(config).not.toBeNull();
      expect(config?.projectName).toBe("my-app");
      expect(config?.defaultModel).toBe("openai/gpt-4o");
      expect(config?.agentModels?.["executor-low"]).toBe("anthropic/claude-sonnet-4-6");
      expect(config?.memoryEnabled).toBe(true);
    });

    it("creates checkpoints directory", () => {
      const freshDir = join(testDir, "checkpoints-test");
      mkdirSync(freshDir, { recursive: true });
      const freshMgr = createMockStateManager();

      init(freshDir, freshMgr);
      expect(existsSync(join(freshDir, ".goopspec", "checkpoints"))).toBe(true);
    });

    it("adds .goopspec to .gitignore when requested", () => {
      const freshDir = join(testDir, "gitignore-test");
      mkdirSync(freshDir, { recursive: true });
      const freshMgr = createMockStateManager();

      init(freshDir, freshMgr, { gitignoreGoopspec: true });
      const gitignore = readFileSync(join(freshDir, ".gitignore"), "utf-8");
      expect(gitignore).toContain(".goopspec/");
    });

    it("is idempotent — re-running does not fail", () => {
      const freshDir = join(testDir, "idempotent-test");
      mkdirSync(freshDir, { recursive: true });
      const freshMgr = createMockStateManager();

      const first = init(freshDir, freshMgr, { projectName: "proj" });
      const second = init(freshDir, freshMgr, { projectName: "proj" });
      expect(first.success).toBe(true);
      expect(second.success).toBe(true);
    });
  });

  // =========================================================================
  // config read/write/update
  // =========================================================================

  describe("config", () => {
    it("readConfig returns null for missing config", () => {
      const emptyDir = join(testDir, "no-config");
      mkdirSync(emptyDir, { recursive: true });
      expect(readConfig(emptyDir)).toBeNull();
    });

    it("writeConfig and readConfig round-trip", () => {
      const config: GoopConfig = {
        projectName: "test",
        defaultModel: "openai/gpt-4o",
        memoryEnabled: true,
      };
      writeConfig(testDir, config);
      const read = readConfig(testDir);
      expect(read?.projectName).toBe("test");
      expect(read?.defaultModel).toBe("openai/gpt-4o");
    });

    it("updateConfig merges partial updates", () => {
      writeConfig(testDir, {
        projectName: "original",
        defaultModel: "model-a",
        agentModels: { orchestrator: "model-x" },
      });

      const merged = updateConfig(testDir, {
        defaultModel: "model-b",
        agentModels: { "executor-low": "model-y" },
      });

      expect(merged.projectName).toBe("original");
      expect(merged.defaultModel).toBe("model-b");
      expect(merged.agentModels?.orchestrator).toBe("model-x");
      expect(merged.agentModels?.["executor-low"]).toBe("model-y");
    });

    it("updateConfig creates config if none exists", () => {
      const freshDir = join(testDir, "update-fresh");
      mkdirSync(join(freshDir, ".goopspec"), { recursive: true });

      const result = updateConfig(freshDir, { projectName: "new-proj" });
      expect(result.projectName).toBe("new-proj");
      expect(readConfig(freshDir)?.projectName).toBe("new-proj");
    });
  });

  // =========================================================================
  // models (MH16)
  // =========================================================================

  describe("models", () => {
    it("DEFAULT_MODEL_MAP covers all agent roles", () => {
      const roles = [
        "orchestrator",
        "executor-low",
        "executor-medium",
        "executor-high",
        "executor-frontend-low",
        "executor-frontend-high",
        "planner",
        "verifier",
        "researcher",
        "explorer",
        "debugger",
        "tester",
        "writer",
      ];
      for (const role of roles) {
        expect(DEFAULT_MODEL_MAP[role as keyof typeof DEFAULT_MODEL_MAP]).toBeDefined();
      }
    });

    it("getEffectiveModelMap returns defaults when no config", () => {
      const emptyDir = join(testDir, "no-model-config");
      mkdirSync(emptyDir, { recursive: true });
      const map = getEffectiveModelMap(emptyDir);
      expect(map.orchestrator).toBe("anthropic/claude-opus-4-6");
      expect(map["executor-low"]).toBe("anthropic/claude-sonnet-4-6");
    });

    it("getEffectiveModelMap applies defaultModel override", () => {
      writeConfig(testDir, { defaultModel: "openai/gpt-4o" });
      const map = getEffectiveModelMap(testDir);
      expect(map.orchestrator).toBe("openai/gpt-4o");
      expect(map["executor-low"]).toBe("openai/gpt-4o");
    });

    it("getEffectiveModelMap applies per-role overrides on top of default", () => {
      writeConfig(testDir, {
        defaultModel: "openai/gpt-4o",
        agentModels: { orchestrator: "anthropic/claude-opus-4-6" },
      });
      const map = getEffectiveModelMap(testDir);
      expect(map.orchestrator).toBe("anthropic/claude-opus-4-6");
      expect(map["executor-low"]).toBe("openai/gpt-4o");
    });

    it("formatModelInfo returns markdown with all roles", () => {
      const output = formatModelInfo(testDir);
      expect(output).toContain("Agent Model Configuration");
      expect(output).toContain("orchestrator");
      expect(output).toContain("executor-low");
      expect(output).toContain("executor-high");
    });
  });

  // =========================================================================
  // verify
  // =========================================================================

  describe("verify", () => {
    it("passes all checks for a properly initialised project", () => {
      init(testDir, stateManager, { projectName: "verify-test" });
      const result = verify(testDir);
      expect(result.success).toBe(true);
      expect(result.checks.every((c) => c.passed)).toBe(true);
    });

    it("fails checks for empty directory", () => {
      const emptyDir = join(testDir, "empty-verify");
      mkdirSync(emptyDir, { recursive: true });
      const result = verify(emptyDir);
      expect(result.success).toBe(false);
      expect(result.checks.some((c) => !c.passed)).toBe(true);
    });

    it("reports fix suggestions for failed checks", () => {
      const emptyDir = join(testDir, "fix-suggestions");
      mkdirSync(emptyDir, { recursive: true });
      const result = verify(emptyDir);
      const failed = result.checks.filter((c) => !c.passed);
      expect(failed.length).toBeGreaterThan(0);
      expect(failed.some((c) => c.fix != null)).toBe(true);
    });

    it("checks state version", () => {
      init(testDir, stateManager, { projectName: "version-check" });
      const result = verify(testDir);
      const versionCheck = result.checks.find((c) => c.name === "State Version");
      expect(versionCheck?.passed).toBe(true);
    });
  });

  // =========================================================================
  // status
  // =========================================================================

  describe("getStatus", () => {
    it("reports uninitialised for empty dir", () => {
      const emptyDir = join(testDir, "empty-status");
      mkdirSync(emptyDir, { recursive: true });
      const status = getStatus(emptyDir);
      expect(status.initialized).toBe(false);
      expect(status.config).toBeNull();
    });

    it("reports initialised with config details", () => {
      init(testDir, stateManager, { projectName: "status-test" });
      const status = getStatus(testDir);
      expect(status.initialized).toBe(true);
      expect(status.projectName).toBe("status-test");
      expect(status.config).not.toBeNull();
    });

    it("reads state version and active workflow", () => {
      init(testDir, stateManager);
      const status = getStatus(testDir);
      // DB schema version is 1 (CURRENT_SCHEMA_VERSION from migrations.ts)
      expect(status.stateVersion).toBe(1);
      expect(status.activeWorkflow).toBeDefined();
    });
  });

  // =========================================================================
  // reset
  // =========================================================================

  describe("reset", () => {
    it("requires confirmation", () => {
      const result = reset(testDir);
      expect(result.success).toBe(false);
      expect(result.errors[0]).toContain("confirmed");
    });

    it("resets config while preserving data by default", () => {
      init(testDir, stateManager, {
        projectName: "reset-test",
        defaultModel: "custom-model",
      });

      const result = reset(testDir, { confirmed: true });
      expect(result.success).toBe(true);
      expect(result.reset.length).toBeGreaterThan(0);

      // Config should be reset
      const config = readConfig(testDir);
      expect(config?.projectName).toBeUndefined();
      expect(config?.defaultModel).toBeUndefined();

      // State should be preserved
      expect(result.preserved.length).toBeGreaterThan(0);
    });

    it("destructive reset removes state and checkpoints", () => {
      init(testDir, stateManager, { projectName: "destructive-test" });

      const result = reset(testDir, { confirmed: true, preserveData: false });
      expect(result.success).toBe(true);

      // State DB should be gone
      expect(existsSync(join(testDir, ".goopspec", "goopspec.db"))).toBe(false);
    });
  });

  // =========================================================================
  // ensureGitignoreEntry
  // =========================================================================

  describe("ensureGitignoreEntry", () => {
    it("creates .gitignore if missing", () => {
      const freshDir = join(testDir, "no-gitignore");
      mkdirSync(freshDir, { recursive: true });
      ensureGitignoreEntry(freshDir);
      const content = readFileSync(join(freshDir, ".gitignore"), "utf-8");
      expect(content).toContain(".goopspec/");
    });

    it("appends to existing .gitignore", () => {
      const freshDir = join(testDir, "existing-gitignore");
      mkdirSync(freshDir, { recursive: true });
      writeFileSync(join(freshDir, ".gitignore"), "node_modules/\n");
      ensureGitignoreEntry(freshDir);
      const content = readFileSync(join(freshDir, ".gitignore"), "utf-8");
      expect(content).toContain("node_modules/");
      expect(content).toContain(".goopspec/");
    });

    it("does not duplicate entry", () => {
      const freshDir = join(testDir, "dup-gitignore");
      mkdirSync(freshDir, { recursive: true });
      writeFileSync(join(freshDir, ".gitignore"), ".goopspec/\n");
      ensureGitignoreEntry(freshDir);
      const content = readFileSync(join(freshDir, ".gitignore"), "utf-8");
      const matches = content.match(/\.goopspec/g);
      expect(matches?.length).toBe(1);
    });
  });
});
