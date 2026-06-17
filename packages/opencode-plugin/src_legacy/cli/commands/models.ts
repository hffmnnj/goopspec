import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";

import pc from "picocolors";

import {
  cancel,
  intro,
  isCancel,
  multiselect,
  outro,
  sectionHeader,
  select,
  showBanner,
  showError,
  showSuccess,
  showWarning,
  text,
} from "../ui.js";
import { detectEnvironment } from "../../features/setup/index.js";
import { AGENT_MODEL_SUGGESTIONS, ALL_AGENTS } from "../../features/setup/model-suggestions.js";

type ConfigJson = Record<string, unknown>;
type AgentModelMap = Record<string, string>;

function handleCancel<T>(value: T | symbol): asserts value is T {
  if (isCancel(value)) {
    cancel("Model configuration cancelled.");
    process.exit(0);
  }
}

function extractAgentModels(config: ConfigJson): AgentModelMap {
  const models: AgentModelMap = {};
  if (typeof config.agents !== "object" || config.agents === null) {
    return models;
  }

  for (const [agentName, value] of Object.entries(config.agents as Record<string, unknown>)) {
    if (typeof value === "object" && value !== null && "model" in value) {
      const model = (value as { model?: unknown }).model;
      if (typeof model === "string" && model.trim()) {
        models[agentName] = model;
      }
    }
  }

  return models;
}

function readConfig(configPath: string): ConfigJson {
  try {
    if (!existsSync(configPath)) {
      return {};
    }
    return JSON.parse(readFileSync(configPath, "utf-8")) as ConfigJson;
  } catch {
    return {};
  }
}

function writeConfig(configPath: string, config: ConfigJson): void {
  writeFileSync(configPath, JSON.stringify(config, null, 2));
}

function resolveConfigPath(env: Awaited<ReturnType<typeof detectEnvironment>>): string | null {
  if (env.hasProjectGoopSpecConfig) {
    return env.projectConfigPath;
  }
  if (env.hasGlobalGoopSpecConfig) {
    return env.globalConfigPath;
  }
  return null;
}

function buildCurrentModelRows(models: AgentModelMap): string[] {
  return ALL_AGENTS.map((agentName) => {
    const current = models[agentName] ?? "(default)";
    const suggestion = AGENT_MODEL_SUGGESTIONS[agentName];
    const description = suggestion?.description ?? "No description available";
    const modelText = models[agentName] ? pc.green(current) : pc.dim(current);
    return `  ${pc.bold(agentName)}: ${modelText}${pc.dim(` - ${description}`)}`;
  });
}

export async function runModels(): Promise<void> {
  const projectDir = process.cwd();

  try {
    showBanner();
    console.log();
    intro(pc.bold("Agent Model Configuration"));

    const env = await detectEnvironment(projectDir);
    const configPath = resolveConfigPath(env);

    if (!configPath) {
      showWarning("No GoopSpec config found for this directory.");
      showWarning("Run 'goopspec init' first to create a config file.");
      outro("Models not saved.");
      return;
    }

    const existingConfig = readConfig(configPath);
    const currentModels = extractAgentModels(existingConfig);

    sectionHeader("Current Model Assignments", "🤖");
    for (const line of buildCurrentModelRows(currentModels)) {
      console.log(line);
    }
    console.log();

    const mode = await select({
      message: "What would you like to configure?",
      options: [
        { value: "all", label: "Configure all agents", hint: "Walk through all 11 roles" },
        { value: "pick", label: "Pick specific agents", hint: "Only update selected roles" },
      ],
      initialValue: "pick",
    });
    handleCancel(mode);

    let agentsToConfigure: string[] = [];
    if (mode === "all") {
      agentsToConfigure = [...ALL_AGENTS];
    } else {
      const selected = await multiselect({
        message: "Select agent roles to configure:",
        options: ALL_AGENTS.map((agentName) => {
          const current = currentModels[agentName];
          const suffix = current ? `current: ${current}` : "current: default";
          return {
            value: agentName,
            label: agentName,
            hint: `${AGENT_MODEL_SUGGESTIONS[agentName]?.description ?? ""} (${suffix})`,
          };
        }),
      });
      handleCancel(selected);
      agentsToConfigure = selected;
    }

    if (agentsToConfigure.length === 0) {
      showWarning("No agents selected. No changes made.");
      outro("Model configuration cancelled.");
      return;
    }

    const updates: AgentModelMap = {};

    for (const agentName of agentsToConfigure) {
      const suggestion = AGENT_MODEL_SUGGESTIONS[agentName];
      if (!suggestion) {
        continue;
      }

      const currentModel = currentModels[agentName] ?? suggestion.suggestions[0];
      const modelChoice = await select({
        message: `${agentName} - ${suggestion.description}`,
        options: [
          ...suggestion.suggestions.map((modelId) => ({
            value: modelId,
            label: modelId,
            hint: modelId === currentModels[agentName] ? "current" : undefined,
          })),
          {
            value: "__custom__",
            label: "Custom model ID",
            hint: "Enter provider/model-name",
          },
        ],
        initialValue: currentModel,
      });
      handleCancel(modelChoice);

      if (modelChoice === "__custom__") {
        const customModel = await text({
          message: `Custom model for ${agentName}:`,
          placeholder: "provider/model-name",
          validate: (value) => {
            if (!value.trim()) {
              return "Model ID is required";
            }
            return undefined;
          },
        });
        handleCancel(customModel);
        updates[agentName] = customModel.trim();
      } else {
        updates[agentName] = modelChoice;
      }
    }

    const mergedConfig = readConfig(configPath);
    const agentsObject: Record<string, { model: string }> =
      typeof mergedConfig.agents === "object" && mergedConfig.agents !== null
        ? (mergedConfig.agents as Record<string, { model: string }>)
        : {};

    for (const [agentName, modelId] of Object.entries(updates)) {
      agentsObject[agentName] = { model: modelId };
    }

    if (updates["goop-orchestrator"]) {
      mergedConfig.orchestrator = {
        ...(typeof mergedConfig.orchestrator === "object" && mergedConfig.orchestrator !== null
          ? (mergedConfig.orchestrator as Record<string, unknown>)
          : {}),
        model: updates["goop-orchestrator"],
      };
    }

    mergedConfig.agents = agentsObject;
    writeConfig(configPath, mergedConfig);

    console.log();
    showSuccess(`Updated ${Object.keys(updates).length} agent model(s).`);
    console.log(pc.dim(`  Saved to ${basename(configPath)} (${configPath})`));
    outro("Agent models configured.");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    showError(message, "Check config file permissions and try again");
    process.exit(1);
  }
}
