import { tool } from "../../core/sdk-compat.js";
import type { ToolContext, ToolDefinition } from "../../core/sdk-compat.js";
import type { PluginContext } from "../../core/types.js";
import { renderSidecars } from "../../shared/render-sidecars.js";
import { buildTimeline, formatTimelineMarkdown } from "../../shared/timeline.js";

export function createGoopTimelineTool(ctx: PluginContext): ToolDefinition {
  return tool({
    description:
      "Render a unified chronological audit trail merging events, chronicle entries, decisions, and verifications for one workflow. " +
      "WHEN TO USE: Review what happened in a workflow across every audit source in time order. " +
      "WHEN NOT TO USE: goop_dashboard for a cross-workflow project board; goop_query_decisions for decisions alone; goop_read_wave for wave/task rows. " +
      "RETURNS: A chronological markdown list of timestamped entries tagged by source, plus a TIMELINE.md sidecar render. " +
      "CAVEATS: workflow_id defaults to the active workflow — this tool is workflow-scoped, not cross-workflow. limit caps to the most recent N entries. Renders TIMELINE.md as a side effect.",
    args: {
      workflow_id: tool.schema
        .string()
        .optional()
        .describe("Target workflow id; omit to render the active workflow."),
      limit: tool.schema
        .number()
        .optional()
        .describe("Optional cap on the number of entries returned; omit for all entries."),
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
