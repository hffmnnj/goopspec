/**
 * Agent & command registration hook.
 *
 * OpenCode discovers agents from `Config.agent` and commands from
 * `Config.command`. This hook runs on the SDK `config` event, loads
 * GoopSpec's bundled agent roster and slash commands, and injects them
 * into the config so they appear in the agent menu and command palette.
 *
 * Existing entries are never overwritten — user overrides always win.
 */

import { join } from "node:path";

import { AGENT_ROLES } from "../core/constants.js";
import type { Config } from "../core/sdk-compat.js";
import type { PluginContext } from "../core/types.js";
import { loadAgentConfigs, loadCommandConfigs } from "../features/agents/index.js";
import { getEffectiveThinkingLevels, loadMergedConfig } from "../features/setup/index.js";
import { resolveCapabilities } from "../features/thinking/capability.js";
import { resolveThinkingValue } from "../features/thinking/resolve.js";
import { log, logError } from "../shared/logger.js";
import { getPackageRoot } from "../shared/paths.js";
import type { HookFactory, Hooks } from "./types.js";

export function createAgentRegistrationHook(ctx: PluginContext): Partial<Hooks> {
  return {
    config: async (config: Config): Promise<void> => {
      const packageRoot = getPackageRoot();

      // -- Agents -------------------------------------------------------------
      const agents = loadAgentConfigs(join(packageRoot, "agents"));

      // Apply model overrides from goopspec.json config (priority: per-role > defaultModel > frontmatter)
      const mergedConfig = loadMergedConfig(ctx.sdk.directory);
      for (const [name, agentConfig] of Object.entries(agents)) {
        const role = name.replace(/^goop-/, "");
        const roleOverride = mergedConfig.agentModels?.[role];
        if (roleOverride) {
          if (!roleOverride.includes("/")) {
            logError(
              `Agent model override for "${name}" is missing provider prefix: "${roleOverride}". Expected format: "provider/model-name".`,
            );
          }
          agentConfig.model = roleOverride;
        } else if (mergedConfig.defaultModel) {
          agentConfig.model = mergedConfig.defaultModel;
        }
        // else: keep the markdown frontmatter default

        // Legacy budgets remain available only until a thinking level can be
        // applied. `chat.params` is the V1 surface that affects future turns.
        const budgetOverride = mergedConfig.agentThinkingBudgets?.[role];
        if (
          budgetOverride !== undefined &&
          mergedConfig.agentThinkingLevels?.[role] === undefined
        ) {
          (agentConfig as Record<string, unknown>).thinkingBudget = budgetOverride;
        }
      }

      const agentNames = Object.keys(agents);
      if (agentNames.length > 0) {
        if (!config.agent) config.agent = {};
        let agentsRegistered = 0;
        for (const [name, agentConfig] of Object.entries(agents)) {
          if (config.agent[name] === undefined) {
            config.agent[name] = agentConfig;
            agentsRegistered++;
          }
        }
        log("Registered GoopSpec agents", {
          registered: agentsRegistered,
          available: agentNames.length,
        });
      }

      // -- Commands -----------------------------------------------------------
      const commands = loadCommandConfigs(join(packageRoot, "commands"));
      const commandNames = Object.keys(commands);
      if (commandNames.length > 0) {
        if (!config.command) config.command = {};
        let commandsRegistered = 0;
        for (const [name, cmdConfig] of Object.entries(commands)) {
          if (config.command[name] === undefined) {
            config.command[name] = cmdConfig;
            commandsRegistered++;
          }
        }
        log("Registered GoopSpec commands", {
          registered: commandsRegistered,
          available: commandNames.length,
        });
      }
    },
    // V1 config registration is startup-only. This hook applies options to
    // future requests; changing agent-menu metadata still requires a restart.
    "chat.params": async (input, output): Promise<void> => {
      const role = getGoopRole(input.agent);
      if (!role) return;

      const level = getEffectiveThinkingLevels(ctx.sdk.directory)[role];
      const capabilities = await getV1Capabilities(ctx, input.model);
      const resolution = resolveThinkingValue(level, capabilities);

      if (resolution.apply === null) {
        logError(
          `GoopSpec ${input.agent}: ${resolution.warning ?? "preserving the provider default."}`,
        );
        return;
      }

      if (typeof resolution.apply !== "string") return;

      const option = getVerifiedV1RequestOption(capabilities, resolution.apply);
      if (!option) {
        logError(
          `GoopSpec ${input.agent}: thinking level "${level}" has no unambiguous V1 request option; preserving the provider default.`,
        );
        return;
      }

      output.options[option.key] = option.value;

      // A verified thinking label always wins over a legacy numeric budget.
      // No budget is copied into chat.params because the provider option above
      // is the only V1 setting verified against the live catalog.
    },
  };
}

function getGoopRole(
  agent: string,
): keyof ReturnType<typeof getEffectiveThinkingLevels> | undefined {
  if (!agent.startsWith("goop-")) return undefined;
  const role = agent.slice("goop-".length);
  return (AGENT_ROLES as readonly string[]).includes(role)
    ? (role as keyof ReturnType<typeof getEffectiveThinkingLevels>)
    : undefined;
}

async function getV1Capabilities(ctx: PluginContext, model: { providerID: string; id: string }) {
  try {
    const response = await ctx.sdk.client.config.providers({
      query: { directory: ctx.sdk.directory },
    });
    const provider = response.data?.providers.find((entry) => entry.id === model.providerID);
    return resolveCapabilities(provider?.models[model.id]);
  } catch {
    return resolveCapabilities(undefined);
  }
}

function getVerifiedV1RequestOption(
  capabilities: ReturnType<typeof resolveCapabilities>,
  value: string,
): { key: string; value: string } | undefined {
  if (capabilities.raw?.source !== "v1") return undefined;

  const keys = Object.entries(capabilities.raw.options).flatMap(([key, optionValue]) =>
    optionSupportsValue(optionValue, value) ? [key] : [],
  );
  return keys.length === 1 ? { key: keys[0], value } : undefined;
}

function optionSupportsValue(option: unknown, value: string): boolean {
  return (
    option === value ||
    (Array.isArray(option) &&
      option.every((entry) => typeof entry === "string") &&
      option.includes(value))
  );
}

export const agentRegistrationFactory: HookFactory = createAgentRegistrationHook;
