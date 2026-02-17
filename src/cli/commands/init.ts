/**
 * GoopSpec CLI - Init Command
 * Full interactive setup wizard
 */
import { basename } from "node:path";

import pc from "picocolors";

import {
  cancel,
  confirm,
  intro,
  isCancel,
  outro,
  sectionHeader,
  select,
  showBanner,
  showError,
  showInfo,
  showSuccess,
  showWarning,
  spinner,
  text,
} from "../ui.js";
import {
  applyInit,
  detectEnvironment,
  planInit,
  setupMemoryDependencies,
} from "../../features/setup/index.js";
import { AGENT_MODEL_SUGGESTIONS, ALL_AGENTS } from "../../features/setup/model-suggestions.js";
import { MCP_PRESETS } from "../../features/setup/types.js";
import type { MemorySetupInput, SetupInput } from "../../features/setup/types.js";
import { getGlobalConfigPath } from "../../shared/paths.js";

type SetupScope = SetupInput["scope"];
type McpPreset = SetupInput["mcpPreset"];
type SearchProvider = NonNullable<SetupInput["searchProvider"]>;
type MemoryProvider = NonNullable<NonNullable<MemorySetupInput["embeddings"]>["provider"]>;

function handleCancel(value: unknown): void {
  if (isCancel(value)) {
    cancel("Setup cancelled");
    process.exit(0);
  }
}

function resolveText(value: string | symbol): string {
  handleCancel(value);
  return value as string;
}

function resolveBoolean(value: boolean | symbol): boolean {
  handleCancel(value);
  return value as boolean;
}

function resolveString(value: string | symbol): string {
  handleCancel(value);
  return value as string;
}

function toScope(value: string): SetupScope {
  if (value === "project" || value === "global" || value === "both") {
    return value;
  }
  throw new Error(`Invalid scope selection: ${value}`);
}

function toMcpPreset(value: string): McpPreset {
  if (value === "core" || value === "recommended" || value === "none") {
    return value;
  }
  throw new Error(`Invalid MCP preset selection: ${value}`);
}

function toMemoryProvider(value: string): MemoryProvider {
  if (value === "local" || value === "openai" || value === "ollama") {
    return value;
  }
  throw new Error(`Invalid memory provider selection: ${value}`);
}

function toSearchProvider(value: string): SearchProvider {
  if (value === "exa" || value === "brave") {
    return value;
  }
  throw new Error(`Invalid search provider selection: ${value}`);
}

function formatScope(scope: SetupScope): string {
  if (scope === "global") {
    return "Global";
  }
  if (scope === "project") {
    return "Project";
  }
  return "Both";
}

function formatMcpPreset(preset: McpPreset): string {
  if (preset === "core") {
    return "Core";
  }
  if (preset === "recommended") {
    return "Recommended";
  }
  return "None";
}

function formatMemoryProvider(provider: MemoryProvider): string {
  if (provider === "openai") {
    return "OpenAI";
  }
  if (provider === "ollama") {
    return "Ollama";
  }
  return "Local";
}

function formatSearchProvider(provider: SearchProvider): string {
  if (provider === "brave") {
    return "Brave Search";
  }
  return "Exa";
}

