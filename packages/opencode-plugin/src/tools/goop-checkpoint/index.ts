/**
 * goop_checkpoint tool — save, load, or list execution checkpoints.
 *
 * Delegates all persistence to `ctx.stateManager` checkpoint methods.
 * On load, restores the full GoopState from the checkpoint snapshot.
 *
 * @module tools/goop-checkpoint
 */

import { tool } from "../../core/sdk-compat.js";
import type { ToolContext, ToolDefinition } from "../../core/sdk-compat.js";
import type { CheckpointData, GoopState, PluginContext } from "../../core/types.js";

// ---------------------------------------------------------------------------
// Tool factory
// ---------------------------------------------------------------------------

export function createGoopCheckpointTool(ctx: PluginContext): ToolDefinition {
  return tool({
    description: "Save, load, or list execution checkpoints.",
    args: {
      action: tool.schema.enum(["save", "load", "list"]),
      id: tool.schema.string().optional(),
      context: tool.schema.record(tool.schema.string(), tool.schema.unknown()).optional(),
    },
    async execute(
      args: {
        action: "save" | "load" | "list";
        id?: string;
        context?: Record<string, unknown>;
      },
      _context: ToolContext,
    ): Promise<string> {
      try {
        switch (args.action) {
          case "list": {
            const ids = ctx.stateManager.listCheckpoints();
            if (ids.length === 0) {
              return "No checkpoints saved.";
            }
            return `# Saved Checkpoints\n\n${ids.map((id) => `- ${id}`).join("\n")}`;
          }

          case "save": {
            if (!args.id) {
              return "Error: 'id' is required for save action.";
            }

            // Deep-copy state so the snapshot is immune to later mutations.
            const state = JSON.parse(JSON.stringify(ctx.stateManager.getState())) as GoopState;
            const data: CheckpointData = {
              id: args.id,
              timestamp: new Date().toISOString(),
              state,
              context: args.context,
            };

            ctx.stateManager.saveCheckpoint(args.id, data);
            return `Checkpoint saved: ${args.id}`;
          }

          case "load": {
            if (!args.id) {
              return "Error: 'id' is required for load action.";
            }

            const checkpoint = ctx.stateManager.loadCheckpoint(args.id);
            if (!checkpoint) {
              return `Checkpoint "${args.id}" not found.`;
            }

            // Restore state from snapshot
            ctx.stateManager.setState(checkpoint.state);

            const wfId = checkpoint.state.activeWorkflowId;
            const wf = checkpoint.state.workflows[wfId];

            const lines = [
              `# Checkpoint Loaded: ${args.id}`,
              "",
              `**Saved at:** ${checkpoint.timestamp}`,
              `**Workflow:** ${wfId}`,
              `**Phase:** ${wf?.phase ?? "unknown"}`,
              `**Mode:** ${wf?.mode ?? "standard"}`,
            ];

            if (checkpoint.context && Object.keys(checkpoint.context).length > 0) {
              lines.push(
                "",
                "**Context:**",
                "```json",
                JSON.stringify(checkpoint.context, null, 2),
                "```",
              );
            }

            return lines.join("\n");
          }

          default:
            return "Unknown action. Use: save, load, or list.";
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return `Error in goop_checkpoint: ${msg}`;
      }
    },
  });
}
