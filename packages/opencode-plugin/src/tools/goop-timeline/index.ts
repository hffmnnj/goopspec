import { tool } from "../../core/sdk-compat.js";
import type { ToolContext, ToolDefinition } from "../../core/sdk-compat.js";
import type { PluginContext } from "../../core/types.js";
import { renderSidecars } from "../../shared/render-sidecars.js";
import { buildTimeline, formatTimelineMarkdown } from "../../shared/timeline.js";

export function createGoopTimelineTool(ctx: PluginContext): ToolDefinition {
  return tool({
    description:
      "Render a unified chronological audit trail for a workflow. " +
      "Merges events, chronicle entries, decisions, and verifications.",
    args: {
      workflow_id: tool.schema.string().optional(),
      limit: tool.schema.number().optional(),
    },
    async execute(
      args: { workflow_id?: string; limit?: number },
      _context: ToolContext,
    ): Promise<string> {
      try {
        const workflowId = args.workflow_id ?? ctx.stateManager.getState().activeWorkflowId;
        const items = buildTimeline(ctx, workflowId, args.limit);
        renderSidecars(ctx, workflowId);

        if (items.length === 0) {
          return `No timeline entries found for workflow '${workflowId}'.`;
        }

        return formatTimelineMarkdown(items);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        return `Error in goop_timeline: ${msg}`;
      }
    },
  });
}
