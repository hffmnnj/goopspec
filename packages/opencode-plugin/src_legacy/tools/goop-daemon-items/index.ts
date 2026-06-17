/**
 * Daemon Work Items Tool
 * Manage work items (features, bugs, chores) tracked by the GoopSpec daemon.
 *
 * @module tools/goop-daemon-items
 */

import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool";
import type { PluginContext, ToolContext } from "../../core/types.js";
import {
  DaemonClient,
  DaemonUnavailableError,
  DaemonApiError,
} from "../../features/daemon/client.js";

interface WorkItem {
  id: string;
  projectId: string;
  title: string;
  description?: string;
  type: "feature" | "bug" | "chore";
  status: "backlog" | "todo" | "in_progress" | "review" | "done";
  priority: "low" | "medium" | "high" | "critical";
  tags: string[];
  orderIndex: number;
  createdAt: string;
  updatedAt: string;
}

const DAEMON_UNAVAILABLE_MSG =
  "GoopSpec Daemon is not running. Start it with: `bun run daemon`";

const TYPE_ICONS: Record<string, string> = {
  feature: "✨",
  bug: "🐛",
  chore: "🔧",
};

const PRIORITY_ICONS: Record<string, string> = {
  low: "🟢",
  medium: "🟡",
  high: "🟠",
  critical: "🔴",
};

function formatItem(item: WorkItem): string {
  const typeIcon = TYPE_ICONS[item.type] || "📋";
  const priorityIcon = PRIORITY_ICONS[item.priority] || "⚪";
  const lines: string[] = [
    `### ${typeIcon} ${item.title}`,
    "",
    `- **ID:** ${item.id}`,
    `- **Type:** ${item.type}`,
    `- **Status:** ${item.status}`,
    `- **Priority:** ${priorityIcon} ${item.priority}`,
  ];

  if (item.description) lines.push(`- **Description:** ${item.description}`);
  if (item.tags.length > 0) lines.push(`- **Tags:** ${item.tags.join(", ")}`);
  lines.push(`- **Created:** ${item.createdAt}`);

  return lines.join("\n");
}

function formatItemList(items: WorkItem[]): string {
  if (items.length === 0) {
    return "No work items found.";
  }

  const lines: string[] = [
    "## Work Items",
    "",
    "| Title | Type | Status | Priority | ID |",
    "|-------|------|--------|----------|----|",
  ];

  for (const item of items) {
    const typeIcon = TYPE_ICONS[item.type] || "📋";
    const priorityIcon = PRIORITY_ICONS[item.priority] || "⚪";
    lines.push(
      `| ${item.title} | ${typeIcon} ${item.type} | ${item.status} | ${priorityIcon} ${item.priority} | ${item.id.slice(0, 8)} |`,
    );
  }

  return lines.join("\n");
}

export function createGoopDaemonItemsTool(_ctx: PluginContext): ToolDefinition {
  return tool({
    description:
      "Manage work items (features, bugs, chores) tracked by the GoopSpec daemon",
    args: {
      action: tool.schema
        .enum(["list", "get", "create", "update"])
        .describe("Action to perform on work items"),
      projectId: tool.schema
        .string()
        .describe("Project ID that owns the work items"),
      itemId: tool.schema
        .string()
        .optional()
        .describe("Work item ID (for get/update)"),
      title: tool.schema
        .string()
        .optional()
        .describe("Item title (for create/update)"),
      description: tool.schema
        .string()
        .optional()
        .describe("Item description (for create/update)"),
      type: tool.schema
        .enum(["feature", "bug", "chore"])
        .optional()
        .describe("Item type (for create/update)"),
      status: tool.schema
        .enum(["backlog", "todo", "in_progress", "review", "done"])
        .optional()
        .describe("Item status (for create/update)"),
      priority: tool.schema
        .enum(["low", "medium", "high", "critical"])
        .optional()
        .describe("Item priority (for create/update)"),
      tags: tool.schema
        .array(tool.schema.string())
        .optional()
        .describe("Tags (for create/update)"),
    },
    async execute(
      args: {
        action: "list" | "get" | "create" | "update";
        projectId: string;
        itemId?: string;
        title?: string;
        description?: string;
        type?: "feature" | "bug" | "chore";
        status?: "backlog" | "todo" | "in_progress" | "review" | "done";
        priority?: "low" | "medium" | "high" | "critical";
        tags?: string[];
      },
      _context: ToolContext,
    ): Promise<string> {
      const client = new DaemonClient();
      const basePath = `/api/projects/${args.projectId}/items`;

      try {
        switch (args.action) {
          case "list": {
            const data = await client.get<{ items: WorkItem[] }>(basePath);
            return formatItemList(data.items);
          }

          case "get": {
            if (!args.itemId) {
              return "Error: `itemId` is required for the 'get' action.";
            }
            const data = await client.get<{ item: WorkItem }>(`${basePath}/${args.itemId}`);
            return formatItem(data.item);
          }

          case "create": {
            if (!args.title) {
              return "Error: `title` is required to create a work item.";
            }
            const body: Record<string, unknown> = { title: args.title };
            if (args.description) body.description = args.description;
            if (args.type) body.type = args.type;
            if (args.status) body.status = args.status;
            if (args.priority) body.priority = args.priority;
            if (args.tags) body.tags = args.tags;

            const data = await client.post<{ item: WorkItem }>(basePath, body);
            return `Work item created: **${data.item.title}** (ID: ${data.item.id})`;
          }

          case "update": {
            if (!args.itemId) {
              return "Error: `itemId` is required for the 'update' action.";
            }
            const body: Record<string, unknown> = {};
            if (args.title) body.title = args.title;
            if (args.description) body.description = args.description;
            if (args.type) body.type = args.type;
            if (args.status) body.status = args.status;
            if (args.priority) body.priority = args.priority;
            if (args.tags) body.tags = args.tags;

            const data = await client.put<{ item: WorkItem }>(`${basePath}/${args.itemId}`, body);
            return `Work item updated: **${data.item.title}** (ID: ${data.item.id})`;
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
