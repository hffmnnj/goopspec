/**
 * GoopSpec Setup Tool
 * Configuration tool for GoopSpec - works with agent-driven setup flow
 * 
 * @module tools/goop-setup
 */

import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import type { PluginContext, ToolContext } from "../../core/types.js";
import {
  detectEnvironment, 
  planSetup, 
  applySetup,
  planInit,
  applyInit,
  verifySetup,
  resetSetup,
  getSetupStatus,
} from "../../features/setup/index.js";
import { detectPlatform, getSqliteVecPackage } from "../../features/setup/platform.js";
import { AGENT_MODEL_SUGGESTIONS } from "../../features/setup/model-suggestions.js";
import { detectWorktree, type WorktreeDetectionResult } from "../../features/worktree/detector.js";
import type { 
  SetupInput, 
  SetupEnvironment,
  SetupPlan,
  SetupResult,
  InitResult,
  VerificationResult,
  ResetResult,
  SetupStatus,
  MemorySetupInput,
  MemorySetupResult,
} from "../../features/setup/types.js";

// ============================================================================
// Formatting Functions
// ============================================================================

function ensureGoopspecGitignoreEntry(projectDir: string): void {
  const gitignorePath = join(projectDir, ".gitignore");
  const gitignoreEntry = ".goopspec/";

  if (!existsSync(gitignorePath)) {
    writeFileSync(gitignorePath, `${gitignoreEntry}\n`, "utf-8");
    return;
  }

  const content = readFileSync(gitignorePath, "utf-8");
  const hasGoopspecEntry = content
    .split(/\r?\n/)
    .some((line) => line.trim().replace(/\/+$/, "") === ".goopspec");

  if (hasGoopspecEntry) {
    return;
  }

  const separator = content.length > 0 && !content.endsWith("\n") ? "\n" : "";
  appendFileSync(gitignorePath, `${separator}${gitignoreEntry}\n`, "utf-8");
}

/**
 * Format environment detection for display
 */
function formatEnvironment(env: SetupEnvironment): string {
  const lines = [
    "# GoopSpec Environment Detection",
    "",
    "## Directory Structure",
    "",
    `- **.goopspec directory**: ${env.hasGoopspecDir ? "✅ Found" : "❌ Not found"} (${env.goopspecDir})`,
    `- **state.json**: ${env.hasStateFile ? "✅ Found" : "❌ Not found"}`,
    `- **ADL.md**: ${env.hasADLFile ? "✅ Found" : "❌ Not found"}`,
    `- **memory directory**: ${env.hasMemoryDir ? "✅ Found" : "❌ Not found"}`,
    "",
    "## Configuration Files",
    "",
    `- **OpenCode config**: ${env.hasOpenCodeConfig ? "Found" : "Not found"} (${env.opencodeConfigPath})`,
    `- **Global GoopSpec config**: ${env.hasGlobalGoopSpecConfig ? "Found" : "Not found"} (${env.globalConfigPath})`,
    `- **Project GoopSpec config**: ${env.hasProjectGoopSpecConfig ? "Found" : "Not found"} (${env.projectConfigPath})`,
    "",
    "## Installed MCPs",
    "",
  ];
  
  if (env.existingMcps.length > 0) {
    lines.push(...env.existingMcps.map(m => `- ${m}`));
  } else {
    lines.push("No MCPs detected");
  }
  
  lines.push("");
  lines.push("## Available Actions");
  lines.push("");
  lines.push("| Action | Description |");
  lines.push("|--------|-------------|");
  lines.push("| `init` | Full first-time setup wizard |");
  lines.push("| `plan` | Preview changes before applying |");
  lines.push("| `apply` | Write configuration changes |");
  lines.push("| `verify` | Check if setup is complete and working |");
  lines.push("| `reset` | Reset configuration to defaults |");
  lines.push("| `models` | Show agent model suggestions |");
  lines.push("| `status` | Show current configuration summary |");
  
  return lines.join("\n");
}

/**
 * Format model suggestions for display
 */
