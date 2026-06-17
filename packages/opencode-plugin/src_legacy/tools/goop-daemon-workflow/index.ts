/**
 * Daemon Workflow Tool
 * Query workflow sessions tracked by the GoopSpec daemon.
 *
 * @module tools/goop-daemon-workflow
 */

import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool";
import type { PluginContext, ToolContext } from "../../core/types.js";
import {
  DaemonClient,
  DaemonUnavailableError,
  DaemonApiError,
} from "../../features/daemon/client.js";

interface WorkflowSession {
  id: string;
  projectId: string;
  workItemId?: string;
  workflowId: string;
  phase: string;
  currentWave: number;
  totalWaves: number;
  status: "pending" | "running" | "paused" | "completed" | "failed";
  activeAgent?: string;
  blockerDescription?: string;
  startedAt: string;
  completedAt?: string;
  updatedAt: string;
}

const DAEMON_UNAVAILABLE_MSG =
  "GoopSpec Daemon is not running. Start it with: `bun run daemon`";

const STATUS_ICONS: Record<string, string> = {
  pending: "⏳",
  running: "🔄",
  paused: "⏸️",
  completed: "✅",
  failed: "❌",
};

function formatSession(s: WorkflowSession): string {
  const icon = STATUS_ICONS[s.status] || "❓";
  const lines: string[] = [
    `### ${icon} Session ${s.id}`,
    "",
    `- **Workflow:** ${s.workflowId}`,
    `- **Phase:** ${s.phase}`,
    `- **Status:** ${s.status}`,
    `- **Wave:** ${s.currentWave}/${s.totalWaves}`,
  ];

  if (s.activeAgent) lines.push(`- **Agent:** ${s.activeAgent}`);
  if (s.blockerDescription) lines.push(`- **Blocker:** ${s.blockerDescription}`);
  if (s.workItemId) lines.push(`- **Work Item:** ${s.workItemId}`);
  lines.push(`- **Started:** ${s.startedAt}`);
  if (s.completedAt) lines.push(`- **Completed:** ${s.completedAt}`);

  return lines.join("\n");
}

function formatSessionList(sessions: WorkflowSession[]): string {
  if (sessions.length === 0) {
    return "No workflow sessions found.";
  }

  const lines: string[] = [
    "## Workflow Sessions",
    "",
    "| ID | Workflow | Phase | Status | Wave |",
    "|----|----------|-------|--------|------|",
  ];

  for (const s of sessions) {
    const icon = STATUS_ICONS[s.status] || "❓";
    lines.push(
      `| ${s.id.slice(0, 8)} | ${s.workflowId} | ${s.phase} | ${icon} ${s.status} | ${s.currentWave}/${s.totalWaves} |`,
    );
  }

  return lines.join("\n");
}

export function createGoopDaemonWorkflowTool(_ctx: PluginContext): ToolDefinition {
  return tool({
    description:
      "Query workflow sessions tracked by the GoopSpec daemon",
    args: {
      action: tool.schema
        .enum(["status", "history", "get"])
        .describe("Action: status (current), history (recent sessions), get (specific session)"),
      projectId: tool.schema
        .string()
        .optional()
        .describe("Project ID to filter by"),
      sessionId: tool.schema
        .string()
        .optional()
        .describe("Specific session ID (for 'get' action)"),
    },
    async execute(
      args: { action: "status" | "history" | "get"; projectId?: string; sessionId?: string },
      _context: ToolContext,
    ): Promise<string> {
      const client = new DaemonClient();

      try {
        switch (args.action) {
          case "status":
          case "history": {
            const data = await client.get<{ sessions: WorkflowSession[] }>("/api/workflows");
            let sessions = data.sessions;

            if (args.projectId) {
              sessions = sessions.filter((s) => s.projectId === args.projectId);
            }

            if (args.action === "status") {
              const active = sessions.filter(
                (s) => s.status === "running" || s.status === "pending",
              );
              if (active.length === 0) {
                return "No active workflow sessions.";
              }
              return ["## Active Workflows", "", ...active.map(formatSession)].join("\n");
            }

            return formatSessionList(sessions);
          }

          case "get": {
            if (!args.sessionId) {
              return "Error: `sessionId` is required for the 'get' action.";
            }
            const data = await client.get<{ session: WorkflowSession }>(
              `/api/workflows/${args.sessionId}`,
            );
            return formatSession(data.session);
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
