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
import { formatBatchResult, runBatch } from "../../features/db/batch.js";
import type { BlockerRow } from "../../features/db/types.js";
import { renderSidecars } from "../../shared/render-sidecars.js";

const BLOCKER_ACTIONS = ["open", "resolve", "list"] as const;
type BlockerAction = (typeof BLOCKER_ACTIONS)[number];

const BLOCKER_TOOL_SEVERITIES = ["low", "medium", "high"] as const;
type BlockerToolSeverity = (typeof BLOCKER_TOOL_SEVERITIES)[number];

const BLOCKER_TOOL_STATUSES = ["open", "resolved"] as const;
type BlockerToolStatus = (typeof BLOCKER_TOOL_STATUSES)[number];

interface BlockerItemPayload {
  action: BlockerAction;
  description?: string;
  severity?: BlockerToolSeverity;
  wave_id?: number;
  id?: number;
  resolution?: string;
  status?: BlockerToolStatus;
  workflow_id?: string;
}

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
// Per-item processing
// ---------------------------------------------------------------------------

function processBlockerItem(
  ctx: PluginContext,
  defaultWorkflowId: string,
  item: BlockerItemPayload,
): string {
  const workflowId = item.workflow_id ?? defaultWorkflowId;

  switch (item.action) {
    case "open": {
      if (!item.description) {
        throw new Error("'description' is required for open action");
      }

      const blockerId = ctx.db.upsertBlocker(workflowId, {
        wave_id: item.wave_id,
        description: item.description,
        severity: item.severity ?? "medium",
        status: "open",
      });

      ctx.db.appendEvent(workflowId, "blocker_open", {
        blocker_id: blockerId,
        wave_id: item.wave_id ?? null,
        severity: item.severity ?? "medium",
        timestamp: Date.now(),
      });

      return `Opened blocker #${blockerId} for workflow '${workflowId}'.`;
    }

    case "resolve": {
      if (item.id === undefined) {
        throw new Error("'id' is required for resolve action");
      }

      const existing = ctx.db.getBlockers(workflowId).find((blocker) => blocker.id === item.id);
      if (!existing) {
        throw new Error(`Blocker #${item.id} not found for workflow '${workflowId}'.`);
      }

      const blockerId = ctx.db.upsertBlocker(workflowId, {
        id: item.id,
        wave_id: item.wave_id ?? existing.wave_id ?? undefined,
        description: item.description ?? existing.description,
        severity: existing.severity,
        status: "resolved",
        resolution: item.resolution,
      });

      ctx.db.appendEvent(workflowId, "blocker_resolve", {
        blocker_id: blockerId,
        resolution: item.resolution ?? null,
        timestamp: Date.now(),
      });

      return `Resolved blocker #${blockerId} for workflow '${workflowId}'.`;
    }

    case "list": {
      const blockers = ctx.db.getBlockers(workflowId, item.status);
      ctx.db.appendEvent(workflowId, "blocker_list", {
        status: item.status ?? null,
        count: blockers.length,
        timestamp: Date.now(),
      });

      if (blockers.length === 0) {
        const scope = item.status === undefined ? "blockers" : `${item.status} blockers`;
        return `No ${scope} found for workflow '${workflowId}'.`;
      }

      return `# Blockers\n\n${blockers.map(formatBlocker).join("\n\n")}`;
    }

    default:
      throw new Error("Unknown action. Use: open, resolve, or list.");
  }
}

// ---------------------------------------------------------------------------
// Tool factory
// ---------------------------------------------------------------------------

export function createGoopBlockerTool(ctx: PluginContext): ToolDefinition {
  return tool({
    description: "Open, resolve, or list workflow blockers in GoopSpecDB.",
    args: {
      action: tool.schema.enum(BLOCKER_ACTIONS).optional(),
      description: tool.schema.string().optional(),
      severity: tool.schema.enum(BLOCKER_TOOL_SEVERITIES).optional(),
      wave_id: tool.schema.number().optional(),
      id: tool.schema.number().optional(),
      resolution: tool.schema.string().optional(),
      status: tool.schema.enum(BLOCKER_TOOL_STATUSES).optional(),
      workflow_id: tool.schema.string().optional(),
      items: tool.schema
        .array(
          tool.schema.object({
            action: tool.schema.enum(BLOCKER_ACTIONS),
            description: tool.schema.string().optional(),
            severity: tool.schema.enum(BLOCKER_TOOL_SEVERITIES).optional(),
            wave_id: tool.schema.number().optional(),
            id: tool.schema.number().optional(),
            resolution: tool.schema.string().optional(),
            status: tool.schema.enum(BLOCKER_TOOL_STATUSES).optional(),
            workflow_id: tool.schema.string().optional(),
          }),
        )
        .optional(),
    },
    async execute(
      args: {
        action?: BlockerAction;
        description?: string;
        severity?: BlockerToolSeverity;
        wave_id?: number;
        id?: number;
        resolution?: string;
        status?: BlockerToolStatus;
        workflow_id?: string;
        items?: BlockerItemPayload[];
      },
      _context: ToolContext,
    ): Promise<string> {
      try {
        const workflowId = args.workflow_id ?? ctx.stateManager.getState().activeWorkflowId;

        if (args.items !== undefined) {
          const touchedWorkflows = new Set<string>();
          const result = runBatch(ctx.db, args.items, (item) => {
            const itemWorkflowId = item.workflow_id ?? workflowId;
            const detail = processBlockerItem(ctx, itemWorkflowId, item);
            touchedWorkflows.add(itemWorkflowId);
            return detail;
          });

          for (const touchedWorkflowId of touchedWorkflows) {
            renderSidecars(ctx, touchedWorkflowId);
          }

          return formatBatchResult(result, "blocker");
        }

        if (args.action === undefined) {
          return "Error: 'action' is required when no items batch is provided.";
        }

        const detail = processBlockerItem(ctx, workflowId, {
          action: args.action,
          description: args.description,
          severity: args.severity,
          wave_id: args.wave_id,
          id: args.id,
          resolution: args.resolution,
          status: args.status,
        });
        renderSidecars(ctx, workflowId);

        return detail;
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        return `Error in goop_blocker: ${msg}`;
      }
    },
  });
}