function formatModelSuggestions(): string {
  const lines = [
    "# GoopSpec Agent Model Configuration",
    "",
    "Configure models for each GoopSpec agent. Each agent has recommended models optimized for its role.",
    "",
    "## Available Agents and Recommended Models",
    "",
  ];
  
  for (const [agentName, config] of Object.entries(AGENT_MODEL_SUGGESTIONS)) {
    lines.push(`### ${agentName}`);
    lines.push(`*${config.description}*`);
    lines.push("");
    lines.push("**Suggestions:**");
    for (let i = 0; i < config.suggestions.length; i++) {
      const model = config.suggestions[i];
      lines.push(`${i + 1}. \`${model}\``);
    }
    lines.push("");
  }
  
  lines.push("---");
  lines.push("");
  lines.push("## Usage");
  lines.push("");
  lines.push("To configure tiered executor models in project config:");
  lines.push("```json");
  lines.push("{");
  lines.push('  "agents": {');
  lines.push('    "goop-orchestrator": { "model": "openai/gpt-5.3-codex" },');
  lines.push('    "goop-executor-low": { "model": "anthropic/claude-sonnet-4-6" },');
  lines.push('    "goop-executor-medium": { "model": "kimi-for-coding/k2p5" },');
  lines.push('    "goop-executor-high": { "model": "openai/gpt-5.3-codex" },');
  lines.push('    "goop-executor-frontend": { "model": "anthropic/claude-opus-4-6" }');
  lines.push("  }");
  lines.push("}");
  lines.push("```");
  lines.push("");
  lines.push("You can also enter custom model names not in the suggestions list.");
  
  return lines.join("\n");
}

/**
 * Format plan for display
 */
function formatPlan(plan: SetupPlan): string {
  const lines = [
    "# GoopSpec Setup Plan",
    "",
    "## Summary",
    plan.summary,
    "",
  ];
  
  if (plan.isInit) {
    lines.push("## Initialization");
    lines.push(`- Project name: ${plan.projectName ?? "unnamed"}`);
    lines.push("");
  }

  if (plan.searchProvider) {
    lines.push("## Search Provider");
    lines.push(`- Provider: ${plan.searchProvider === "brave" ? "Brave Search" : "Exa"}`);
    if (plan.searchProvider === "brave") {
      lines.push("- API key guidance: Set BRAVE_API_KEY environment variable");
    } else {
      lines.push("- API key guidance: Set EXA_API_KEY environment variable or configure Exa MCP server");
    }
    lines.push("");
  }
  
  if (plan.dirsToCreate && plan.dirsToCreate.length > 0) {
    lines.push("## Directories to Create");
    lines.push(...plan.dirsToCreate.map(d => `- ${d}`));
    lines.push("");
  }
  
  if (plan.agentModels && Object.keys(plan.agentModels).length > 0) {
    lines.push("## Agent Models to Configure");
    lines.push("");
    lines.push("| Agent | Model |");
    lines.push("|-------|-------|");
    for (const [agent, model] of Object.entries(plan.agentModels)) {
      lines.push(`| ${agent} | \`${model}\` |`);
    }
    lines.push("");
  }
  
  if (plan.memoryConfig) {
    lines.push("## Memory Configuration");
    lines.push(`- Enabled: ${plan.memoryConfig.enabled !== false ? "yes" : "no"}`);
    if (plan.memoryConfig.embeddings?.provider) {
      lines.push(`- Embedding provider: ${plan.memoryConfig.embeddings.provider}`);
    }
    if (plan.memoryConfig.workerPort) {
      lines.push(`- Worker port: ${plan.memoryConfig.workerPort}`);
    }
    lines.push("");
  }
  
  if (plan.mcpsToInstall.length > 0) {
    lines.push("## MCPs to Install");
    lines.push(...plan.mcpsToInstall.map(m => `- ${m}`));
    lines.push("");
  }
  
  if (plan.configsToWrite.length > 0) {
    lines.push("## Configurations to Write");
    lines.push(...plan.configsToWrite.map(c => `- **${c.scope}**: ${c.path}`));
    lines.push("");
  }
  
  return lines.join("\n");
}

/**
 * Format result for display
 */
