import { tool } from "../../core/sdk-compat.js";
import type { ToolContext, ToolDefinition } from "../../core/sdk-compat.js";
import type { PluginContext } from "../../core/types.js";
import { buildDashboard } from "../../shared/dashboard.js";
import { renderSidecars } from "../../shared/render-sidecars.js";

export function createGoopDashboardTool(ctx: PluginContext): ToolDefinition {
  return tool({
    description:
      "Render a cross-workflow project board of every workflow's phase, wave progress, open blockers, and last activity. " +
      "WHEN TO USE: See all workflows at once and compare phase, progress, and blockers. " +
      "WHEN NOT TO USE: goop_status for the active workflow's detail; goop_timeline for one workflow's chronological trail; goop_read_wave for wave/task rows. " +
      "RETURNS: A markdown table of all workflows (active flagged), sorted by last activity, plus a root DASHBOARD.md sidecar render. " +
      "CAVEATS: Always cross-workflow — the workflow_id argument is declared but IGNORED: the board enumerates every workflow regardless of what is passed, so do not rely on workflow_id to scope it.",
    args: {
      workflow_id: tool.schema
        .string()
        .optional()
        .describe(
          "Accepted for signature symmetry but IGNORED at runtime — the dashboard always enumerates every workflow; do not pass it expecting to scope the board.",
        ),
    },
    async execute(_args: { workflow_id?: string }, _context: ToolContext): Promise<string> {
      try {
        const state = ctx.stateManager.getState();
        const board = buildDashboard(ctx);
        renderSidecars(ctx, state.activeWorkflowId);
        return board;
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        return `Error in goop_dashboard: ${msg}`;
      }
    },
  });
}
