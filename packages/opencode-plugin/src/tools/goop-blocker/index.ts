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
import type { BlockerRow, BlockerSeverity } from "../../features/db/types.js";
import { BLOCKER_SEVERITIES } from "../../features/db/types.js";
import { renderSidecars } from "../../shared/render-sidecars.js";
import { isCompleteStatus } from "../../shared/status.js";

const BLOCKER_ACTIONS = ["open", "resolve", "list"] as const;
type BlockerAction = (typeof BLOCKER_ACTIONS)[number];

// Derived from the shared DB constant so the tool boundary and the DB schema
// can never drift. BLOCKER_SEVERITIES is ["low", "medium", "high", "critical"].
const BLOCKER_TOOL_SEVERITIES = BLOCKER_SEVERITIES;
type BlockerToolSeverity = BlockerSeverity;

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

      const baseMessage = `Opened blocker #${blockerId} for workflow '${workflowId}'.`;

      // Warn (but still open) when the target wave is already complete. A
      // late-discovered regression against a completed wave is legitimate, so
      // we never hard-reject — but the warning makes the common mistake (wrong
      // wave_id) visible and actionable. See references/phase-gates.md
      // §Blocker Hygiene.
      if (item.wave_id !== undefined) {
        const wave = ctx.db.getWave(workflowId, item.wave_id);
        if (wave !== null && isCompleteStatus(wave.status)) {
          return `WARNING: Wave ${item.wave_id} is already marked complete (status: '${wave.status}'). Blockers against completed waves are usually a mistake — verify this is an intentional late-discovered regression. If not, resolve this blocker and open one against the current in-progress wave (or omit wave_id). The blocker has still been opened.\n${baseMessage}`;
        }
      }

      return baseMessage;
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
    description:
      "Open, resolve, or list workflow blockers in GoopSpecDB. " +
      "WHEN TO USE: Record a blocking issue, close one, or list blockers for a workflow. " +
      "WHEN NOT TO USE: goop_acceptance_audit reads blockers with verifications and waves at the accept gate; goop_timeline gives a chronological audit trail. " +
      "MODES: action picks open/resolve/list; items[] batches mixed actions. open needs description (severity defaults medium, wave_id optional). resolve needs id (resolution optional; description/wave_id optional to amend). list takes only an optional status filter. In items[] each item carries its own action and required fields; top-level operation fields alongside items[] are rejected. status is forced to open on open and resolved on resolve, so it only filters list. " +
      "RETURNS: Per-action confirmation, a markdown blocker table for list, or a batch summary for items[]. " +
      "CAVEATS: Omit action entirely when using items[] — passing it alongside items[] is rejected. workflow_id is honored at top level and per item. Opening a blocker against a completed wave warns but still opens.",
    args: {
      action: tool.schema
        .enum(BLOCKER_ACTIONS)
        .optional()
        .describe(
          "Lifecycle operation (open, resolve, or list). Required for every call except items[] batch mode, where each item carries its own action. " +
            "Omit entirely when using items[] — passing action alongside items[] is rejected, not ignored.",
        ),
      description: tool.schema
        .string()
        .optional()
        .describe("Required for open; optional for resolve (amends the stored text). Ignored by list."),
      severity: tool.schema
        .enum(BLOCKER_TOOL_SEVERITIES)
        .optional()
        .describe(
          "Severity for open (low, medium, high, critical); defaults to medium when omitted. Stored on open; ignored by resolve and list.",
        ),
      wave_id: tool.schema
        .number()
        .optional()
        .describe(
          "Wave number to associate the blocker with. Used by open (attaches) and resolve (updates); ignored by list. Opening against a wave already marked done/completed warns but still opens.",
        ),
      id: tool.schema
        .number()
        .optional()
        .describe("Blocker row id; required for resolve. Ignored by open and list."),
      resolution: tool.schema
        .string()
        .optional()
        .describe("Optional closure note for resolve. Ignored by open and list."),
      status: tool.schema
        .enum(BLOCKER_TOOL_STATUSES)
        .optional()
        .describe(
          "Filter for list only (open or resolved). Forced to open on open and resolved on resolve regardless of input, so it has no effect outside list.",
        ),
      workflow_id: tool.schema
        .string()
        .optional()
        .describe(
          "Target workflow id; omit to use the active workflow. Honored at the top level and as the per-item default inside items[].",
        ),
      items: tool.schema
        .array(
          tool.schema.object({
            action: tool.schema
              .enum(BLOCKER_ACTIONS)
              .describe("Lifecycle operation for this item (open, resolve, or list)."),
            description: tool.schema
              .string()
              .optional()
              .describe("Required when this item's action is open; optional for resolve."),
            severity: tool.schema
              .enum(BLOCKER_TOOL_SEVERITIES)
              .optional()
              .describe("Optional for an open item (defaults to medium)."),
            wave_id: tool.schema
              .number()
              .optional()
              .describe("Optional wave number to associate this item's blocker with."),
            id: tool.schema
              .number()
              .optional()
              .describe("Required when this item's action is resolve."),
            resolution: tool.schema
              .string()
              .optional()
              .describe("Optional closure note for a resolve item."),
            status: tool.schema
              .enum(BLOCKER_TOOL_STATUSES)
              .optional()
              .describe("Filter for a list item only (open or resolved)."),
            workflow_id: tool.schema
              .string()
              .optional()
              .describe("Per-item workflow override; omit to inherit the top-level workflow_id or the active workflow."),
          }),
        )
        .optional()
        .describe(
          "Batch of mixed actions; each item carries its own action and required fields. Top-level operation fields (action/description/severity/wave_id/id/resolution/status) alongside items[] are rejected — only workflow_id may accompany items[].",
        ),
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

        if (Array.isArray(args.items) && args.items.length > 0) {
          // workflow_id is excluded: it is genuinely used as the per-item default below.
          const ignoredFields = [
            args.action !== undefined ? "action" : null,
            args.description !== undefined ? "description" : null,
            args.severity !== undefined ? "severity" : null,
            args.wave_id !== undefined ? "wave_id" : null,
            args.id !== undefined ? "id" : null,
            args.resolution !== undefined ? "resolution" : null,
            args.status !== undefined ? "status" : null,
          ].filter((field): field is string => field !== null);
          if (ignoredFields.length > 0) {
            return `Error in goop_blocker: ${ignoredFields.join(", ")} cannot be supplied alongside items[]: batch mode uses only the per-item fields inside items[], so top-level operation fields would be silently ignored.`;
          }

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
          return "Error in goop_blocker: items[] array is empty and no action was provided";
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