function formatResult(result: SetupResult, searchProvider?: "exa" | "brave"): string {
  const lines = ["# GoopSpec Setup Result", ""];
  
  if (result.success) {
    lines.push("✅ Setup completed successfully!");
    lines.push("");
  } else {
    lines.push("⚠️ Setup completed with errors");
    lines.push("");
  }
  
  if (result.configsWritten.length > 0) {
    lines.push("## Configurations Written");
    lines.push(...result.configsWritten.map(c => `- ${c}`));
    lines.push("");
  }
  
  if (result.mcpsInstalled.length > 0) {
    lines.push("## MCPs Installed");
    lines.push(...result.mcpsInstalled.map(m => `- ${m}`));
    lines.push("");
  }
  
  if (result.warnings.length > 0) {
    lines.push("## Warnings");
    lines.push(...result.warnings.map(w => `- ⚠️ ${w}`));
    lines.push("");
  }
  
  if (result.errors.length > 0) {
    lines.push("## Errors");
    lines.push(...result.errors.map(e => `- ❌ ${e}`));
    lines.push("");
  }

  if (searchProvider) {
    lines.push("## Search Provider");
    lines.push(`- Provider: ${searchProvider === "brave" ? "Brave Search" : "Exa"}`);
    if (searchProvider === "brave") {
      lines.push("- API key guidance: Set BRAVE_API_KEY environment variable");
    } else {
      lines.push("- API key guidance: Set EXA_API_KEY environment variable or configure Exa MCP server");
    }
    lines.push("");
  }
  
  if (result.success) {
    lines.push("## Next Steps");
    lines.push("- Run `/goop-status` to verify your configuration");
    lines.push("- Start using GoopSpec for spec-driven development");
    lines.push("- Try `/goop-discuss` to begin a new project");
  }
  
  return lines.join("\n");
}

/**
 * Format memory setup status for display
 */
function formatMemoryStatus(memorySetup: MemorySetupResult): string {
  const lines: string[] = ["## Memory System", ""];
  const platform = detectPlatform();
  const sqliteVecPackage = getSqliteVecPackage(platform);
  
  lines.push(`**Status**: ${memorySetup.enabled ? "✅ Enabled" : "❌ Disabled"}`);
  lines.push("");
  
  // Vector search
  const vectorIcon = memorySetup.vectorSearch.enabled ? "✅" : "⚠️";
  lines.push(`### ${vectorIcon} Vector Search`);
  if (memorySetup.vectorSearch.enabled) {
    lines.push("Semantic similarity search is available.");
  } else {
    lines.push(`Not available: ${memorySetup.vectorSearch.error ?? "Not installed"}`);
    lines.push("*Memory search will use keyword matching only (FTS5).*");
    lines.push("");
    lines.push("**To enable:** Install sqlite-vec for your platform:");
    lines.push("```bash");
    lines.push(`bun add ${sqliteVecPackage}  # ${platform.description}`);
    lines.push("```");
  }
  lines.push("");
  
  // Local embeddings
  const embeddingIcon = memorySetup.localEmbeddings.enabled ? "✅" : "⚠️";
  lines.push(`### ${embeddingIcon} Local Embeddings`);
  if (memorySetup.localEmbeddings.enabled) {
    lines.push("Local embedding generation is available (no API costs).");
  } else {
    lines.push(`Not available: ${memorySetup.localEmbeddings.error ?? "Not installed"}`);
    lines.push("*Configure OPENAI_API_KEY for embeddings, or embeddings will be disabled.*");
    lines.push("");
    lines.push("**To enable:** Install ONNX runtime and transformers:");
    lines.push("```bash");
    lines.push("bun add onnxruntime-node @huggingface/transformers");
    lines.push("```");
  }
  lines.push("");
  
  // Distillation
  const distillIcon = memorySetup.distillation.enabled ? "✅" : "⏸️";
  lines.push(`### ${distillIcon} Session Distillation`);
  if (memorySetup.distillation.enabled) {
    lines.push(`Enabled, using model: \`${memorySetup.distillation.model ?? "default"}\``);
    lines.push("Session learnings will be automatically extracted at session end.");
  } else {
    lines.push("Disabled. Enable in config to auto-extract session learnings.");
  }
  lines.push("");
  
  // Degraded features summary
  if (memorySetup.degradedFeatures.length > 0) {
    lines.push("### ⚠️ Degraded Features");
    lines.push("");
    for (const feature of memorySetup.degradedFeatures) {
      lines.push(`- ${feature}`);
    }
    lines.push("");
    lines.push("*Run `goop_setup(action: 'verify')` for detailed diagnostics.*");
  }
  
  return lines.join("\n");
}

/**
 * Format init result for display
 */
