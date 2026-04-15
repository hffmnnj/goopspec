/**
 * Tests for Config Handler
 */

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { writeFileSync } from "fs";
import { join } from "path";
import { createConfigHandler } from "./config-handler.js";
import { loadPluginConfig, validateAgentKeys } from "../core/config.js";
import { setupTestEnvironment } from "../test-utils.js";
import type { GoopSpecConfig, ResourceResolver, ResolvedResource } from "../core/types.js";

// Mock resolver
function createAgentResource(name: string, model?: string): ResolvedResource {
  return {
    name,
    path: `/test/agents/${name}.md`,
    type: "agent",
    frontmatter: {
      name,
      ...(model ? { model } : {}),
    },
    body: `# ${name}`,
    content: `---\nname: ${name}\n---\n# ${name}`,
  };
}

function createMockResolver(resources: ResolvedResource[] = []): ResourceResolver {
  return {
    resolve: (type, name) => resources.find((resource) => resource.type === type && resource.name === name) ?? null,
    resolveAll: (type) => resources.filter((resource) => resource.type === type),
    getDirectory: () => null,
  };
}

function writeProjectConfig(goopspecDir: string, config: unknown): void {
  writeFileSync(join(goopspecDir, "config.json"), `${JSON.stringify(config, null, 2)}\n`, "utf-8");
}

