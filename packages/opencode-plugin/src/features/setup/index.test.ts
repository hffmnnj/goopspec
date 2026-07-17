import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { StateManager } from "../../core/types.js";
import { createMockStateManager, setupTestEnvironment } from "../../test-utils.js";
import { CURRENT_SCHEMA_VERSION } from "../db/migrations.js";
import {
  DEFAULT_MODEL_MAP,
  THINKING_LEVELS,
  detect,
  ensureGitignoreEntry,
  formatModelInfo,
  getEffectiveModelMap,
  getStatus,
  init,
  loadMergedConfig,
  normalizeConfig,
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

    it("updateConfig round-trips enforcement", () => {
      const merged = updateConfig(testDir, { enforcement: "strict" });
      expect(merged.enforcement).toBe("strict");
      expect(readConfig(testDir)?.enforcement).toBe("strict");
    });

    it("updateConfig round-trips adlEnabled including false", () => {
      let merged = updateConfig(testDir, { adlEnabled: true });
      expect(merged.adlEnabled).toBe(true);
      expect(readConfig(testDir)?.adlEnabled).toBe(true);

      merged = updateConfig(testDir, { adlEnabled: false });
      expect(merged.adlEnabled).toBe(false);
      expect(readConfig(testDir)?.adlEnabled).toBe(false);
    });
  });

  // =========================================================================
  // models (MH16)
  // =========================================================================

  describe("models", () => {
    const origGlobalPath = process.env.GOOPSPEC_GLOBAL_CONFIG_PATH;

    beforeEach(() => {
      // Isolate from the real global config so built-in defaults are predictable.
      process.env.GOOPSPEC_GLOBAL_CONFIG_PATH = join(testDir, "nonexistent-global.json");
    });

    afterEach(() => {
      if (origGlobalPath === undefined) {
        Reflect.deleteProperty(process.env, "GOOPSPEC_GLOBAL_CONFIG_PATH");
      } else {
        process.env.GOOPSPEC_GLOBAL_CONFIG_PATH = origGlobalPath;
      }
    });

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
      // DB schema version matches CURRENT_SCHEMA_VERSION from migrations.ts
      expect(status.stateVersion).toBe(CURRENT_SCHEMA_VERSION);
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

  // =========================================================================
  // normalizeConfig
  // =========================================================================

  describe("normalizeConfig", () => {
    it("passes through enforcement values that are valid", () => {
      expect(normalizeConfig({ enforcement: "assist" }).enforcement).toBe("assist");
      expect(normalizeConfig({ enforcement: "warn" }).enforcement).toBe("warn");
      expect(normalizeConfig({ enforcement: "strict" }).enforcement).toBe("strict");
    });

    it("ignores invalid enforcement values", () => {
      expect(normalizeConfig({ enforcement: "invalid" }).enforcement).toBeUndefined();
      expect(normalizeConfig({ enforcement: 42 }).enforcement).toBeUndefined();
      expect(normalizeConfig({ enforcement: true }).enforcement).toBeUndefined();
    });

    it("passes through adlEnabled booleans", () => {
      expect(normalizeConfig({ adlEnabled: true }).adlEnabled).toBe(true);
      expect(normalizeConfig({ adlEnabled: false }).adlEnabled).toBe(false);
    });

    it("ignores non-boolean adlEnabled values", () => {
      expect(normalizeConfig({ adlEnabled: "yes" }).adlEnabled).toBeUndefined();
      expect(normalizeConfig({ adlEnabled: 1 }).adlEnabled).toBeUndefined();
    });

    it("passes through new-format agentModels unchanged", () => {
      const result = normalizeConfig({
        defaultModel: "openai/gpt-4o",
        agentModels: { orchestrator: "anthropic/claude-opus-4-6", "executor-low": "model-x" },
      });
      expect(result.defaultModel).toBe("openai/gpt-4o");
      expect(result.agentModels?.orchestrator).toBe("anthropic/claude-opus-4-6");
      expect(result.agentModels?.["executor-low"]).toBe("model-x");
    });

    it("normalizes old agents format — strips goop- prefix", () => {
      const result = normalizeConfig({
        agents: {
          "goop-orchestrator": { model: "anthropic/claude-opus-4-6", temperature: 0.1 },
          "goop-executor-low": { model: "anthropic/claude-sonnet-4-6", temperature: 0.2 },
        },
      });
      expect(result.agentModels?.orchestrator).toBe("anthropic/claude-opus-4-6");
      expect(result.agentModels?.["executor-low"]).toBe("anthropic/claude-sonnet-4-6");
    });

    it("agentModels wins over agents when both present", () => {
      const result = normalizeConfig({
        agentModels: { orchestrator: "new-model" },
        agents: { "goop-orchestrator": { model: "old-model", temperature: 0.1 } },
      });
      expect(result.agentModels?.orchestrator).toBe("new-model");
    });

    it("normalizes old orchestrator.model top-level field", () => {
      const result = normalizeConfig({
        orchestrator: { model: "anthropic/claude-opus-4-6" },
      });
      expect(result.agentModels?.orchestrator).toBe("anthropic/claude-opus-4-6");
    });

    it("orchestrator.model does not override agentModels.orchestrator", () => {
      const result = normalizeConfig({
        agentModels: { orchestrator: "preferred-model" },
        orchestrator: { model: "fallback-model" },
      });
      expect(result.agentModels?.orchestrator).toBe("preferred-model");
    });

    it("ignores unknown keys without crashing", () => {
      const result = normalizeConfig({
        unknownKey: "value",
        anotherUnknown: { nested: true },
        defaultModel: "openai/gpt-4o",
      });
      expect(result.defaultModel).toBe("openai/gpt-4o");
      expect((result as Record<string, unknown>).unknownKey).toBeUndefined();
    });

    it("skips non-string model values in agentModels", () => {
      const result = normalizeConfig({
        agentModels: { orchestrator: 42, "executor-low": "valid-model" },
      });
      expect(result.agentModels?.orchestrator).toBeUndefined();
      expect(result.agentModels?.["executor-low"]).toBe("valid-model");
    });

    it("expands goop-executor-frontend to both frontend tiers", () => {
      const result = normalizeConfig({
        agents: {
          "goop-executor-frontend": { model: "anthropic/claude-opus-4-6", temperature: 0.1 },
        },
      });
      expect(result.agentModels?.["executor-frontend-high"]).toBe("anthropic/claude-opus-4-6");
      expect(result.agentModels?.["executor-frontend-low"]).toBe("anthropic/claude-opus-4-6");
      // The partial name should not appear as a key
      expect(result.agentModels?.["executor-frontend"]).toBeUndefined();
    });

    it("expands goop-executor (plain) to executor-medium", () => {
      const result = normalizeConfig({
        agents: {
          "goop-executor": { model: "anthropic/claude-sonnet-4-6", temperature: 0.3 },
        },
      });
      expect(result.agentModels?.["executor-medium"]).toBe("anthropic/claude-sonnet-4-6");
      // The partial name should not appear as a key
      expect(result.agentModels?.executor).toBeUndefined();
    });

    it("skips and logs unknown agent roles like goop-designer", () => {
      const errors: string[] = [];
      const origError = console.error;
      console.error = (...args: unknown[]) => {
        errors.push(args.map(String).join(" "));
      };
      try {
        const result = normalizeConfig({
          agents: {
            "goop-designer": { model: "anthropic/claude-opus-4-6" },
            "goop-orchestrator": { model: "anthropic/claude-opus-4-6" },
          },
        });
        // designer should be skipped
        expect(result.agentModels?.designer).toBeUndefined();
        // orchestrator should still be present
        expect(result.agentModels?.orchestrator).toBe("anthropic/claude-opus-4-6");
        // An error should have been logged for designer
        expect(errors.some((e) => e.includes("designer"))).toBe(true);
      } finally {
        console.error = origError;
      }
    });

    it("preserves orchestrator.thinkingBudget in agentThinkingBudgets", () => {
      const result = normalizeConfig({
        orchestrator: { model: "anthropic/claude-opus-4-6", thinkingBudget: 32000 },
      });
      expect(result.agentThinkingBudgets?.orchestrator).toBe(32000);
      expect(result.agentModels?.orchestrator).toBe("anthropic/claude-opus-4-6");
    });

    it("ignores non-numeric thinkingBudget values", () => {
      const result = normalizeConfig({
        orchestrator: { model: "anthropic/claude-opus-4-6", thinkingBudget: "not-a-number" },
      });
      expect(result.agentThinkingBudgets).toBeUndefined();
    });

    it("normalizes agentThinkingLevels to canonical lowercase values", () => {
      const result = normalizeConfig({
        agentThinkingLevels: {
          orchestrator: "High",
          "executor-low": "LoW",
          researcher: "MEDIUM",
          debugger: "none",
          tester: "xHigh",
        },
      });
      expect(result.agentThinkingLevels?.orchestrator).toBe("high");
      expect(result.agentThinkingLevels?.["executor-low"]).toBe("low");
      expect(result.agentThinkingLevels?.researcher).toBe("medium");
      expect(result.agentThinkingLevels?.debugger).toBe("none");
      expect(result.agentThinkingLevels?.tester).toBe("xhigh");
    });

    it("rejects unknown agentThinkingLevels with a diagnostic", () => {
      const errors: string[] = [];
      const origError = console.error;
      console.error = (...args: unknown[]) => {
        errors.push(args.map(String).join(" "));
      };
      try {
        const result = normalizeConfig({
          agentThinkingLevels: {
            orchestrator: "high",
            explorer: "extreme",
            planner: "ultra",
          },
        });
        expect(result.agentThinkingLevels?.orchestrator).toBe("high");
        expect(result.agentThinkingLevels?.explorer).toBeUndefined();
        expect(result.agentThinkingLevels?.planner).toBeUndefined();
        expect(errors.some((e) => e.includes('unknown thinking level "extreme"'))).toBe(true);
        expect(errors.some((e) => e.includes('unknown thinking level "ultra"'))).toBe(true);
      } finally {
        console.error = origError;
      }
    });

    it("skips non-string agentThinkingLevels values", () => {
      const result = normalizeConfig({
        agentThinkingLevels: {
          orchestrator: "high",
          explorer: 42 as unknown as string,
          planner: { level: "low" } as unknown as string,
        },
      });
      expect(result.agentThinkingLevels?.orchestrator).toBe("high");
      expect(result.agentThinkingLevels?.explorer).toBeUndefined();
      expect(result.agentThinkingLevels?.planner).toBeUndefined();
    });

    it("trims whitespace around agentThinkingLevels values", () => {
      const result = normalizeConfig({
        agentThinkingLevels: {
          orchestrator: "  High  ",
          "executor-low": " low\t",
        },
      });
      expect(result.agentThinkingLevels?.orchestrator).toBe("high");
      expect(result.agentThinkingLevels?.["executor-low"]).toBe("low");
    });
  });

  // =========================================================================
  // loadMergedConfig
  // =========================================================================

  describe("loadMergedConfig", () => {
    const origEnv = process.env.GOOPSPEC_GLOBAL_CONFIG_PATH;

    afterEach(() => {
      if (origEnv === undefined) {
        Reflect.deleteProperty(process.env, "GOOPSPEC_GLOBAL_CONFIG_PATH");
      } else {
        process.env.GOOPSPEC_GLOBAL_CONFIG_PATH = origEnv;
      }
    });

    it("returns empty config when no config files exist", () => {
      const freshDir = join(testDir, "no-configs");
      mkdirSync(join(freshDir, ".goopspec"), { recursive: true });
      process.env.GOOPSPEC_GLOBAL_CONFIG_PATH = join(freshDir, "nonexistent-global.json");

      const result = loadMergedConfig(freshDir);
      expect(result).toEqual({});
    });

    it("reads from project root goopspec.json", () => {
      const freshDir = join(testDir, "project-root-config");
      mkdirSync(join(freshDir, ".goopspec"), { recursive: true });
      process.env.GOOPSPEC_GLOBAL_CONFIG_PATH = join(freshDir, "nonexistent-global.json");

      writeFileSync(
        join(freshDir, "goopspec.json"),
        JSON.stringify({ defaultModel: "openai/gpt-4o", projectName: "my-app" }),
      );

      const result = loadMergedConfig(freshDir);
      expect(result.defaultModel).toBe("openai/gpt-4o");
      expect(result.projectName).toBe("my-app");
    });

    it("reads from global config path", () => {
      const freshDir = join(testDir, "global-config");
      mkdirSync(join(freshDir, ".goopspec"), { recursive: true });
      const globalPath = join(freshDir, "global-goopspec.json");
      process.env.GOOPSPEC_GLOBAL_CONFIG_PATH = globalPath;

      writeFileSync(globalPath, JSON.stringify({ defaultModel: "global-model" }));

      const result = loadMergedConfig(freshDir);
      expect(result.defaultModel).toBe("global-model");
    });

    it("project root overrides internal config", () => {
      const freshDir = join(testDir, "priority-project-over-internal");
      mkdirSync(join(freshDir, ".goopspec"), { recursive: true });
      process.env.GOOPSPEC_GLOBAL_CONFIG_PATH = join(freshDir, "nonexistent-global.json");

      writeFileSync(
        join(freshDir, ".goopspec", "config.json"),
        JSON.stringify({ defaultModel: "internal-model" }),
      );
      writeFileSync(
        join(freshDir, "goopspec.json"),
        JSON.stringify({ defaultModel: "project-model" }),
      );

      const result = loadMergedConfig(freshDir);
      expect(result.defaultModel).toBe("project-model");
    });

    it("internal config overrides global config", () => {
      const freshDir = join(testDir, "priority-internal-over-global");
      mkdirSync(join(freshDir, ".goopspec"), { recursive: true });
      const globalPath = join(freshDir, "global-goopspec.json");
      process.env.GOOPSPEC_GLOBAL_CONFIG_PATH = globalPath;

      writeFileSync(globalPath, JSON.stringify({ defaultModel: "global-model" }));
      writeFileSync(
        join(freshDir, ".goopspec", "config.json"),
        JSON.stringify({ defaultModel: "internal-model" }),
      );

      const result = loadMergedConfig(freshDir);
      expect(result.defaultModel).toBe("internal-model");
    });

    it("merges agentModels across sources — higher priority wins per role", () => {
      const freshDir = join(testDir, "merge-agent-models");
      mkdirSync(join(freshDir, ".goopspec"), { recursive: true });
      const globalPath = join(freshDir, "global-goopspec.json");
      process.env.GOOPSPEC_GLOBAL_CONFIG_PATH = globalPath;

      writeFileSync(
        globalPath,
        JSON.stringify({
          agentModels: { orchestrator: "global-orch", "executor-low": "global-low" },
        }),
      );
      writeFileSync(
        join(freshDir, "goopspec.json"),
        JSON.stringify({ agentModels: { orchestrator: "project-orch" } }),
      );

      const result = loadMergedConfig(freshDir);
      expect(result.agentModels?.orchestrator).toBe("project-orch");
      expect(result.agentModels?.["executor-low"]).toBe("global-low");
    });

    it("normalizes old agents format from project root goopspec.json", () => {
      const freshDir = join(testDir, "old-format-project");
      mkdirSync(join(freshDir, ".goopspec"), { recursive: true });
      process.env.GOOPSPEC_GLOBAL_CONFIG_PATH = join(freshDir, "nonexistent-global.json");

      writeFileSync(
        join(freshDir, "goopspec.json"),
        JSON.stringify({
          agents: {
            "goop-orchestrator": { model: "anthropic/claude-opus-4-6", temperature: 0.1 },
            "goop-executor-low": { model: "anthropic/claude-sonnet-4-6", temperature: 0.2 },
          },
        }),
      );

      const result = loadMergedConfig(freshDir);
      expect(result.agentModels?.orchestrator).toBe("anthropic/claude-opus-4-6");
      expect(result.agentModels?.["executor-low"]).toBe("anthropic/claude-sonnet-4-6");
    });

    it("normalizes old orchestrator.model field", () => {
      const freshDir = join(testDir, "old-orch-model");
      mkdirSync(join(freshDir, ".goopspec"), { recursive: true });
      process.env.GOOPSPEC_GLOBAL_CONFIG_PATH = join(freshDir, "nonexistent-global.json");

      writeFileSync(
        join(freshDir, "goopspec.json"),
        JSON.stringify({ orchestrator: { model: "anthropic/claude-opus-4-6" } }),
      );

      const result = loadMergedConfig(freshDir);
      expect(result.agentModels?.orchestrator).toBe("anthropic/claude-opus-4-6");
    });

    it("mixed old and new format — agentModels wins over agents", () => {
      const freshDir = join(testDir, "mixed-format");
      mkdirSync(join(freshDir, ".goopspec"), { recursive: true });
      process.env.GOOPSPEC_GLOBAL_CONFIG_PATH = join(freshDir, "nonexistent-global.json");

      writeFileSync(
        join(freshDir, "goopspec.json"),
        JSON.stringify({
          agentModels: { orchestrator: "new-model" },
          agents: { "goop-orchestrator": { model: "old-model", temperature: 0.1 } },
        }),
      );

      const result = loadMergedConfig(freshDir);
      expect(result.agentModels?.orchestrator).toBe("new-model");
    });

    it("skips invalid JSON files gracefully", () => {
      const freshDir = join(testDir, "invalid-json");
      mkdirSync(join(freshDir, ".goopspec"), { recursive: true });
      process.env.GOOPSPEC_GLOBAL_CONFIG_PATH = join(freshDir, "nonexistent-global.json");

      writeFileSync(join(freshDir, "goopspec.json"), "{ not valid json }");
      writeFileSync(
        join(freshDir, ".goopspec", "config.json"),
        JSON.stringify({ defaultModel: "fallback-model" }),
      );

      const result = loadMergedConfig(freshDir);
      expect(result.defaultModel).toBe("fallback-model");
    });

    it("getEffectiveModelMap uses merged config from all sources", () => {
      const freshDir = join(testDir, "effective-merged");
      mkdirSync(join(freshDir, ".goopspec"), { recursive: true });
      process.env.GOOPSPEC_GLOBAL_CONFIG_PATH = join(freshDir, "nonexistent-global.json");

      writeFileSync(
        join(freshDir, "goopspec.json"),
        JSON.stringify({ agentModels: { orchestrator: "project-orch-model" } }),
      );

      const map = getEffectiveModelMap(freshDir);
      expect(map.orchestrator).toBe("project-orch-model");
      // Other roles still get defaults
      expect(map["executor-low"]).toBe("anthropic/claude-sonnet-4-6");
    });

    it("deep-merges agentThinkingBudgets across sources", () => {
      const freshDir = join(testDir, "merge-thinking-budgets");
      mkdirSync(join(freshDir, ".goopspec"), { recursive: true });
      const globalPath = join(freshDir, "global-goopspec.json");
      process.env.GOOPSPEC_GLOBAL_CONFIG_PATH = globalPath;

      writeFileSync(
        globalPath,
        JSON.stringify({
          orchestrator: { model: "anthropic/claude-opus-4-6", thinkingBudget: 16000 },
        }),
      );
      writeFileSync(
        join(freshDir, "goopspec.json"),
        JSON.stringify({
          orchestrator: { model: "anthropic/claude-opus-4-6", thinkingBudget: 32000 },
        }),
      );

      const result = loadMergedConfig(freshDir);
      // Project root (highest priority) should win
      expect(result.agentThinkingBudgets?.orchestrator).toBe(32000);
    });

    it("deep-merges agentThinkingLevels across sources — higher priority wins per role", () => {
      const freshDir = join(testDir, "merge-thinking-levels");
      mkdirSync(join(freshDir, ".goopspec"), { recursive: true });
      const globalPath = join(freshDir, "global-goopspec.json");
      process.env.GOOPSPEC_GLOBAL_CONFIG_PATH = globalPath;

      writeFileSync(
        globalPath,
        JSON.stringify({
          agentThinkingLevels: { orchestrator: "low", "executor-low": "low" },
        }),
      );
      writeFileSync(
        join(freshDir, "goopspec.json"),
        JSON.stringify({ agentThinkingLevels: { orchestrator: "high" } }),
      );

      const result = loadMergedConfig(freshDir);
      expect(result.agentThinkingLevels?.orchestrator).toBe("high");
      expect(result.agentThinkingLevels?.["executor-low"]).toBe("low");
      expect(result.agentThinkingLevels?.orchestrator).toSatisfy(
        (level: string | undefined) =>
          level != null && THINKING_LEVELS.includes(level as (typeof THINKING_LEVELS)[number]),
      );
      expect(result.agentThinkingLevels?.["executor-low"]).toSatisfy(
        (level: string | undefined) =>
          level != null && THINKING_LEVELS.includes(level as (typeof THINKING_LEVELS)[number]),
      );
    });

    it("normalizes agentThinkingLevels from mixed-case project config", () => {
      const freshDir = join(testDir, "thinking-levels-mixed-case");
      mkdirSync(join(freshDir, ".goopspec"), { recursive: true });
      process.env.GOOPSPEC_GLOBAL_CONFIG_PATH = join(freshDir, "nonexistent-global.json");

      writeFileSync(
        join(freshDir, "goopspec.json"),
        JSON.stringify({
          agentThinkingLevels: {
            orchestrator: "XHIGH",
            researcher: "Medium",
            explorer: "  low  ",
            planner: "unknown-level",
          },
        }),
      );

      const errors: string[] = [];
      const origError = console.error;
      console.error = (...args: unknown[]) => {
        errors.push(args.map(String).join(" "));
      };
      try {
        const result = loadMergedConfig(freshDir);
        expect(result.agentThinkingLevels?.orchestrator).toBe("xhigh");
        expect(result.agentThinkingLevels?.researcher).toBe("medium");
        expect(result.agentThinkingLevels?.explorer).toBe("low");
        expect(result.agentThinkingLevels?.planner).toBeUndefined();
        expect(errors.some((e) => e.includes('unknown thinking level "unknown-level"'))).toBe(true);
      } finally {
        console.error = origError;
      }
    });
  });
});