function formatInitResult(result: InitResult, searchProvider?: "exa" | "brave"): string {
  const lines = ["# GoopSpec Initialization Result", ""];
  
  if (result.success) {
    lines.push(`✅ Project "${result.projectName}" initialized successfully!`);
    lines.push("");
  } else {
    lines.push("⚠️ Initialization completed with errors");
    lines.push("");
  }
  
  if (result.created.length > 0) {
    lines.push("## Created");
    lines.push(...result.created.map(c => `- ${c}`));
    lines.push("");
  }
  
  if (result.configsWritten.length > 0) {
    lines.push("## Configurations Written");
    lines.push(...result.configsWritten.map(c => `- ${c}`));
    lines.push("");
  }

  if (searchProvider) {
    lines.push("## Search Provider");
    lines.push(`- Provider: ${searchProvider === "brave" ? "Brave Search" : "Exa"}`);
    if (searchProvider === "brave") {
      lines.push("- API key guidance: Set BRAVE_API_KEY environment variable");
    } else {
      lines.push("- API key guidance: Set EXA_API_KEY environment variable or configure Exa MCP server");
    }
    lines.push("");
  }
  
  if (result.mcpsInstalled.length > 0) {
    lines.push("## MCPs Installed");
    lines.push(...result.mcpsInstalled.map(m => `- ${m}`));
    lines.push("");
  }
  
  // Add memory status if available
  if (result.memorySetup) {
    lines.push(formatMemoryStatus(result.memorySetup));
    lines.push("");
  }
  
  if (result.warnings.length > 0) {
    lines.push("## Warnings");
    lines.push(...result.warnings.map(w => `- ⚠️ ${w}`));
    lines.push("");
  }
  
  if (result.errors.length > 0) {
    lines.push("## Errors");
    lines.push(...result.errors.map(e => `- ❌ ${e}`));
    lines.push("");
  }
  
  if (result.success) {
    lines.push("## Next Steps");
    lines.push("1. Run `goop_setup(action: 'verify')` to check your setup");
    lines.push("2. Use `/goop-discuss` to start planning your first feature");
    lines.push("3. Try `/goop-help` for available commands");
  }
  
  return lines.join("\n");
}

/**
 * Format verification result for display
 */
function formatVerificationResult(result: VerificationResult): string {
  const lines = [
    "# GoopSpec Setup Verification",
    "",
    `**Status**: ${result.success ? "✅ All checks passed" : "⚠️ Some checks failed"}`,
    `**Timestamp**: ${result.timestamp}`,
    "",
    "## Check Results",
    "",
    "| Check | Status | Message |",
    "|-------|--------|---------|",
  ];
  
  for (const check of result.checks) {
    const status = check.passed ? "✅" : "❌";
    lines.push(`| ${check.name} | ${status} | ${check.message} |`);
  }
  
  lines.push("");
  lines.push("## Summary");
  lines.push(`- **Total**: ${result.summary.total}`);
  lines.push(`- **Passed**: ${result.summary.passed}`);
  lines.push(`- **Failed**: ${result.summary.failed}`);
  lines.push(`- **Warnings**: ${result.summary.warnings}`);
  
  // Show suggested fixes for failed checks
  const failedChecks = result.checks.filter(c => !c.passed && c.suggestedFix);
  if (failedChecks.length > 0) {
    lines.push("");
    lines.push("## Suggested Fixes");
    for (const check of failedChecks) {
      lines.push(`- **${check.name}**: ${check.suggestedFix}`);
    }
  }
  
  return lines.join("\n");
}

/**
 * Format reset result for display
 */
function formatResetResult(result: ResetResult): string {
  const lines = ["# GoopSpec Reset Result", ""];
  
  if (result.success) {
    lines.push("✅ Reset completed successfully!");
    lines.push("");
  } else {
    lines.push("⚠️ Reset encountered errors");
    lines.push("");
  }
  
  if (result.reset.length > 0) {
    lines.push("## Reset");
    lines.push(...result.reset.map(r => `- ${r}`));
    lines.push("");
  }
  
  if (result.preserved.length > 0) {
    lines.push("## Preserved (user data)");
    lines.push(...result.preserved.map(p => `- ${p}`));
    lines.push("");
  }
  
  if (result.errors.length > 0) {
    lines.push("## Errors");
    lines.push(...result.errors.map(e => `- ❌ ${e}`));
    lines.push("");
  }
  
  return lines.join("\n");
}