describe("createConfigHandler", () => {
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

  it("registers goopspec agent in config", async () => {
    const pluginConfig: GoopSpecConfig = {
      enforcement: "assist",
    };
    const resolver = createMockResolver();
    const handler = createConfigHandler({
      pluginConfig,
      resolver,
      directory: "/test",
    });

    const config: Record<string, unknown> = { agent: {} };
    await handler(config);

    expect(config.agent).toBeDefined();
    expect((config.agent as Record<string, unknown>).goopspec).toBeDefined();
  });

  it("sets goopspec as default when enableAsDefault is true", async () => {
    const pluginConfig: GoopSpecConfig = {
      enforcement: "assist",
      orchestrator: {
        enableAsDefault: true,
      },
    };
    const resolver = createMockResolver();
    const handler = createConfigHandler({
      pluginConfig,
      resolver,
      directory: "/test",
    });

    const config: Record<string, unknown> = { agent: {} };
    await handler(config);

    // NOTE: default_agent must match the agent KEY, not the name property
    expect(config.default_agent).toBe("goopspec");
  });

  it("does not set default_agent when enableAsDefault is false", async () => {
    const pluginConfig: GoopSpecConfig = {
      enforcement: "assist",
      orchestrator: {
        enableAsDefault: false,
      },
    };
    const resolver = createMockResolver();
    const handler = createConfigHandler({
      pluginConfig,
      resolver,
      directory: "/test",
    });

    const config: Record<string, unknown> = { agent: {} };
    await handler(config);

    expect(config.default_agent).toBeUndefined();
  });

  it("preserves existing agents in config", async () => {
    const pluginConfig: GoopSpecConfig = {
      enforcement: "assist",
    };
    const resolver = createMockResolver();
    const handler = createConfigHandler({
      pluginConfig,
      resolver,
      directory: "/test",
    });

    const existingAgent = { mode: "primary", model: "test" };
    const config: Record<string, unknown> = {
      agent: { existing: existingAgent },
    };
    await handler(config);

    const agents = config.agent as Record<string, unknown>;
    expect(agents.existing).toBe(existingAgent);
    expect(agents.goopspec).toBeDefined();
  });

  it("creates agent config when none exists", async () => {
    const pluginConfig: GoopSpecConfig = {
      enforcement: "assist",
    };
    const resolver = createMockResolver();
    const handler = createConfigHandler({
      pluginConfig,
      resolver,
      directory: "/test",
    });

    const config: Record<string, unknown> = {};
    await handler(config);

    expect(config.agent).toBeDefined();
    expect((config.agent as Record<string, unknown>).goopspec).toBeDefined();
  });

  it("passes orchestrator config options to agent factory", async () => {
    const pluginConfig: GoopSpecConfig = {
      enforcement: "assist",
      orchestrator: {
        model: "anthropic/claude-sonnet-4-6",
        thinkingBudget: 16000,
        phaseGates: "strict",
        waveExecution: "parallel",
      },
    };
    const resolver = createMockResolver();
    const handler = createConfigHandler({
      pluginConfig,
      resolver,
      directory: "/test",
    });

    const config: Record<string, unknown> = {};
    await handler(config);

    const goopspec = (config.agent as Record<string, unknown>).goopspec as Record<string, unknown>;
    expect(goopspec.model).toBe("anthropic/claude-sonnet-4-6");
    expect((goopspec.thinking as { budgetTokens: number }).budgetTokens).toBe(16000);
  });

  it("handles errors gracefully without crashing", async () => {
    const pluginConfig: GoopSpecConfig = {
      enforcement: "assist",
    };
    // Create a resolver that throws
    const brokenResolver: ResourceResolver = {
      resolve: () => { throw new Error("Test error"); },
      resolveAll: () => { throw new Error("Test error"); },
      getDirectory: () => null,
    };
    const handler = createConfigHandler({
      pluginConfig,
      resolver: brokenResolver,
      directory: "/test",
    });

    const config: Record<string, unknown> = {};
    
    // Should not throw
    await expect(handler(config)).resolves.toBeUndefined();
  });

  it("uses agents.goop-orchestrator.model from project config in full pipeline", async () => {
    const env = setupTestEnvironment("config-handler-agents-model");

    try {
      process.env.HOME = env.testDir;
      delete process.env.USERPROFILE;

      writeProjectConfig(env.goopspecDir, {
        agents: {
          "goop-orchestrator": {
            model: "openai/o3-mini",
          },
        },
      });

      const pluginConfig = loadPluginConfig(env.testDir);
      const resolver = createMockResolver([createAgentResource("goop-orchestrator", "anthropic/claude-opus-4-6")]);
      const handler = createConfigHandler({
        pluginConfig,
        resolver,
        directory: env.testDir,
      });

      const config: Record<string, unknown> = {};
      await handler(config);

      const goopspec = (config.agent as Record<string, unknown>).goopspec as Record<string, unknown>;
      expect(goopspec.model).toBe("openai/o3-mini");
    } finally {
      env.cleanup();
    }
  });

  it("keeps orchestrator.model backwards compatibility in full pipeline", async () => {
    const env = setupTestEnvironment("config-handler-orchestrator-model");

    try {
      process.env.HOME = env.testDir;
      delete process.env.USERPROFILE;

      writeProjectConfig(env.goopspecDir, {
        orchestrator: {
          model: "anthropic/claude-sonnet-4-6",
        },
      });

      const pluginConfig = loadPluginConfig(env.testDir);
      const resolver = createMockResolver([createAgentResource("goop-orchestrator", "anthropic/claude-opus-4-6")]);
      const handler = createConfigHandler({
        pluginConfig,
        resolver,
        directory: env.testDir,
      });

      const config: Record<string, unknown> = {};
      await handler(config);

      const goopspec = (config.agent as Record<string, unknown>).goopspec as Record<string, unknown>;
      expect(goopspec.model).toBe("anthropic/claude-sonnet-4-6");
    } finally {
      env.cleanup();
    }
  });

  it("prefers agents.goop-orchestrator.model over orchestrator.model when both are set", async () => {
    const env = setupTestEnvironment("config-handler-model-precedence");

    try {
      process.env.HOME = env.testDir;
      delete process.env.USERPROFILE;

      writeProjectConfig(env.goopspecDir, {
        agents: {
          "goop-orchestrator": {
            model: "openai/gpt-4.1-mini",
          },
        },
        orchestrator: {
          model: "anthropic/claude-sonnet-4-6",
        },
      });

      const pluginConfig = loadPluginConfig(env.testDir);
      const resolver = createMockResolver([createAgentResource("goop-orchestrator", "anthropic/claude-opus-4-6")]);
      const handler = createConfigHandler({
        pluginConfig,
        resolver,
        directory: env.testDir,
      });

      const config: Record<string, unknown> = {};
      await handler(config);

      const goopspec = (config.agent as Record<string, unknown>).goopspec as Record<string, unknown>;
      expect(goopspec.model).toBe("openai/gpt-4.1-mini");
    } finally {
      env.cleanup();
    }
  });

  it("warns when project config contains unknown agent key", () => {
    const env = setupTestEnvironment("config-handler-unknown-agent");
    const warn = mock(() => {});

    try {
      process.env.HOME = env.testDir;
      delete process.env.USERPROFILE;

      writeProjectConfig(env.goopspecDir, {
        agents: {
          "goop-orchestrtor": {
            model: "openai/o3-mini",
          },
        },
      });

      const pluginConfig = loadPluginConfig(env.testDir);
      const knownNames = createMockResolver([
        createAgentResource("goop-orchestrator"),
        createAgentResource("goop-executor"),
      ])
        .resolveAll("agent")
        .map((resource) => resource.name);

      validateAgentKeys(pluginConfig, knownNames, warn);

      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith("Config warning: unknown agent key 'goop-orchestrtor'");
    } finally {
      env.cleanup();
    }
  });
});
