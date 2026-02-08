/**
 * Tests for configuration system
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it, mock } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";

import type { GoopSpecConfig } from "./types";
import { getPackageRoot } from "../shared/paths";

const warnMock = mock(() => {});

let loadPluginConfig: (projectDir: string) => GoopSpecConfig;
let validateConfig: (config: unknown) => { valid: boolean; errors?: string[] };
let getDefaultConfig: () => GoopSpecConfig;
let validateAgentKeys: (
  config: GoopSpecConfig,
  knownNames: string[],
  warn?: (message: string) => void
) => void;
let GoopSpecConfigSchema: {
  safeParse: (config: unknown) => { success: boolean };
};
let DEFAULT_CONFIG: GoopSpecConfig;

let originalHome: string | undefined;
let originalUserProfile: string | undefined;

function writeJsonFile(path: string, content: unknown): void {
  const directory = dirname(path);
  mkdirSync(directory, { recursive: true });
  writeFileSync(path, `${JSON.stringify(content, null, 2)}\n`, "utf-8");
}

describe("config", () => {
  beforeAll(async () => {
    const configModule = await import("./config.js");
    ({
      loadPluginConfig,
      validateConfig,
      getDefaultConfig,
      validateAgentKeys,
      GoopSpecConfigSchema,
      DEFAULT_CONFIG,
    } = configModule);
  });

  beforeEach(() => {
    originalHome = process.env.HOME;
    originalUserProfile = process.env.USERPROFILE;
    warnMock.mockReset();
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

  describe("DEFAULT_CONFIG", () => {
    it("should have required defaults", () => {
      expect(DEFAULT_CONFIG.enforcement).toBe("assist");
      expect(DEFAULT_CONFIG.constitution).toBeUndefined();
      expect(DEFAULT_CONFIG.adlEnabled).toBe(true);
      expect(DEFAULT_CONFIG.defaultModel).toBeTruthy();
    });

    it("should have MCP defaults", () => {
      expect(DEFAULT_CONFIG.mcp?.context7).toBe(true);
      expect(DEFAULT_CONFIG.mcp?.exa).toBe(true);
    });
  });

  describe("getDefaultConfig", () => {
    it("should return a copy of defaults", () => {
      const config1 = getDefaultConfig();
      const config2 = getDefaultConfig();
      
      // Should be equal
      expect(config1).toEqual(config2);
      
      // But not the same object
      config1.projectName = "test";
      expect(config2.projectName).toBeUndefined();
    });
  });

  describe("validateConfig", () => {
    it("should validate a valid config", () => {
      const result = validateConfig({
        projectName: "test-project",
        enforcement: "assist",
      });
      expect(result.valid).toBe(true);
    });

    it("should reject invalid enforcement level", () => {
      const result = validateConfig({
        enforcement: "invalid",
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toBeTruthy();
    });

    it("should validate agent config", () => {
      const result = validateConfig({
        agents: {
          "test-agent": {
            model: "gpt-4",
            temperature: 0.5,
          },
        },
      });
      expect(result.valid).toBe(true);
    });

    it("should reject invalid temperature", () => {
      const result = validateConfig({
        agents: {
          "test-agent": {
            temperature: 5, // Too high
          },
        },
      });
      expect(result.valid).toBe(false);
    });

    it("should accept empty config", () => {
      const result = validateConfig({});
      expect(result.valid).toBe(true);
    });
  });

  describe("loadPluginConfig", () => {
    it("should return default config when no files exist", () => {
      // Use a non-existent directory
      const config = loadPluginConfig(join(tmpdir(), "non-existent-project-12345"));
      
      // Should have defaults
      expect(config.enforcement).toBe("assist");
    });

    it("should work with actual project directory", () => {
      const projectDir = getPackageRoot();
      const config = loadPluginConfig(projectDir);
      
      // Should at least have defaults
      expect(config).toBeTruthy();
      expect(config.enforcement).toBeTruthy();
    });

    it("should let project config override global and global override defaults", () => {
      const tempRoot = mkdtempSync(join(tmpdir(), "config-cascade-"));
      const projectDir = join(tempRoot, "project");
      const homeDir = join(tempRoot, "home");

      try {
        mkdirSync(projectDir, { recursive: true });
        process.env.HOME = homeDir;
        delete process.env.USERPROFILE;

        const globalConfigPath = join(homeDir, ".config", "opencode", "goopspec.json");
        const projectConfigPath = join(projectDir, ".goopspec", "config.json");

        writeJsonFile(globalConfigPath, {
          defaultModel: "openai/gpt-4.1",
          adlEnabled: false,
        });

        writeJsonFile(projectConfigPath, {
          defaultModel: "anthropic/claude-3-7-sonnet",
        });

        const config = loadPluginConfig(projectDir);

        expect(config.defaultModel).toBe("anthropic/claude-3-7-sonnet");
        expect(config.adlEnabled).toBe(false);
      } finally {
        rmSync(tempRoot, { recursive: true, force: true });
      }
    });

    it("should load orchestrator model from agents config", () => {
      const tempRoot = mkdtempSync(join(tmpdir(), "config-agents-model-"));
      const projectDir = join(tempRoot, "project");
      const homeDir = join(tempRoot, "home");

      try {
        mkdirSync(projectDir, { recursive: true });
        process.env.HOME = homeDir;
        delete process.env.USERPROFILE;

        const projectConfigPath = join(projectDir, ".goopspec", "config.json");
        writeJsonFile(projectConfigPath, {
          agents: {
            "goop-orchestrator": {
              model: "openai/o3-mini",
            },
          },
        });

        const config = loadPluginConfig(projectDir);

        expect(config.agents?.["goop-orchestrator"]?.model).toBe("openai/o3-mini");
      } finally {
        rmSync(tempRoot, { recursive: true, force: true });
      }
    });

    it("should keep orchestrator.model backwards compatibility", () => {
      const tempRoot = mkdtempSync(join(tmpdir(), "config-orchestrator-compat-"));
      const projectDir = join(tempRoot, "project");
      const homeDir = join(tempRoot, "home");

      try {
        mkdirSync(projectDir, { recursive: true });
        process.env.HOME = homeDir;
        delete process.env.USERPROFILE;

        const projectConfigPath = join(projectDir, ".goopspec", "config.json");
        writeJsonFile(projectConfigPath, {
          orchestrator: {
            model: "anthropic/claude-sonnet-4-5",
          },
        });

        const config = loadPluginConfig(projectDir);

        expect(config.orchestrator?.model).toBe("anthropic/claude-sonnet-4-5");
      } finally {
        rmSync(tempRoot, { recursive: true, force: true });
      }
    });
  });

  describe("validateAgentKeys", () => {
    it("should pass silently for valid keys", () => {
      validateAgentKeys(
        {
          agents: {
            "goop-orchestrator": { model: "model-a" },
            "goop-executor": { model: "model-b" },
          },
        },
        ["goop-orchestrator", "goop-executor"],
        warnMock,
      );

      expect(warnMock).not.toHaveBeenCalled();
    });

    it("should warn on unknown keys", () => {
      validateAgentKeys(
        {
          agents: {
            "goop-unknown": { model: "model-x" },
          },
        },
        ["goop-orchestrator", "goop-executor"],
        warnMock,
      );

      expect(warnMock).toHaveBeenCalledTimes(1);
      expect(warnMock).toHaveBeenCalledWith("Config warning: unknown agent key 'goop-unknown'");
    });

    it("should include typo suggestion when close key exists", () => {
      validateAgentKeys(
        {
          agents: {
            "goop-orchestr": { model: "model-x" },
          },
        },
        ["goop-orchestrator", "goop-executor"],
        warnMock,
      );

      expect(warnMock).toHaveBeenCalledTimes(1);
      expect(warnMock).toHaveBeenCalledWith(
        "Config warning: unknown agent key 'goop-orchestr' - did you mean 'goop-orchestrator'?",
      );
    });

    it("should not warn for empty agents config", () => {
      validateAgentKeys({}, ["goop-orchestrator", "goop-executor"], warnMock);

      expect(warnMock).not.toHaveBeenCalled();
    });
  });

  describe("GoopSpecConfigSchema", () => {
    it("should parse complete config", () => {
      const config = {
        projectName: "my-project",
        enforcement: "warn",
        constitution: false,
        adlEnabled: true,
        defaultModel: "claude-opus",
        agents: {
          orchestrator: { model: "gpt-4" },
        },
        mcp: {
          context7: true,
          exa: false,
        },
      };

      const result = GoopSpecConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it("should allow partial config", () => {
      const config = {
        projectName: "minimal",
      };

      const result = GoopSpecConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });
  });
});
