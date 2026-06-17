/**
 * Daemon Projects Tool
 * List, register, and deregister projects with the GoopSpec daemon.
 *
 * @module tools/goop-daemon-projects
 */

import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool";
import type { PluginContext, ToolContext } from "../../core/types.js";
import {
  DaemonClient,
  DaemonUnavailableError,
  DaemonApiError,
} from "../../features/daemon/client.js";

interface Project {
  id: string;
  name: string;
  path: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

const DAEMON_UNAVAILABLE_MSG =
  "GoopSpec Daemon is not running. Start it with: `bun run daemon`";

function formatProjectList(projects: Project[]): string {
  if (projects.length === 0) {
    return "No projects registered with the daemon.";
  }

  const lines: string[] = [
    "## Registered Projects",
    "",
    "| Name | Path | ID |",
    "|------|------|----|",
  ];

  for (const p of projects) {
    lines.push(`| ${p.name} | \`${p.path}\` | ${p.id} |`);
  }

  return lines.join("\n");
}

export function createGoopDaemonProjectsTool(ctx: PluginContext): ToolDefinition {
  return tool({
    description:
      "List, register, or deregister projects with the GoopSpec daemon",
    args: {
      action: tool.schema
        .enum(["list", "register", "deregister"])
        .describe("Action to perform"),
      path: tool.schema
        .string()
        .optional()
        .describe("Project path (defaults to current project directory)"),
      name: tool.schema
        .string()
        .optional()
        .describe("Project name (used when registering)"),
      id: tool.schema
        .string()
        .optional()
        .describe("Project ID (used when deregistering)"),
    },
    async execute(
      args: { action: "list" | "register" | "deregister"; path?: string; name?: string; id?: string },
      _context: ToolContext,
    ): Promise<string> {
      const client = new DaemonClient();

      try {
        switch (args.action) {
          case "list": {
            const data = await client.get<{ projects: Project[] }>("/api/projects");
            return formatProjectList(data.projects);
          }

          case "register": {
            const projectPath = args.path || ctx.input.directory;
            const projectName = args.name || ctx.stateManager.getState().project?.name || "unnamed";
            const data = await client.post<{ project: Project }>("/api/projects", {
              name: projectName,
              path: projectPath,
            });
            return `Project registered: **${data.project.name}** (ID: ${data.project.id})`;
          }

          case "deregister": {
            if (!args.id) {
              return "Error: `id` is required to deregister a project.";
            }
            await client.delete(`/api/projects/${args.id}`);
            return `Project ${args.id} deregistered.`;
          }
        }
      } catch (error) {
        if (error instanceof DaemonUnavailableError) {
          return DAEMON_UNAVAILABLE_MSG;
        }
        if (error instanceof DaemonApiError) {
          return `Daemon API error (${error.statusCode}): ${error.message}`;
        }
        return `Error: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  });
}
