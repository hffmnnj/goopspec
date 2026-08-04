import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { PluginContext } from "../../core/types.js";
import { readConfig } from "../../features/setup/index.js";
import {
  createMockPluginContext,
  createMockToolContext,
  setupTestEnvironment,
} from "../../test-utils.js";
import { createGoopSetupTool } from "./index.js";

describe("goop_setup tool", () => {
  let testDir: string;
  let cleanup: () => void;
  let ctx: PluginContext;

  beforeEach(() => {
    const env = setupTestEnvironment("goop-setup-tool");
    testDir = env.testDir;
    cleanup = env.cleanup;
    ctx = createMockPluginContext({ testDir });
  });

  afterEach(() => cleanup());

  async function exec(args: Record<string, unknown>): Promise<string> {
    const toolDef = createGoopSetupTool(ctx);
    const result = await toolDef.execute(args, createMockToolContext({ directory: testDir }));
    return typeof result === "string" ? result : result.output;
  }

  // =========================================================================
  // detect
  // =========================================================================

  describe("detect action", () => {
    it("returns environment detection markdown", async () => {
      const result = await exec({ action: "detect" });
      expect(result).toContain("Environment Detection");
      expect(result).toContain(".goopspec/");
      expect(result).toContain("Available Actions");
    });

    it("detects package.json when present", async () => {
      writeFileSync(
        join(testDir, "package.json"),
        JSON.stringify({ name: "test-app", dependencies: { react: "^18" } }),
      );
      const result = await exec({ action: "detect" });
      expect(result).toContain("test-app");
      expect(result).toContain("React");
    });
  });

  // =========================================================================
  // init
  // =========================================================================

  describe("init action", () => {
    it("creates .goopspec structure", async () => {
      const freshDir = join(testDir, "init-test");
      mkdirSync(freshDir, { recursive: true });
      const freshCtx = createMockPluginContext({ testDir: freshDir });
      const toolDef = createGoopSetupTool(freshCtx);

      const result = await toolDef.execute(
        { action: "init", projectName: "my-project" },
        createMockToolContext({ directory: freshDir }),
      );

      expect(result).toContain("Initialisation");
      expect(result).toContain("successfully");
      expect(existsSync(join(freshDir, ".goopspec", "config.json"))).toBe(true);
    });

    it("writes project name to config", async () => {
      const freshDir = join(testDir, "name-test");
      mkdirSync(freshDir, { recursive: true });
      const freshCtx = createMockPluginContext({ testDir: freshDir });
      const toolDef = createGoopSetupTool(freshCtx);

      await toolDef.execute(
        { action: "init", projectName: "named-proj" },
        createMockToolContext({ directory: freshDir }),
      );

      const config = readConfig(freshDir);
      expect(config?.projectName).toBe("named-proj");
    });

    it("plan and apply are aliases for init", async () => {
      const freshDir = join(testDir, "alias-test");
      mkdirSync(freshDir, { recursive: true });
      const freshCtx = createMockPluginContext({ testDir: freshDir });
      const toolDef = createGoopSetupTool(freshCtx);

      const result = await toolDef.execute(
        { action: "plan", projectName: "alias-proj" },
        createMockToolContext({ directory: freshDir }),
      );

      expect(result).toContain("Initialisation");
      expect(existsSync(join(freshDir, ".goopspec", "config.json"))).toBe(true);
    });
  });

  // =========================================================================
  // models (MH16)
  // =========================================================================

  describe("models action", () => {
    it("returns model configuration table", async () => {
      const result = await exec({ action: "models" });
      expect(result).toContain("Agent Model Configuration");
      expect(result).toContain("orchestrator");
      expect(result).toContain("executor-low");
      expect(result).toContain("executor-high");
    });

    it("updates config when agentModels provided", async () => {
      // First init so config exists
      await exec({ action: "init", projectName: "model-test" });

      await exec({
        action: "models",
        agentModels: { "executor-low": "openai/gpt-4o-mini" },
      });

      const config = readConfig(testDir);
      expect(config?.agentModels?.["executor-low"]).toBe("openai/gpt-4o-mini");
    });

    it("updates config when defaultModel provided", async () => {
      await exec({ action: "init", projectName: "default-model-test" });

      await exec({ action: "models", defaultModel: "openai/gpt-4o" });

      const config = readConfig(testDir);
      expect(config?.defaultModel).toBe("openai/gpt-4o");
    });

    it("shows source column indicating overrides vs defaults", async () => {
      await exec({ action: "init", projectName: "source-test" });
      await exec({
        action: "models",
        agentModels: { orchestrator: "custom/model" },
      });

      const result = await exec({ action: "models" });
      expect(result).toContain("config override");
      expect(result).toContain("built-in");
    });
  });

  // =========================================================================
  // verify
  // =========================================================================

  describe("verify action", () => {
    it("passes for initialised project", async () => {
      await exec({ action: "init", projectName: "verify-test" });
      const result = await exec({ action: "verify" });
      expect(result).toContain("Verification");
      expect(result).toContain("All checks passed");
    });

    it("fails for uninitialised project", async () => {
      const freshDir = join(testDir, "uninitialized");
      mkdirSync(freshDir, { recursive: true });
      const freshCtx = createMockPluginContext({ testDir: freshDir });
      const toolDef = createGoopSetupTool(freshCtx);

      const result = await toolDef.execute(
        { action: "verify" },
        createMockToolContext({ directory: freshDir }),
      );

      expect(result).toContain("FAIL");
      expect(result).toContain("Suggested Fixes");
    });
  });

  // =========================================================================
  // status
  // =========================================================================

  describe("status action", () => {
    it("shows uninitialised status", async () => {
      const freshDir = join(testDir, "status-empty");
      mkdirSync(freshDir, { recursive: true });
      const freshCtx = createMockPluginContext({ testDir: freshDir });
      const toolDef = createGoopSetupTool(freshCtx);

      const result = await toolDef.execute(
        { action: "status" },
        createMockToolContext({ directory: freshDir }),
      );

      expect(result).toContain("Configuration Status");
      expect(result).toContain("No");
    });

    it("shows initialised status with config", async () => {
      await exec({ action: "init", projectName: "status-proj" });
      const result = await exec({ action: "status" });
      expect(result).toContain("Configuration Status");
      expect(result).toContain("Yes");
      expect(result).toContain("status-proj");
    });
  });

  // =========================================================================
  // reset
  // =========================================================================

  describe("reset action", () => {
    it("requires confirmation", async () => {
      const result = await exec({ action: "reset" });
      expect(result).toContain("confirmed");
    });

    it("resets config with confirmation", async () => {
      await exec({ action: "init", projectName: "reset-test", defaultModel: "custom" });
      const result = await exec({ action: "reset", confirmed: true });
      expect(result).toContain("Reset");
      expect(result).toContain("completed");

      const config = readConfig(testDir);
      expect(config?.projectName).toBeUndefined();
    });

    it("destructive reset removes state", async () => {
      await exec({ action: "init", projectName: "destructive" });
      await exec({ action: "reset", confirmed: true, preserveData: false });
      expect(existsSync(join(testDir, ".goopspec", "goopspec.db"))).toBe(false);
    });
  });

  // =========================================================================
  // action-to-argument legality (contract pinning)
  // =========================================================================

  describe("action-to-argument legality", () => {
    it("scope is ignored by every action — supplying it has no observable effect", async () => {
      await exec({ action: "init", projectName: "scope-test" });

      // Run status with and without scope; output must be identical.
      const withoutScope = await exec({ action: "status" });
      const withScope = await exec({ action: "status", scope: "global" });
      expect(withScope).toBe(withoutScope);

      // detect ignores scope too.
      const detectPlain = await exec({ action: "detect" });
      const detectScoped = await exec({ action: "detect", scope: "both" });
      expect(detectScoped).toBe(detectPlain);
    });

    it("detect ignores all config args — projectName/defaultModel/agentModels have no effect", async () => {
      const result = await exec({
        action: "detect",
        projectName: "ignored-name",
        defaultModel: "ignored-model",
        agentModels: { orchestrator: "ignored/model" },
      });
      // detect reports the directory state, not config args.
      expect(result).toContain("Environment Detection");
      expect(result).not.toContain("ignored-name");
    });

    it("verify ignores all config args", async () => {
      await exec({ action: "init", projectName: "verify-real" });
      const result = await exec({
        action: "verify",
        projectName: "wrong-name",
        defaultModel: "wrong-model",
      });
      // verify checks directory/db health, not config args.
      expect(result).toContain("All checks passed");
      expect(result).not.toContain("wrong-name");
    });

    it("status ignores all config args", async () => {
      await exec({ action: "init", projectName: "real-name" });
      const result = await exec({
        action: "status",
        defaultModel: "ignored-model",
        agentModels: { orchestrator: "ignored/model" },
      });
      expect(result).toContain("real-name");
      expect(result).not.toContain("ignored-model");
    });
  });


  describe("gitignore handling", () => {
    it("adds .goopspec to .gitignore when gitignoreGoopspec is true", async () => {
      await exec({ action: "detect", gitignoreGoopspec: true });
      expect(existsSync(join(testDir, ".gitignore"))).toBe(true);
      const content = readFileSync(join(testDir, ".gitignore"), "utf-8");
      expect(content).toContain(".goopspec/");
    });
  });

  // =========================================================================
  // error handling
  // =========================================================================

  describe("error handling", () => {
    it("returns error string instead of throwing", async () => {
      const result = await exec({ action: "unknown-action" as string });
      expect(result).toContain("Unknown action");
    });

    it("never throws from execute", async () => {
      // Even with bad state, should return string
      const toolDef = createGoopSetupTool(ctx);
      const result = await toolDef.execute(
        { action: "detect" },
        createMockToolContext({ directory: "/nonexistent/path/that/does/not/exist" }),
      );
      expect(typeof result).toBe("string");
    });
  });
});
