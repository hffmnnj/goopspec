import { tool } from "../../core/sdk-compat.js";
import type { ToolContext, ToolDefinition } from "../../core/sdk-compat.js";
import type { PluginContext } from "../../core/types.js";
import { buildDashboard } from "../../shared/dashboard.js";
import { renderSidecars } from "../../shared/render-sidecars.js";

export function createGoopDashboardTool(ctx: PluginContext): ToolDefinition {
  return tool({
    description:
      "Render a cross-workflow project board with phase, wave progress, blockers, and activity.",
    args: {
      workflow_id: tool.schema.string().optional(),
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