/**
 * Format status for display
 */
function formatStatus(status: SetupStatus, worktree?: WorktreeDetectionResult): string {
  const lines = [
    "# GoopSpec Configuration Status",
    "",
    `**Initialized**: ${status.initialized ? "✅ Yes" : "❌ No"}`,
  ];
  
  if (status.projectName) {
    lines.push(`**Project**: ${status.projectName}`);
  }
  
  lines.push("");
  lines.push("## Configuration Scope");
  lines.push(`- Global config: ${status.scope.hasGlobal ? "✅" : "❌"}`);
  lines.push(`- Project config: ${status.scope.hasProject ? "✅" : "❌"}`);
  
  lines.push("");
  lines.push("## Memory System");
  lines.push(`- Configured: ${status.memory.configured ? "✅" : "❌"}`);
  lines.push(`- Enabled: ${status.memory.enabled ? "✅" : "❌"}`);
  if (status.memory.provider) {
    lines.push(`- Provider: ${status.memory.provider}`);
  }
  if (status.memory.workerRunning !== undefined) {
    lines.push(`- Worker: ${status.memory.workerRunning ? "🟢 Running" : "🔴 Stopped"}`);
  }
  
  lines.push("");
  lines.push("## MCPs");
  if (status.mcps.installed.length > 0) {
    lines.push(`- Installed: ${status.mcps.installed.join(", ")}`);
  } else {
    lines.push("- Installed: none");
  }
  if (status.mcps.missing.length > 0) {
    lines.push(`- Recommended: ${status.mcps.missing.join(", ")}`);
  }

  lines.push(`- Search provider: ${status.searchProvider === "brave" ? "Brave Search" : "Exa"}`);
  
  if (Object.keys(status.agentModels).length > 0) {
    lines.push("");
    lines.push("## Agent Models");
    for (const [agent, model] of Object.entries(status.agentModels)) {
      lines.push(`- ${agent}: \`${model}\``);
    }
  }

  if (worktree) {
    lines.push("");
    lines.push("## Worktree Status");
    lines.push(`- In worktree: ${worktree.isWorktree ? "Yes" : "No"}`);
    lines.push(`- Worktree path: ${worktree.worktreePath ?? "None"}`);
    lines.push(`- Branch: ${worktree.branchName ?? "N/A"}`);
    lines.push(`- Inferred workflow ID: ${worktree.inferredWorkflowId ?? "None"}`);
  }
  
  return lines.join("\n");
}

// ============================================================================
// Tool Definition
// ============================================================================

/**
 * Create the goop-setup tool
 */
