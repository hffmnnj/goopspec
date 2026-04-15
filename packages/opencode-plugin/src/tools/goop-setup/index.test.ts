/**
 * Unit Tests for GoopSpec Setup Tool
 * @module tools/goop-setup/index.test
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import {
  createGoopSetupTool,
  AGENT_MODEL_SUGGESTIONS,
  ALL_AGENTS,
} from "./index.js";
import {
  createMockPluginContext,
  createMockToolContext,
  setupTestEnvironment,
  type PluginContext,
} from "../../test-utils.js";

describe("goop_setup tool", () => {
  let ctx: PluginContext;
  let toolContext: ReturnType<typeof createMockToolContext>;
  let cleanup: () => void;

  beforeEach(() => {
    const env = setupTestEnvironment("goop-setup-test");
    cleanup = env.cleanup;
    ctx = createMockPluginContext({ testDir: env.testDir });
    toolContext = createMockToolContext({ directory: env.testDir });
  });

  afterEach(() => {
    cleanup();
  });

  describe("tool creation", () => {
    it("creates tool with correct description", () => {
      const tool = createGoopSetupTool(ctx);
      
      expect(tool.description).toContain("configuration");
      expect(tool.description).toContain("detect");
      expect(tool.description).toContain("plan");
      expect(tool.description).toContain("apply");
      expect(tool.description).toContain("models");
    });

    it("has required args", () => {
      const tool = createGoopSetupTool(ctx);
      
      expect(tool.args).toHaveProperty("action");
      expect(tool.args).toHaveProperty("scope");
      expect(tool.args).toHaveProperty("orchestratorModel");
      expect(tool.args).toHaveProperty("defaultModel");
      expect(tool.args).toHaveProperty("mcpPreset");
      expect(tool.args).toHaveProperty("enableOrchestrator");
      expect(tool.args).toHaveProperty("agentModels");
      expect(tool.args).toHaveProperty("gitignoreGoopspec");
    });
  });

  describe("gitignoreGoopspec configuration", () => {
    it("persists gitignore preference in workflow state", async () => {
      const tool = createGoopSetupTool(ctx);

      await tool.execute(
        {
          action: "status",
          gitignoreGoopspec: true,
        },
        toolContext,
      );

      expect(ctx.stateManager.getState().workflow.gitignoreGoopspec).toBe(true);
    });

    it("creates .gitignore and appends .goopspec when enabled", async () => {
      const tool = createGoopSetupTool(ctx);
      const gitignorePath = join(toolContext.directory, ".gitignore");

      await tool.execute(
        {
          action: "status",
          gitignoreGoopspec: true,
        },
        toolContext,
      );

      expect(existsSync(gitignorePath)).toBe(true);
      expect(readFileSync(gitignorePath, "utf-8")).toContain(".goopspec/");
    });

    it("does not duplicate .goopspec entry in .gitignore", async () => {
      const tool = createGoopSetupTool(ctx);
      const gitignorePath = join(toolContext.directory, ".gitignore");
      writeFileSync(gitignorePath, "node_modules/\n.goopspec/\n", "utf-8");

      await tool.execute(
        {
          action: "status",
          gitignoreGoopspec: true,
        },
        toolContext,
      );

      const entries = readFileSync(gitignorePath, "utf-8")
        .split(/\r?\n/)
        .filter((line) => line.trim() === ".goopspec/");
      expect(entries).toHaveLength(1);
    });

    it("does not modify .gitignore when disabled", async () => {
      const tool = createGoopSetupTool(ctx);
      const gitignorePath = join(toolContext.directory, ".gitignore");
      const originalContent = "node_modules/\n";
      writeFileSync(gitignorePath, originalContent, "utf-8");

      await tool.execute(
        {
          action: "status",
          gitignoreGoopspec: false,
        },
        toolContext,
      );

      expect(ctx.stateManager.getState().workflow.gitignoreGoopspec).toBe(false);
      expect(readFileSync(gitignorePath, "utf-8")).toBe(originalContent);
    });
  });

  describe("AGENT_MODEL_SUGGESTIONS constant", () => {
    it("has suggestions for all agents", () => {
      const expectedAgents = [
        "goop-debugger",
        "goop-designer",
        "goop-executor-low",
        "goop-executor-medium",
        "goop-executor-high",
        "goop-executor-frontend",
        "goop-explorer",
        "goop-librarian",
        "goop-orchestrator",
        "goop-planner",
        "goop-researcher",
        "goop-tester",
        "goop-verifier",
        "goop-writer",
      ];

      for (const agent of expectedAgents) {
        expect(AGENT_MODEL_SUGGESTIONS).toHaveProperty(agent);
      }
    });

    it("each agent has suggestions array", () => {
      for (const [agent, config] of Object.entries(AGENT_MODEL_SUGGESTIONS)) {
        expect(Array.isArray(config.suggestions)).toBe(true);
        expect(config.suggestions.length).toBeGreaterThan(0);
      }
    });

    it("each agent has description", () => {
      for (const [agent, config] of Object.entries(AGENT_MODEL_SUGGESTIONS)) {
        expect(typeof config.description).toBe("string");
        expect(config.description.length).toBeGreaterThan(0);
      }
    });

    it("suggestions contain valid model strings", () => {
      for (const [agent, config] of Object.entries(AGENT_MODEL_SUGGESTIONS)) {
        for (const model of config.suggestions) {
          expect(typeof model).toBe("string");
          expect(model).toContain("/"); // provider/model format
        }
      }
    });
  });

  describe("ALL_AGENTS constant", () => {
    it("contains all agent names", () => {
      expect(ALL_AGENTS.length).toBe(Object.keys(AGENT_MODEL_SUGGESTIONS).length);
    });

    it("matches AGENT_MODEL_SUGGESTIONS keys", () => {
      const suggestionKeys = Object.keys(AGENT_MODEL_SUGGESTIONS);
      expect(new Set(ALL_AGENTS)).toEqual(new Set(suggestionKeys));
    });
  });

  describe("models action", () => {
    it("returns model suggestions documentation", async () => {
      const tool = createGoopSetupTool(ctx);
      const result = await tool.execute({ action: "models" }, toolContext);

      expect(result).toContain("# GoopSpec Agent Model Configuration");
      expect(result).toContain("## Available Agents");
    });

    it("lists all agents in models output", async () => {
      const tool = createGoopSetupTool(ctx);
      const result = await tool.execute({ action: "models" }, toolContext);

      for (const agent of ALL_AGENTS) {
        expect(result).toContain(agent);
      }
    });

    it("includes suggestions for each agent", async () => {
      const tool = createGoopSetupTool(ctx);
      const result = await tool.execute({ action: "models" }, toolContext);

      expect(result).toContain("Suggestions");
    });

    it("includes usage example", async () => {
      const tool = createGoopSetupTool(ctx);
      const result = await tool.execute({ action: "models" }, toolContext);

      expect(result).toContain("## Usage");
      expect(result).toContain('"agents"');
      expect(result).toContain('"goop-executor-low": { "model"');
      expect(result).toContain('"goop-executor-medium": { "model"');
      expect(result).toContain('"goop-executor-high": { "model"');
      expect(result).toContain('"goop-executor-frontend": { "model"');
    });
  });

  describe("detect action", () => {
    it("returns environment detection output", async () => {
      const tool = createGoopSetupTool(ctx);
      const result = await tool.execute({ action: "detect" }, toolContext);

      expect(result).toContain("# GoopSpec Environment Detection");
      expect(result).toContain("## Directory Structure");
    });

    it("shows config file status", async () => {
      const tool = createGoopSetupTool(ctx);
      const result = await tool.execute({ action: "detect" }, toolContext);

      expect(result).toContain("OpenCode config");
      expect(result).toContain("GoopSpec config");
    });

    it("shows MCP section", async () => {
      const tool = createGoopSetupTool(ctx);
      const result = await tool.execute({ action: "detect" }, toolContext);

      expect(result).toContain("## Installed MCPs");
    });

    it("shows available actions", async () => {
      const tool = createGoopSetupTool(ctx);
      const result = await tool.execute({ action: "detect" }, toolContext);

      expect(result).toContain("## Available Actions");
      expect(result).toContain("init");
      expect(result).toContain("verify");
      expect(result).toContain("reset");
    });
  });

  describe("plan action", () => {
    it("requires scope parameter", async () => {
      const tool = createGoopSetupTool(ctx);
      const result = await tool.execute({ action: "plan" }, toolContext);

      expect(result).toContain("Error");
      expect(result).toContain("scope");
      expect(result).toContain("required");
    });

    it("accepts global scope", async () => {
      const tool = createGoopSetupTool(ctx);
      const result = await tool.execute({
        action: "plan",
        scope: "global",
      }, toolContext);

      expect(result).toContain("# GoopSpec Setup Plan");
      expect(result).toContain("## Summary");
    });

    it("accepts project scope", async () => {
      const tool = createGoopSetupTool(ctx);
      const result = await tool.execute({
        action: "plan",
        scope: "project",
      }, toolContext);

      expect(result).toContain("# GoopSpec Setup Plan");
    });

    it("accepts both scope", async () => {
      const tool = createGoopSetupTool(ctx);
      const result = await tool.execute({
        action: "plan",
        scope: "both",
      }, toolContext);

      expect(result).toContain("# GoopSpec Setup Plan");
    });

    it("shows agent models when provided", async () => {
      const tool = createGoopSetupTool(ctx);
      const result = await tool.execute({
        action: "plan",
        scope: "project",
        agentModels: {
          "goop-orchestrator": "anthropic/claude-opus-4-6",
          "goop-executor": "anthropic/claude-sonnet-4-6",
        },
      }, toolContext);

      expect(result).toContain("Agent Models");
      expect(result).toContain("goop-orchestrator");
      expect(result).toContain("anthropic/claude-opus-4-6");
    });
  });

  describe("apply action", () => {
    it("requires scope parameter", async () => {
      const tool = createGoopSetupTool(ctx);
      const result = await tool.execute({ action: "apply" }, toolContext);

      expect(result).toContain("Error");
      expect(result).toContain("scope");
    });

    it("returns setup result", async () => {
      const tool = createGoopSetupTool(ctx);
      const result = await tool.execute({
        action: "apply",
        scope: "project",
      }, toolContext);

      expect(result).toContain("# GoopSpec Setup Result");
    });

    it("shows next steps on success", async () => {
      const tool = createGoopSetupTool(ctx);
      const result = await tool.execute({
        action: "apply",
        scope: "project",
        mcpPreset: "none", // Minimal setup to avoid errors
      }, toolContext);

      expect(result).toContain("## Next Steps");
      expect(result).toContain("goop-status");
    });

    it("persists orchestrator model for project scope", async () => {
      const tool = createGoopSetupTool(ctx);
      await tool.execute({
        action: "apply",
        scope: "project",
        mcpPreset: "none",
        orchestratorModel: "openai/gpt-5.3-codex",
      }, toolContext);

      const configPath = join(toolContext.directory, ".goopspec", "config.json");
      const savedConfig = JSON.parse(readFileSync(configPath, "utf-8")) as {
        orchestrator?: { model?: string };
      };

      expect(savedConfig.orchestrator?.model).toBe("openai/gpt-5.3-codex");
    });
  });

  describe("error handling", () => {
    it("handles errors gracefully", async () => {
      const tool = createGoopSetupTool(ctx);
      
      // Should not throw, should return error message
      const result = await tool.execute({
        action: "plan",
        scope: "invalid" as any, // Invalid scope
      }, toolContext);

      // Should either show error or handle gracefully
      expect(typeof result).toBe("string");
    });
  });

  describe("mcp preset options", () => {
    it("accepts core preset", async () => {
      const tool = createGoopSetupTool(ctx);
      const result = await tool.execute({
        action: "plan",
        scope: "project",
        mcpPreset: "core",
      }, toolContext);

      expect(result).toContain("# GoopSpec Setup Plan");
    });

    it("accepts recommended preset", async () => {
      const tool = createGoopSetupTool(ctx);
      const result = await tool.execute({
        action: "plan",
        scope: "project",
        mcpPreset: "recommended",
      }, toolContext);

      expect(result).toContain("# GoopSpec Setup Plan");
    });

    it("accepts none preset", async () => {
      const tool = createGoopSetupTool(ctx);
      const result = await tool.execute({
        action: "plan",
        scope: "project",
        mcpPreset: "none",
      }, toolContext);

      expect(result).toContain("# GoopSpec Setup Plan");
    });
  });

  describe("model configuration", () => {
    it("accepts orchestratorModel parameter", async () => {
      const tool = createGoopSetupTool(ctx);
      const result = await tool.execute({
        action: "plan",
        scope: "project",
        orchestratorModel: "anthropic/claude-opus-4-6",
      }, toolContext);

      expect(result).toContain("# GoopSpec Setup Plan");
    });

    it("accepts defaultModel parameter", async () => {
      const tool = createGoopSetupTool(ctx);
      const result = await tool.execute({
        action: "plan",
        scope: "project",
        defaultModel: "anthropic/claude-sonnet-4-6",
      }, toolContext);

      expect(result).toContain("# GoopSpec Setup Plan");
    });
  });

  describe("init action", () => {
    it("requires scope parameter", async () => {
      const tool = createGoopSetupTool(ctx);
      const result = await tool.execute({ action: "init" }, toolContext);

      expect(result).toContain("Error");
      expect(result).toContain("scope");
    });

    it("creates project structure", async () => {
      const tool = createGoopSetupTool(ctx);
      const result = await tool.execute({
        action: "init",
        scope: "project",
        projectName: "test-project",
        mcpPreset: "none",
      }, toolContext);

      expect(result).toContain("# GoopSpec Initialization Result");
      expect(result).toContain("test-project");
    });

    it("shows created files", async () => {
      const tool = createGoopSetupTool(ctx);
      const result = await tool.execute({
        action: "init",
        scope: "project",
        projectName: "test-project",
        mcpPreset: "none",
      }, toolContext);

      expect(result).toContain("## Created");
    });
  });

  describe("verify action", () => {
    it("returns verification result", async () => {
      const tool = createGoopSetupTool(ctx);
      const result = await tool.execute({ action: "verify" }, toolContext);

      expect(result).toContain("# GoopSpec Setup Verification");
      expect(result).toContain("## Check Results");
    });

    it("shows check summary", async () => {
      const tool = createGoopSetupTool(ctx);
      const result = await tool.execute({ action: "verify" }, toolContext);

      expect(result).toContain("## Summary");
      expect(result).toContain("Total");
      expect(result).toContain("Passed");
      expect(result).toContain("Failed");
    });
  });

  describe("reset action", () => {
    it("requires scope parameter", async () => {
      const tool = createGoopSetupTool(ctx);
      const result = await tool.execute({ action: "reset" }, toolContext);

      expect(result).toContain("Error");
      expect(result).toContain("scope");
    });

    it("requires confirmation", async () => {
      const tool = createGoopSetupTool(ctx);
      const result = await tool.execute({
        action: "reset",
        scope: "project",
      }, toolContext);

      expect(result).toContain("confirmation");
    });

    it("resets when confirmed", async () => {
      const tool = createGoopSetupTool(ctx);
      const result = await tool.execute({
        action: "reset",
        scope: "project",
        confirmed: true,
      }, toolContext);

      expect(result).toContain("# GoopSpec Reset Result");
    });
  });

  describe("status action", () => {
    it("returns status summary", async () => {
      const tool = createGoopSetupTool(ctx);
      const result = await tool.execute({ action: "status" }, toolContext);

      expect(result).toContain("# GoopSpec Configuration Status");
      expect(result).toContain("Initialized");
    });

    it("shows memory system status", async () => {
      const tool = createGoopSetupTool(ctx);
      const result = await tool.execute({ action: "status" }, toolContext);

      expect(result).toContain("## Memory System");
    });

    it("shows MCP status", async () => {
      const tool = createGoopSetupTool(ctx);
      const result = await tool.execute({ action: "status" }, toolContext);

      expect(result).toContain("## MCPs");
    });

    it("shows worktree status", async () => {
      const tool = createGoopSetupTool(ctx);
      const result = await tool.execute({ action: "status" }, toolContext);

      expect(result).toContain("## Worktree Status");
      expect(result).toContain("In worktree:");
      expect(result).toContain("Worktree path:");
      expect(result).toContain("Branch:");
      expect(result).toContain("Inferred workflow ID:");
    });
  });

  describe("memory configuration", () => {
    it("accepts memory options in plan", async () => {
      const tool = createGoopSetupTool(ctx);
      const result = await tool.execute({
        action: "plan",
        scope: "project",
        memoryEnabled: true,
        memoryProvider: "local",
      }, toolContext);

      expect(result).toContain("# GoopSpec Setup Plan");
      expect(result).toContain("Memory");
    });

    it("includes memory config in init", async () => {
      const tool = createGoopSetupTool(ctx);
      const result = await tool.execute({
        action: "init",
        scope: "project",
        projectName: "test-memory",
        mcpPreset: "none",
        memoryEnabled: true,
        memoryProvider: "local",
      }, toolContext);

      expect(result).toContain("# GoopSpec Initialization Result");
    });
  });
});
