/**
 * goop_blocker tool — open, resolve, and list workflow blockers.
 *
 * Persists blocker lifecycle changes to GoopSpecDB and logs blocker events
 * for auditability and refreshes rendered sidecars after mutations.
 *
 * @module tools/goop-blocker
 */

import { tool } from "../../core/sdk-compat.js";
import type { ToolContext, ToolDefinition } from "../../core/sdk-compat.js";
import type { PluginContext } from "../../core/types.js";
import type { BlockerRow } from "../../features/db/types.js";
import { renderSidecars } from "../../shared/render-sidecars.js";

const BLOCKER_ACTIONS = ["open", "resolve", "list"] as const;
type BlockerAction = (typeof BLOCKER_ACTIONS)[number];

const BLOCKER_TOOL_SEVERITIES = ["low", "medium", "high"] as const;
type BlockerToolSeverity = (typeof BLOCKER_TOOL_SEVERITIES)[number];

const BLOCKER_TOOL_STATUSES = ["open", "resolved"] as const;
type BlockerToolStatus = (typeof BLOCKER_TOOL_STATUSES)[number];

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatTimestamp(value: number | null): string {
  return value === null ? "none" : new Date(value * 1000).toISOString();
}

function formatBlocker(blocker: BlockerRow): string {
  return [
    `- #${blocker.id} [${blocker.severity}] ${blocker.status}`,
    `  - Description: ${blocker.description}`,
    `  - Wave: ${blocker.wave_id ?? "none"}`,
    `  - Resolution: ${blocker.resolution ?? "none"}`,
    `  - Created: ${formatTimestamp(blocker.created_at)}`,
    `  - Resolved: ${formatTimestamp(blocker.resolved_at)}`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Tool factory
// ---------------------------------------------------------------------------

export function createGoopBlockerTool(ctx: PluginContext): ToolDefinition {
  return tool({
    description:
      "Open, resolve, or list workflow blockers in GoopSpecDB.\n\n" +
      "Args:\n" +
      "- action: open, resolve, or list\n" +
      "- description: Required for open; optional passthrough for resolve\n" +
      "- severity: Optional severity for open (low, medium, high; default medium)\n" +
      "- wave_id: Optional wave ID to associate with the blocker\n" +
      "- id: Required for resolve\n" +
      "- resolution: Optional resolution text for resolve\n" +
      "- status: Optional status filter for list (open, resolved)\n" +
      "- workflow_id: Optional workflow ID (defaults to active workflow)",
    args: {
      action: tool.schema.enum(BLOCKER_ACTIONS),
      description: tool.schema.string().optional(),
      severity: tool.schema.enum(BLOCKER_TOOL_SEVERITIES).optional(),
      wave_id: tool.schema.number().optional(),
      id: tool.schema.number().optional(),
      resolution: tool.schema.string().optional(),
      status: tool.schema.enum(BLOCKER_TOOL_STATUSES).optional(),
      workflow_id: tool.schema.string().optional(),
    },
    async execute(
      args: {
        action: BlockerAction;
        description?: string;
        severity?: BlockerToolSeverity;
        wave_id?: number;
        id?: number;
        resolution?: string;
        status?: BlockerToolStatus;
        workflow_id?: string;
      },
      _context: ToolContext,
    ): Promise<string> {
      try {
        const workflowId = args.workflow_id ?? ctx.stateManager.getState().activeWorkflowId;

        switch (args.action) {
          case "open": {
            if (!args.description) {
              return "Error: 'description' is required for open action.";
            }

            const blockerId = ctx.db.upsertBlocker(workflowId, {
              wave_id: args.wave_id,
              description: args.description,
              severity: args.severity ?? "medium",
              status: "open",
            });

            ctx.db.appendEvent(workflowId, "blocker_open", {
              blocker_id: blockerId,
              wave_id: args.wave_id ?? null,
              severity: args.severity ?? "medium",
              timestamp: Date.now(),
            });
            renderSidecars(ctx, workflowId);

            return `Opened blocker #${blockerId} for workflow '${workflowId}'.`;
          }

          case "resolve": {
            if (args.id === undefined) {
              return "Error: 'id' is required for resolve action.";
            }

            const existing = ctx.db.getBlockers(workflowId).find((blocker) => blocker.id === args.id);
            if (!existing) {
              return `Blocker #${args.id} not found for workflow '${workflowId}'.`;
            }

            const blockerId = ctx.db.upsertBlocker(workflowId, {
              id: args.id,
              wave_id: args.wave_id ?? existing.wave_id ?? undefined,
              description: args.description ?? existing.description,
              severity: existing.severity,
              status: "resolved",
              resolution: args.resolution,
            });

            ctx.db.appendEvent(workflowId, "blocker_resolve", {
              blocker_id: blockerId,
              resolution: args.resolution ?? null,
              timestamp: Date.now(),
            });
            renderSidecars(ctx, workflowId);

            return `Resolved blocker #${blockerId} for workflow '${workflowId}'.`;
          }

          case "list": {
            const blockers = ctx.db.getBlockers(workflowId, args.status);
            ctx.db.appendEvent(workflowId, "blocker_list", {
              status: args.status ?? null,
              count: blockers.length,
              timestamp: Date.now(),
            });

            if (blockers.length === 0) {
              const scope = args.status === undefined ? "blockers" : `${args.status} blockers`;
              return `No ${scope} found for workflow '${workflowId}'.`;
            }

            return `# Blockers\n\n${blockers.map(formatBlocker).join("\n\n")}`;
          }

          default:
            return "Unknown action. Use: open, resolve, or list.";
        }
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        return `Error in goop_blocker: ${msg}`;
      }
    },
  });
}
