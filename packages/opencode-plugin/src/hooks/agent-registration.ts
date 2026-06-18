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

import type { Config } from "../core/sdk-compat.js";
import type { PluginContext } from "../core/types.js";
import { loadAgentConfigs, loadCommandConfigs } from "../features/agents/index.js";
import { loadMergedConfig } from "../features/setup/index.js";
import { log } from "../shared/logger.js";
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
          agentConfig.model = roleOverride;
        } else if (mergedConfig.defaultModel) {
          agentConfig.model = mergedConfig.defaultModel;
        }
        // else: keep the markdown frontmatter default
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
  };
}

export const agentRegistrationFactory: HookFactory = createAgentRegistrationHook;