export function createGoopSetupTool(ctx: PluginContext): ToolDefinition {
  return tool({
    description: "GoopSpec configuration and setup tool for detect/init/plan/apply/verify/reset/models/status actions.",
    args: {
      action: tool.schema.enum(["detect", "init", "plan", "apply", "verify", "reset", "models", "status"]),
      // Scope options
      scope: tool.schema.enum(["global", "project", "both"]).optional(),
      // Init options
      projectName: tool.schema.string().optional(),
      // Model options
      orchestratorModel: tool.schema.string().optional(),
      defaultModel: tool.schema.string().optional(),
      agentModels: tool.schema.record(tool.schema.string(), tool.schema.string()).optional(),
      // MCP options
      mcpPreset: tool.schema.enum(["core", "recommended", "none"]).optional(),
      searchProvider: tool.schema.enum(["exa", "brave"]).optional(),
      // Orchestrator options
      enableOrchestrator: tool.schema.boolean().optional(),
      // Memory options
      memoryEnabled: tool.schema.boolean().optional(),
      memoryProvider: tool.schema.enum(["local", "openai", "ollama"]).optional(),
      memoryWorkerPort: tool.schema.number().optional(),
      gitignoreGoopspec: tool.schema.boolean().optional(),
      // Reset options
      preserveData: tool.schema.boolean().optional(),
      confirmed: tool.schema.boolean().optional(),
      // Quick mode
      quick: tool.schema.boolean().optional(),
    },
    async execute(args, toolCtx: ToolContext): Promise<string> {
      try {
        const projectDir = toolCtx.directory;

        if (args.gitignoreGoopspec !== undefined) {
          ctx.stateManager.updateWorkflow({ gitignoreGoopspec: args.gitignoreGoopspec });

          if (args.gitignoreGoopspec) {
            ensureGoopspecGitignoreEntry(projectDir);
          }
        }
        
        // ====================================================================
        // Models action: show model suggestions for all agents
        // ====================================================================
        if (args.action === "models") {
          return formatModelSuggestions();
        }
        
        // ====================================================================
        // Detect action: show current environment state
        // ====================================================================
        if (args.action === "detect") {
          const env = await detectEnvironment(projectDir);
          return formatEnvironment(env);
        }
        
        // ====================================================================
        // Status action: show current configuration summary
        // ====================================================================
        if (args.action === "status") {
          const status = await getSetupStatus(projectDir);
          const worktree = await detectWorktree(ctx);
          return formatStatus(status, worktree);
        }
        
        // ====================================================================
        // Verify action: check if setup is complete and working
        // ====================================================================
        if (args.action === "verify") {
          const result = await verifySetup(projectDir);
          return formatVerificationResult(result);
        }
        
        // ====================================================================
        // Reset action: reset configuration to defaults
        // ====================================================================
        if (args.action === "reset") {
          if (!args.scope) {
            return "Error: 'scope' is required for reset action. Use scope='global', 'project', or 'both'.";
          }
          
          const result = await resetSetup(projectDir, {
            scope: args.scope,
            preserveData: args.preserveData,
            confirmed: args.confirmed,
          });
          return formatResetResult(result);
        }
        
        // ====================================================================
        // Build setup input for init/plan/apply actions
        // ====================================================================
        
        // Build memory config if any memory options provided
        let memoryConfig: MemorySetupInput | undefined;
        if (args.memoryEnabled !== undefined || args.memoryProvider || args.memoryWorkerPort) {
          memoryConfig = {
            enabled: args.memoryEnabled,
            workerPort: args.memoryWorkerPort,
            embeddings: args.memoryProvider ? { provider: args.memoryProvider } : undefined,
          };
        }
        
        // For init, plan, apply we need scope
        if (!args.scope) {
          return "Error: 'scope' is required for init/plan/apply actions. Use scope='global', 'project', or 'both'.";
        }
        
        // Build setup input from args
        const input: SetupInput = {
          scope: args.scope,
          projectName: args.projectName,
          models: {
            orchestrator: args.orchestratorModel,
            default: args.defaultModel,
          },
          mcpPreset: args.mcpPreset ?? "recommended",
          searchProvider: args.searchProvider ?? "exa",
          enableOrchestrator: args.enableOrchestrator,
          agentModels: args.agentModels,
          memory: memoryConfig,
          quick: args.quick,
          gitignoreGoopspec: args.gitignoreGoopspec,
        };
        
        // Detect environment
        const env = await detectEnvironment(projectDir);
        
        // ====================================================================
        // Init action: full first-time initialization
        // ====================================================================
        if (args.action === "init") {
          // Generate init plan
          const plan = await planInit(projectDir, input, env);
          
          // Add agent models to plan if provided
          if (args.agentModels) {
            plan.agentModels = args.agentModels;
          }
          
          // Execute init
          const result = await applyInit(projectDir, plan);
          return formatInitResult(result, plan.searchProvider);
        }
        
        // ====================================================================
        // Plan action: show what would change
        // ====================================================================
        if (args.action === "plan") {
          const plan = await planSetup(input, env);
          
          // Add agent models to plan if provided
          if (args.agentModels) {
            plan.agentModels = args.agentModels;
          }
          
          return formatPlan(plan);
        }
        
        // ====================================================================
        // Apply action: execute the plan
        // ====================================================================
        if (args.action === "apply") {
          const plan = await planSetup(input, env);
          
          // Add agent models to plan if provided
          if (args.agentModels) {
            plan.agentModels = args.agentModels;
          }
          
          const result = await applySetup(plan);
          return formatResult(result, plan.searchProvider);
        }
        
        return `Unknown action: ${args.action}`;
        
      } catch (error) {
        return `Setup failed: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  });
}

// Export for use in commands
export {
  AGENT_MODEL_SUGGESTIONS,
  AGENT_MODEL_SUGGESTIONS as agentModelSuggestions,
  ALL_AGENTS,
} from "../../features/setup/model-suggestions.js";
