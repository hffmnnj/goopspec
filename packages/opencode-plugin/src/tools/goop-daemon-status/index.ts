/**
 * Daemon Status Tool
 * Reports health and availability of the GoopSpec daemon process.
 *
 * @module tools/goop-daemon-status
 */

import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool";
import type { PluginContext, ToolContext } from "../../core/types.js";
import { DaemonClient, DaemonUnavailableError } from "../../features/daemon/client.js";

interface DaemonHealth {
  status: "ok" | "degraded";
  uptime: number;
  version: string;
  projectCount: number;
  activeWorkflows: number;
  timestamp: string;
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(" ");
}

function formatHealth(health: DaemonHealth): string {
  const statusIcon = health.status === "ok" ? "✅" : "⚠️";
  const lines: string[] = [
    "## GoopSpec Daemon",
    "",
    `- **Status:** ${statusIcon} ${health.status}`,
    `- **Version:** ${health.version}`,
    `- **Uptime:** ${formatUptime(health.uptime)}`,
    `- **Projects:** ${health.projectCount}`,
    `- **Active Workflows:** ${health.activeWorkflows}`,
    `- **Timestamp:** ${health.timestamp}`,
  ];
  return lines.join("\n");
}

const DAEMON_UNAVAILABLE_MSG =
  "GoopSpec Daemon is not running. Start it with: `bun run daemon`";

export function createGoopDaemonStatusTool(_ctx: PluginContext): ToolDefinition {
  return tool({
    description:
      "Check the health and availability of the GoopSpec daemon process",
    args: {},
    async execute(_args: Record<string, never>, _context: ToolContext): Promise<string> {
      const client = new DaemonClient();
      try {
        const health = await client.get<DaemonHealth>("/health");
        return formatHealth(health);
      } catch (error) {
        if (error instanceof DaemonUnavailableError) {
          return DAEMON_UNAVAILABLE_MSG;
        }
        return `Daemon error: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  });
}
