/**
 * goop_write_traceability tool — write requirement-to-wave/task links.
 *
 * Persists traceability rows to GoopSpecDB for later matrix rendering.
 * TRACEABILITY.md rendering is wired in a later wave.
 *
 * @module tools/goop-write-traceability
 */

import { tool } from "../../core/sdk-compat.js";
import type { ToolContext, ToolDefinition } from "../../core/sdk-compat.js";
import type { PluginContext } from "../../core/types.js";

// ---------------------------------------------------------------------------
// Tool factory
// ---------------------------------------------------------------------------

export function createGoopWriteTraceabilityTool(ctx: PluginContext): ToolDefinition {
  return tool({
    description:
      "Write or update a requirement-to-wave/task traceability row in GoopSpecDB.\n\n" +
      "Args:\n" +
      "- requirement_key: Requirement identifier (for example MH14)\n" +
      "- wave_number: Optional wave number\n" +
      "- task_index: Optional task index within the wave\n" +
      "- status: Optional traceability status\n" +
      "- workflow_id: Optional workflow ID (defaults to active workflow)",
    args: {
      requirement_key: tool.schema.string(),
      wave_number: tool.schema.number().optional(),
      task_index: tool.schema.number().optional(),
      status: tool.schema.string().optional(),
      workflow_id: tool.schema.string().optional(),
    },
    async execute(
      args: {
        requirement_key: string;
        wave_number?: number;
        task_index?: number;
        status?: string;
        workflow_id?: string;
      },
      _context: ToolContext,
    ): Promise<string> {
      try {
        const workflowId = args.workflow_id ?? ctx.stateManager.getState().activeWorkflowId;

        ctx.db.upsertTraceability(workflowId, {
          requirement_key: args.requirement_key,
          wave_number: args.wave_number,
          task_index: args.task_index,
          status: args.status,
        });

        ctx.db.appendEvent(workflowId, "traceability_write", {
          requirement_key: args.requirement_key,
          wave_number: args.wave_number ?? null,
          task_index: args.task_index ?? null,
          status: args.status ?? "pending",
          timestamp: Date.now(),
        });

        return `Wrote traceability for ${args.requirement_key} in workflow '${workflowId}'.`;
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        return `Error in goop_write_traceability: ${msg}`;
      }
    },
  });
}