export async function runInit(): Promise<void> {
  const projectDir = process.cwd();
  const defaultProjectName = basename(projectDir) || "goopspec-project";
  const globalConfigPath = getGlobalConfigPath();

  try {
    showBanner();
    console.log();
    intro(pc.bold("GoopSpec Setup Wizard"));

    const env = await detectEnvironment(projectDir);

    if (env.hasGoopspecDir && env.hasStateFile) {
      const overwrite = resolveBoolean(
        await confirm({
          message: "GoopSpec is already initialized here. Reconfigure this project?",
          initialValue: false,
        }),
      );
      if (!overwrite) {
        outro("Setup cancelled. Existing configuration preserved.");
        return;
      }
    }

    sectionHeader("Step 1/7: Project", "📦");
    const projectName = resolveText(
      await text({
        message: "Project name:",
        defaultValue: defaultProjectName,
        placeholder: defaultProjectName,
        validate: (value) => {
          if (!value.trim()) {
            return "Project name is required";
          }
          return undefined;
        },
      }),
    ).trim();

    sectionHeader("Step 2/7: Scope", "📁");
    const scope = toScope(
      resolveString(
        await select({
          message: "Where should GoopSpec configuration be written?",
          options: [
            { value: "project", label: "Project", hint: ".goopspec/config.json" },
            { value: "global", label: "Global", hint: globalConfigPath },
            { value: "both", label: "Both", hint: "Global defaults + project overrides" },
          ],
          initialValue: "project",
        }),
      ),
    );

    sectionHeader("Step 3/7: MCP Preset", "🔌");
    const mcpPreset = toMcpPreset(
      resolveString(
        await select({
          message: "Which MCP preset should be installed?",
          options: [
            { value: "core", label: "Core", hint: MCP_PRESETS.core.join(", ") },
            { value: "recommended", label: "Recommended", hint: MCP_PRESETS.recommended.join(", ") },
            { value: "none", label: "None", hint: "Skip MCP installation" },
          ],
          initialValue: "recommended",
        }),
      ),
    );

    sectionHeader("Step 4/7: Search Provider", "🔎");
    const searchProvider = toSearchProvider(
      resolveString(
        await select({
          message: "Which search provider should GoopSpec use?",
          options: [
            { value: "exa", label: "Exa", hint: "General web search and research context" },
            { value: "brave", label: "Brave Search", hint: "Brave web/news/image/video APIs" },
          ],
          initialValue: "exa",
        }),
      ),
    );

    if (searchProvider === "brave") {
      showInfo("Set BRAVE_API_KEY environment variable");
    } else {
      showInfo("Set EXA_API_KEY environment variable or configure Exa MCP server");
    }

    sectionHeader("Step 5/7: Agent Models", "🤖");
    showInfo(`${ALL_AGENTS.length} agent roles available`);

    const modelMode = resolveString(
      await select({
        message: "How should agent models be configured?",
        options: [
          {
            value: "recommended",
            label: "Use recommended defaults",
            hint: "Fast setup with curated defaults",
          },
          {
            value: "custom",
            label: "Configure each agent",
            hint: "Pick models per role, including custom IDs",
          },
        ],
        initialValue: "recommended",
      }),
    );

    const agentModels: Record<string, string> = {};
    if (modelMode === "custom") {
      for (const agentName of ALL_AGENTS) {
        const config = AGENT_MODEL_SUGGESTIONS[agentName];
        if (!config) {
          continue;
        }

        const selectedModel = resolveString(
          await select({
            message: `${agentName}: ${config.description}`,
            options: [
              ...config.suggestions.map((model) => ({
                value: model,
                label: model,
              })),
              {
                value: "__custom__",
                label: "Custom (enter model ID)",
                hint: "provider/model-name",
              },
            ],
            initialValue: config.suggestions[0],
          }),
        );

        if (selectedModel === "__custom__") {
          agentModels[agentName] = resolveText(
            await text({
              message: `Custom model for ${agentName}:`,
              placeholder: "provider/model-name",
              validate: (value) => {
                if (!value.trim()) {
                  return "Model ID is required";
                }
                return undefined;
              },
            }),
          ).trim();
          continue;
        }

        agentModels[agentName] = selectedModel;
      }
    }

    sectionHeader("Step 6/7: Memory", "🧠");
    const enableMemory = resolveBoolean(
      await confirm({
        message: "Enable memory system?",
        initialValue: true,
      }),
    );

    let memoryConfig: MemorySetupInput | undefined;
    let memoryProvider: MemoryProvider | null = null;
    let memoryPreview: Awaited<ReturnType<typeof setupMemoryDependencies>> | undefined;

    if (enableMemory) {
      memoryProvider = toMemoryProvider(
        resolveString(
          await select({
            message: "Embedding provider:",
            options: [
              { value: "local", label: "Local", hint: "Best default, no API key required" },
              { value: "openai", label: "OpenAI", hint: "Requires OPENAI_API_KEY" },
              { value: "ollama", label: "Ollama", hint: "Requires local Ollama server" },
            ],
            initialValue: "local",
          }),
        ),
      );

      memoryConfig = {
        enabled: true,
        workerPort: 37777,
        embeddings: {
          provider: memoryProvider,
        },
        privacy: {
          enabled: true,
          retentionDays: 90,
        },
      };

      const previewSpinner = spinner();
      previewSpinner.start("Checking memory capabilities...");
      memoryPreview = await setupMemoryDependencies(
        memoryConfig,
        false,
        agentModels,
        AGENT_MODEL_SUGGESTIONS["goop-orchestrator"]?.suggestions[0] ?? "anthropic/claude-sonnet-4-6",
        false,
      );
      previewSpinner.stop("Memory capability check complete");
    }

    sectionHeader("Step 7/7: Orchestrator", "🎭");
    const enableOrchestrator = resolveBoolean(
      await confirm({
        message: "Enable GoopSpec orchestrator by default?",
        initialValue: false,
      }),
    );

    let orchestratorModel: string | undefined;
    if (enableOrchestrator) {
      const orchestratorConfig = AGENT_MODEL_SUGGESTIONS["goop-orchestrator"];
      const selectedModel = resolveString(
        await select({
          message: "Orchestrator model:",
          options: [
            ...orchestratorConfig.suggestions.map((model) => ({
              value: model,
              label: model,
            })),
            {
              value: "__custom__",
              label: "Custom (enter model ID)",
              hint: "provider/model-name",
            },
          ],
          initialValue: orchestratorConfig.suggestions[0],
        }),
      );

      if (selectedModel === "__custom__") {
        orchestratorModel = resolveText(
          await text({
            message: "Custom orchestrator model:",
            placeholder: "provider/model-name",
            validate: (value) => {
              if (!value.trim()) {
                return "Model ID is required";
              }
              return undefined;
            },
          }),
        ).trim();
      } else {
        orchestratorModel = selectedModel;
      }
    }

    const input: SetupInput = {
      scope,
      projectName,
      models: {
        orchestrator: orchestratorModel,
      },
      mcpPreset,
      searchProvider,
      enableOrchestrator,
      agentModels: Object.keys(agentModels).length > 0 ? agentModels : undefined,
      memory: memoryConfig,
    };

    console.log();
    sectionHeader("Configuration Summary", "📋");
    console.log(pc.dim(`  Project: ${projectName}`));
    console.log(pc.dim(`  Scope: ${formatScope(scope)}`));
    console.log(pc.dim(`  MCP preset: ${formatMcpPreset(mcpPreset)} (${MCP_PRESETS[mcpPreset].join(", ") || "none"})`));
    console.log(pc.dim(`  Search provider: ${formatSearchProvider(searchProvider)}`));
    console.log(pc.dim(`  Agent models: ${Object.keys(agentModels).length > 0 ? "Custom per-agent" : "Recommended defaults"}`));
    console.log(pc.dim(`  Memory: ${enableMemory ? "Enabled" : "Disabled"}`));
    if (memoryProvider) {
      console.log(pc.dim(`  Memory provider: ${formatMemoryProvider(memoryProvider)}`));
    }
    console.log(pc.dim(`  Orchestrator: ${enableOrchestrator ? "Enabled" : "Disabled"}`));
    if (orchestratorModel) {
      console.log(pc.dim(`  Orchestrator model: ${orchestratorModel}`));
    }
    if (memoryPreview?.distillation.enabled) {
      console.log(pc.dim(`  Distillation model: ${memoryPreview.distillation.model ?? "default"}`));
    }
    console.log();

    const proceed = resolveBoolean(
      await confirm({
        message: "Apply this setup now?",
        initialValue: true,
      }),
    );

    if (!proceed) {
      outro("Setup cancelled");
      return;
    }

    const setupSpinner = spinner();
    setupSpinner.start("Planning setup actions...");
    const plan = await planInit(projectDir, input, env);
    setupSpinner.message("Applying configuration, installing MCPs, and preparing memory...");
    const result = await applyInit(projectDir, plan);
    setupSpinner.stop(result.success ? "Setup complete" : "Setup finished with issues");

    if (result.success) {
      console.log();
      showSuccess(`Project "${result.projectName}" initialized`);

      console.log();
      sectionHeader("Created", "🛠️");
      if (result.created.length === 0 && result.configsWritten.length === 0) {
        console.log(pc.dim("  No new files were created"));
      } else {
        for (const createdPath of result.created) {
          console.log(pc.dim(`  + ${createdPath}`));
        }
        for (const configPath of result.configsWritten) {
          console.log(pc.dim(`  + ${configPath}`));
        }
      }

      console.log();
      sectionHeader("MCP Installation", "🔌");
      if (result.mcpsInstalled.length > 0) {
        console.log(pc.dim(`  Installed: ${result.mcpsInstalled.join(", ")}`));
      } else {
        console.log(pc.dim("  Installed: none"));
      }
      const selectedMcps = MCP_PRESETS[mcpPreset];
      const missingMcps = selectedMcps.filter((mcp) => !result.mcpsInstalled.includes(mcp));
      if (missingMcps.length > 0) {
        console.log(pc.dim(`  Missing: ${missingMcps.join(", ")}`));
      }

      const memoryStatus = result.memorySetup ?? memoryPreview;
      if (memoryStatus) {
        console.log();
        sectionHeader("Memory Setup", "🧠");
        console.log(pc.dim(`  Enabled: ${memoryStatus.enabled ? "yes" : "no"}`));
        console.log(pc.dim(`  Vector search: ${memoryStatus.vectorSearch.enabled ? "available" : "degraded"}`));
        console.log(pc.dim(`  Local embeddings: ${memoryStatus.localEmbeddings.enabled ? "available" : "degraded"}`));
        console.log(
          pc.dim(
            `  Distillation: ${memoryStatus.distillation.enabled ? `enabled (${memoryStatus.distillation.model ?? "default"})` : "disabled"}`,
          ),
        );
      }

      if (result.warnings.length > 0) {
        console.log();
        sectionHeader("Warnings", "⚠️");
        for (const warning of result.warnings) {
          showWarning(warning);
        }
      }

      console.log();
      outro(pc.green("GoopSpec is ready! Run 'goopspec status' to see your configuration."));
      return;
    }

    console.log();
    sectionHeader("Errors", "❌");
    for (const error of result.errors) {
      showError(error);
    }

    if (result.warnings.length > 0) {
      console.log();
      sectionHeader("Warnings", "⚠️");
      for (const warning of result.warnings) {
        showWarning(warning);
      }
    }

    outro(pc.red("Setup completed with errors. Run 'goopspec verify' for details."));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    showError(message, "Check file permissions and try again");
    process.exit(1);
  }
}
