/**
 * GoopSpec Setup Tool — Simplified for 1.0.0 (plugin-only).
 *
 * Actions: detect | init | plan | apply | verify | reset | models | status
 *
 * Dropped from 0.2.x: daemon/web/worker setup, MCP installation, platform
 * detection, dependency installation. Memory is in-process via bun:sqlite.
 *
 * @module tools/goop-setup
 */

import { tool } from "../../core/sdk-compat.js";
import type { ToolContext, ToolDefinition } from "../../core/sdk-compat.js";
import type { PluginContext } from "../../core/types.js";
import {
  detect,
  ensureGitignoreEntry,
  formatModelInfo,
  getStatus,
  init,
  reset,
  updateConfig,
  verify,
} from "../../features/setup/index.js";

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

function formatDetect(result: ReturnType<typeof detect>): string {
  const lines = [
    "# GoopSpec Environment Detection",
    "",
    "## Directory Structure",
    "",
    `- **.goopspec/**: ${result.hasGoopspecDir ? "Found" : "Not found"}`,
    `- **state.json**: ${result.hasStateFile ? "Found" : "Not found"}`,
    `- **config.json**: ${result.hasConfigFile ? "Found" : "Not found"}`,
    `- **package.json**: ${result.hasPackageJson ? "Found" : "Not found"}`,
    "",
    "## Project",
    "",
    `- **Name**: ${result.projectName ?? "unknown"}`,
    `- **Stack**: ${result.detectedStack.length > 0 ? result.detectedStack.join(", ") : "not detected"}`,
    "",
    "## Available Actions",
    "",
    "| Action | Description |",
    "|--------|-------------|",
    "| `init` | Create .goopspec/ structure and config |",
    "| `models` | View/configure per-role model routing |",
    "| `verify` | Health check the setup |",
    "| `status` | Show current configuration |",
    "| `reset` | Reset configuration to defaults |",
  ];
  return lines.join("\n");
}

function formatInit(result: ReturnType<typeof init>): string {
  const lines = ["# GoopSpec Initialisation", ""];

  if (result.success) {
    lines.push("Setup completed successfully.");
    lines.push("");
  } else {
    lines.push("Setup completed with errors.");
    lines.push("");
  }

  if (result.created.length > 0) {
    lines.push("## Created");
    for (const item of result.created) {
      lines.push(`- ${item}`);
    }
    lines.push("");
  }

  if (result.errors.length > 0) {
    lines.push("## Errors");
    for (const err of result.errors) {
      lines.push(`- ${err}`);
    }
    lines.push("");
  }

  if (result.success) {
    lines.push("## Next Steps");
    lines.push('1. Run `goop_setup(action: "verify")` to check setup health');
    lines.push("2. Use `/goop-discuss` to start planning a feature");
  }

  return lines.join("\n");
}

function formatVerify(result: ReturnType<typeof verify>): string {
  const lines = [
    "# GoopSpec Setup Verification",
    "",
    `**Result**: ${result.success ? "All checks passed" : "Some checks failed"}`,
    "",
    "| Check | Status | Message |",
    "|-------|--------|---------|",
  ];

  for (const check of result.checks) {
    const icon = check.passed ? "PASS" : "FAIL";
    lines.push(`| ${check.name} | ${icon} | ${check.message} |`);
  }

  const failed = result.checks.filter((c) => !c.passed && c.fix);
  if (failed.length > 0) {
    lines.push("");
    lines.push("## Suggested Fixes");
    for (const check of failed) {
      lines.push(`- **${check.name}**: ${check.fix}`);
    }
  }

  return lines.join("\n");
}

function formatReset(result: ReturnType<typeof reset>): string {
  const lines = ["# GoopSpec Reset", ""];

  if (result.success) {
    lines.push("Reset completed.");
  } else {
    lines.push("Reset encountered errors.");
  }
  lines.push("");

  if (result.reset.length > 0) {
    lines.push("## Reset");
    for (const item of result.reset) {
      lines.push(`- ${item}`);
    }
    lines.push("");
  }

  if (result.preserved.length > 0) {
    lines.push("## Preserved");
    for (const item of result.preserved) {
      lines.push(`- ${item}`);
    }
    lines.push("");
  }

  if (result.errors.length > 0) {
    lines.push("## Errors");
    for (const err of result.errors) {
      lines.push(`- ${err}`);
    }
  }

  return lines.join("\n");
}

