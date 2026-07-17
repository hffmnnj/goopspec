import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "bun:test";

import type { SdkConfig } from "../core/sdk-compat.js";
import { createMockPluginContext, setupTestEnvironment } from "../test-utils.js";
import { createAgentRegistrationHook } from "./agent-registration.js";

function withProviderCatalog<T>(
  ctx: ReturnType<typeof createMockPluginContext>,
  catalog: unknown,
  run: () => Promise<T>,
): Promise<T> {
  (ctx.sdk.client as unknown as { config: { providers: () => Promise<unknown> } }).config = {
    providers: async () => ({ data: catalog }),
  };
  return run();
}

describe("createAgentRegistrationHook", () => {
  it("exposes a config hook", () => {
    const { testDir, cleanup } = setupTestEnvironment("agent-reg");
    try {
      const ctx = createMockPluginContext({ testDir });
      const hooks = createAgentRegistrationHook(ctx);
      expect(typeof hooks.config).toBe("function");
    } finally {
      cleanup();
    }
  });

  it("registers the bundled GoopSpec agents into config.agent", async () => {
    const { testDir, cleanup } = setupTestEnvironment("agent-reg-load");
    try {
      const ctx = createMockPluginContext({ testDir });
      const hooks = createAgentRegistrationHook(ctx);

      const config: SdkConfig = {};
      await hooks.config?.(config);

      expect(config.agent).toBeDefined();
      expect(config.agent?.["goop-orchestrator"]).toBeDefined();
      expect(config.agent?.["goop-orchestrator"]?.mode).toBe("primary");
    } finally {
      cleanup();
    }
  });

  it("does not overwrite an existing agent entry", async () => {
    const { testDir, cleanup } = setupTestEnvironment("agent-reg-override");
    try {
      const ctx = createMockPluginContext({ testDir });
      const hooks = createAgentRegistrationHook(ctx);

      const config: SdkConfig = {
        agent: { "goop-orchestrator": { model: "user/custom-model" } },
      };
      await hooks.config?.(config);

      expect(config.agent?.["goop-orchestrator"]?.model).toBe("user/custom-model");
    } finally {
      cleanup();
    }
  });

  it("applies per-role model override from goopspec.json", async () => {
    const { testDir, cleanup } = setupTestEnvironment("agent-reg-role-override");
    try {
      // Write a goopspec.json with a per-role override for orchestrator
      writeFileSync(
        join(testDir, "goopspec.json"),
        JSON.stringify({ agentModels: { orchestrator: "anthropic/claude-test-override" } }),
        "utf-8",
      );

      const ctx = createMockPluginContext({ testDir });
      const hooks = createAgentRegistrationHook(ctx);

      const config: SdkConfig = {};
      await hooks.config?.(config);

      // The orchestrator should use the override model
      expect(config.agent?.["goop-orchestrator"]?.model).toBe("anthropic/claude-test-override");
      // Other agents should keep their frontmatter defaults (not the override)
      expect(config.agent?.["goop-executor-low"]?.model).not.toBe("anthropic/claude-test-override");
    } finally {
      cleanup();
    }
  });

  it("applies defaultModel from goopspec.json to all agents without a per-role override", async () => {
    const { testDir, cleanup } = setupTestEnvironment("agent-reg-default-model");
    const origGlobalPath = process.env.GOOPSPEC_GLOBAL_CONFIG_PATH;
    try {
      // Isolate from real global config by pointing to a non-existent path
      process.env.GOOPSPEC_GLOBAL_CONFIG_PATH = join(testDir, "no-global-config.json");

      // Write a goopspec.json with a defaultModel and one per-role override
      writeFileSync(
        join(testDir, "goopspec.json"),
        JSON.stringify({
          defaultModel: "anthropic/claude-default-test",
          agentModels: { orchestrator: "anthropic/claude-orchestrator-specific" },
        }),
        "utf-8",
      );

      const ctx = createMockPluginContext({ testDir });
      const hooks = createAgentRegistrationHook(ctx);

      const config: SdkConfig = {};
      await hooks.config?.(config);

      // Per-role override wins over defaultModel
      expect(config.agent?.["goop-orchestrator"]?.model).toBe(
        "anthropic/claude-orchestrator-specific",
      );
      // All other agents get defaultModel
      expect(config.agent?.["goop-executor-low"]?.model).toBe("anthropic/claude-default-test");
      expect(config.agent?.["goop-executor-medium"]?.model).toBe("anthropic/claude-default-test");
    } finally {
      if (origGlobalPath === undefined) {
        Reflect.deleteProperty(process.env, "GOOPSPEC_GLOBAL_CONFIG_PATH");
      } else {
        process.env.GOOPSPEC_GLOBAL_CONFIG_PATH = origGlobalPath;
      }
      cleanup();
    }
  });

  it("applies model override from legacy agents format in goopspec.json", async () => {
    const { testDir, cleanup } = setupTestEnvironment("agent-reg-legacy-format");
    try {
      // Write a goopspec.json using the old 0.2.x agents format with goop- prefix
      writeFileSync(
        join(testDir, "goopspec.json"),
        JSON.stringify({
          agents: {
            "goop-orchestrator": { model: "anthropic/claude-legacy-format", temperature: 0.7 },
          },
        }),
        "utf-8",
      );

      const ctx = createMockPluginContext({ testDir });
      const hooks = createAgentRegistrationHook(ctx);

      const config: SdkConfig = {};
      await hooks.config?.(config);

      // Legacy format should be normalized and applied
      expect(config.agent?.["goop-orchestrator"]?.model).toBe("anthropic/claude-legacy-format");
    } finally {
      cleanup();
    }
  });

  it("leaves frontmatter model intact when no config overrides exist", async () => {
    const { testDir, cleanup } = setupTestEnvironment("agent-reg-no-override");
    const origGlobalPath = process.env.GOOPSPEC_GLOBAL_CONFIG_PATH;
    try {
      // Isolate from real global config by pointing to a non-existent path
      process.env.GOOPSPEC_GLOBAL_CONFIG_PATH = join(testDir, "no-global-config.json");

      // No goopspec.json written — only the .goopspec/ scaffold from setupTestEnvironment
      const ctx = createMockPluginContext({ testDir });
      const hooks = createAgentRegistrationHook(ctx);

      const config: SdkConfig = {};
      await hooks.config?.(config);

      // The orchestrator frontmatter default is anthropic/claude-opus-4-6
      expect(config.agent?.["goop-orchestrator"]?.model).toBe("anthropic/claude-opus-4-6");
    } finally {
      if (origGlobalPath === undefined) {
        Reflect.deleteProperty(process.env, "GOOPSPEC_GLOBAL_CONFIG_PATH");
      } else {
        process.env.GOOPSPEC_GLOBAL_CONFIG_PATH = origGlobalPath;
      }
      cleanup();
    }
  });

  it("applies thinkingBudget from config to agent", async () => {
    const { testDir, cleanup } = setupTestEnvironment("agent-reg-thinking-budget");
    const origGlobalPath = process.env.GOOPSPEC_GLOBAL_CONFIG_PATH;
    try {
      process.env.GOOPSPEC_GLOBAL_CONFIG_PATH = join(testDir, "no-global-config.json");

      writeFileSync(
        join(testDir, "goopspec.json"),
        JSON.stringify({
          orchestrator: { model: "anthropic/claude-opus-4-6", thinkingBudget: 32000 },
        }),
        "utf-8",
      );

      const ctx = createMockPluginContext({ testDir });
      const hooks = createAgentRegistrationHook(ctx);

      const config: SdkConfig = {};
      await hooks.config?.(config);

      const orchConfig = config.agent?.["goop-orchestrator"] as Record<string, unknown> | undefined;
      expect(orchConfig?.thinkingBudget).toBe(32000);
    } finally {
      if (origGlobalPath === undefined) {
        process.env.GOOPSPEC_GLOBAL_CONFIG_PATH = undefined;
      } else {
        process.env.GOOPSPEC_GLOBAL_CONFIG_PATH = origGlobalPath;
      }
      cleanup();
    }
  });

  it("applies a verified V1 thinking option to future GoopSpec turns", async () => {
    const { testDir, cleanup } = setupTestEnvironment("agent-reg-thinking-v1");
    const originalGlobalPath = process.env.GOOPSPEC_GLOBAL_CONFIG_PATH;
    try {
      process.env.GOOPSPEC_GLOBAL_CONFIG_PATH = join(testDir, "no-global-config.json");
      writeFileSync(
        join(testDir, "goopspec.json"),
        JSON.stringify({ agentThinkingLevels: { orchestrator: "high" } }),
        "utf-8",
      );
      const ctx = createMockPluginContext({ testDir });
      const hooks = createAgentRegistrationHook(ctx);
      const config: SdkConfig = {};
      const output = { temperature: 0, topP: 0, topK: 0, maxOutputTokens: undefined, options: {} };

      await hooks.config?.(config);
      expect(
        (config.agent?.["goop-orchestrator"] as Record<string, unknown> | undefined)
          ?.thinkingBudget,
      ).toBeUndefined();

      await withProviderCatalog(
        ctx,
        {
          providers: [
            {
              id: "anthropic",
              models: {
                "claude-opus-4-6": {
                  capabilities: { reasoning: true },
                  options: { reasoningEffort: ["low", "high"] },
                },
              },
            },
          ],
        },
        async () => {
          await hooks["chat.params"]?.(
            {
              sessionID: "session",
              agent: "goop-orchestrator",
              model: { providerID: "anthropic", id: "claude-opus-4-6" } as never,
              provider: {} as never,
              message: {} as never,
            },
            output,
          );
        },
      );

      expect(output.options).toEqual({ reasoningEffort: "high" });
    } finally {
      if (originalGlobalPath === undefined) {
        Reflect.deleteProperty(process.env, "GOOPSPEC_GLOBAL_CONFIG_PATH");
      } else {
        process.env.GOOPSPEC_GLOBAL_CONFIG_PATH = originalGlobalPath;
      }
      cleanup();
    }
  });

  it("reads the current config for each future turn after a project edit", async () => {
    const { testDir, cleanup } = setupTestEnvironment("agent-reg-thinking-reload");
    const originalGlobalPath = process.env.GOOPSPEC_GLOBAL_CONFIG_PATH;
    try {
      process.env.GOOPSPEC_GLOBAL_CONFIG_PATH = join(testDir, "no-global-config.json");
      const configPath = join(testDir, "goopspec.json");
      writeFileSync(
        configPath,
        JSON.stringify({ agentThinkingLevels: { orchestrator: "low" } }),
        "utf-8",
      );
      const ctx = createMockPluginContext({ testDir });
      const hooks = createAgentRegistrationHook(ctx);

      await withProviderCatalog(
        ctx,
        {
          providers: [
            {
              id: "anthropic",
              models: {
                "claude-opus-4-6": {
                  capabilities: { reasoning: true },
                  options: { reasoningEffort: ["low", "high"] },
                },
              },
            },
          ],
        },
        async () => {
          const input = {
            sessionID: "session",
            agent: "goop-orchestrator",
            model: { providerID: "anthropic", id: "claude-opus-4-6" } as never,
            provider: {} as never,
            message: {} as never,
          };
          const initialOutput = {
            temperature: 0,
            topP: 0,
            topK: 0,
            maxOutputTokens: undefined,
            options: {},
          };
          await hooks["chat.params"]?.(input, initialOutput);
          expect(initialOutput.options).toEqual({ reasoningEffort: "low" });

          writeFileSync(
            configPath,
            JSON.stringify({ agentThinkingLevels: { orchestrator: "high" } }),
            "utf-8",
          );
          const reloadedOutput = {
            temperature: 0,
            topP: 0,
            topK: 0,
            maxOutputTokens: undefined,
            options: {},
          };
          await hooks["chat.params"]?.(input, reloadedOutput);
          expect(reloadedOutput.options).toEqual({ reasoningEffort: "high" });
        },
      );
    } finally {
      if (originalGlobalPath === undefined) {
        Reflect.deleteProperty(process.env, "GOOPSPEC_GLOBAL_CONFIG_PATH");
      } else {
        process.env.GOOPSPEC_GLOBAL_CONFIG_PATH = originalGlobalPath;
      }
      cleanup();
    }
  });

  it("preserves the provider default and warns for unsupported V1 thinking levels", async () => {
    const { testDir, cleanup } = setupTestEnvironment("agent-reg-thinking-unsupported");
    const errors: string[] = [];
    const originalError = console.error;
    try {
      writeFileSync(
        join(testDir, "goopspec.json"),
        JSON.stringify({ agentThinkingLevels: { orchestrator: "xhigh" } }),
        "utf-8",
      );
      console.error = (...args: unknown[]) => errors.push(args.map(String).join(" "));
      const ctx = createMockPluginContext({ testDir });
      const hooks = createAgentRegistrationHook(ctx);
      const output = { temperature: 0, topP: 0, topK: 0, maxOutputTokens: undefined, options: {} };

      await withProviderCatalog(
        ctx,
        {
          providers: [
            {
              id: "anthropic",
              models: {
                "claude-opus-4-6": {
                  capabilities: { reasoning: true },
                  options: { reasoningEffort: ["high"] },
                },
              },
            },
          ],
        },
        async () => {
          await hooks["chat.params"]?.(
            {
              sessionID: "session",
              agent: "goop-orchestrator",
              model: { providerID: "anthropic", id: "claude-opus-4-6" } as never,
              provider: {} as never,
              message: {} as never,
            },
            output,
          );
        },
      );

      expect(output.options).toEqual({});
      expect(errors.some((entry) => entry.includes("preserving the provider default"))).toBe(true);
    } finally {
      console.error = originalError;
      cleanup();
    }
  });

  it("logs warning when model override is missing provider prefix", async () => {
    const { testDir, cleanup } = setupTestEnvironment("agent-reg-no-provider");
    const origGlobalPath = process.env.GOOPSPEC_GLOBAL_CONFIG_PATH;
    const errors: string[] = [];
    const origError = console.error;
    try {
      process.env.GOOPSPEC_GLOBAL_CONFIG_PATH = join(testDir, "no-global-config.json");

      // Write a config with a model string missing the provider/ prefix
      writeFileSync(
        join(testDir, "goopspec.json"),
        JSON.stringify({
          agentModels: { orchestrator: "claude-opus-4-6" },
        }),
        "utf-8",
      );

      console.error = (...args: unknown[]) => {
        errors.push(args.map(String).join(" "));
      };

      const ctx = createMockPluginContext({ testDir });
      const hooks = createAgentRegistrationHook(ctx);

      const config: SdkConfig = {};
      await hooks.config?.(config);

      // Model should still be applied (we warn, not block)
      expect(config.agent?.["goop-orchestrator"]?.model).toBe("claude-opus-4-6");
      // But a warning should have been logged
      expect(errors.some((e) => e.includes("missing provider prefix"))).toBe(true);
    } finally {
      console.error = origError;
      if (origGlobalPath === undefined) {
        process.env.GOOPSPEC_GLOBAL_CONFIG_PATH = undefined;
      } else {
        process.env.GOOPSPEC_GLOBAL_CONFIG_PATH = origGlobalPath;
      }
      cleanup();
    }
  });
});