function formatStatus(result: ReturnType<typeof getStatus>): string {
  const lines = [
    "# GoopSpec Configuration Status",
    "",
    `**Initialised**: ${result.initialized ? "Yes" : "No"}`,
  ];

  if (result.projectName) {
    lines.push(`**Project**: ${result.projectName}`);
  }
  if (result.stateVersion != null) {
    lines.push(`**State Version**: v${result.stateVersion}`);
  }
  if (result.activeWorkflow) {
    lines.push(`**Active Workflow**: ${result.activeWorkflow}`);
  }
  if (result.phase) {
    lines.push(`**Phase**: ${result.phase}`);
  }

  if (result.config) {
    lines.push("");
    lines.push("## Config");
    if (result.config.defaultModel) {
      lines.push(`- Default model: \`${result.config.defaultModel}\``);
    }
    lines.push(`- Memory: ${result.config.memoryEnabled !== false ? "enabled" : "disabled"}`);
    if (result.config.agentModels && Object.keys(result.config.agentModels).length > 0) {
      lines.push("- Agent model overrides:");
      for (const [role, model] of Object.entries(result.config.agentModels)) {
        lines.push(`  - ${role}: \`${model}\``);
      }
    }
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Tool factory
// ---------------------------------------------------------------------------

export function createGoopSetupTool(ctx: PluginContext): ToolDefinition {
  return tool({
    description:
      "GoopSpec configuration and setup. " +
      "Actions: detect (inspect project), init (create .goopspec structure), " +
      "models (configure per-role model routing), verify (health check), " +
      "status (show config), reset (reset to defaults). " +
      "Also accepts plan/apply as aliases for init.",
    args: {
      action: tool.schema.enum([
        "detect",
        "init",
        "plan",
        "apply",
        "verify",
        "reset",
        "models",
        "status",
      ]),
      projectName: tool.schema.string().optional(),
      defaultModel: tool.schema.string().optional(),
      agentModels: tool.schema.record(tool.schema.string(), tool.schema.string()).optional(),
      memoryEnabled: tool.schema.boolean().optional(),
      gitignoreGoopspec: tool.schema.boolean().optional(),
      preserveData: tool.schema.boolean().optional(),
      confirmed: tool.schema.boolean().optional(),
      scope: tool.schema.enum(["global", "project", "both"]).optional(),
    },
    async execute(
      args: {
        action: string;
        projectName?: string;
        defaultModel?: string;
        agentModels?: Record<string, string>;
        memoryEnabled?: boolean;
        gitignoreGoopspec?: boolean;
        preserveData?: boolean;
        confirmed?: boolean;
        scope?: string;
      },
      toolCtx: ToolContext,
    ): Promise<string> {
      try {
        const projectDir = toolCtx.directory;

        // Handle gitignore side-effect if requested
        if (args.gitignoreGoopspec !== undefined) {
          ctx.stateManager.updateWorkflow({ gitignoreGoopspec: args.gitignoreGoopspec });
          if (args.gitignoreGoopspec) {
            ensureGitignoreEntry(projectDir);
          }
        }

        switch (args.action) {
          case "detect":
            return formatDetect(detect(projectDir));

          case "init":
          case "plan":
          case "apply": {
            const result = init(projectDir, ctx.stateManager, {
              projectName: args.projectName,
              defaultModel: args.defaultModel,
              agentModels: args.agentModels,
              memoryEnabled: args.memoryEnabled,
              gitignoreGoopspec: args.gitignoreGoopspec,
            });
            return formatInit(result);
          }

          case "models": {
            // If agentModels or defaultModel provided, update config first
            if (args.agentModels || args.defaultModel) {
              updateConfig(projectDir, {
                ...(args.defaultModel ? { defaultModel: args.defaultModel } : {}),
                ...(args.agentModels ? { agentModels: args.agentModels } : {}),
              });
            }
            return formatModelInfo(projectDir);
          }

          case "verify":
            return formatVerify(verify(projectDir));

          case "status":
            return formatStatus(getStatus(projectDir));

          case "reset":
            return formatReset(
              reset(projectDir, {
                preserveData: args.preserveData,
                confirmed: args.confirmed,
              }),
            );

          default:
            return `Unknown action: ${args.action}`;
        }
      } catch (error: unknown) {
        return `Setup failed: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  });
}
