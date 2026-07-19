/**
 * goop_read_wave tool — read-only wave/task/PR/status/traceability context.
 *
 * Returns wave data from the GoopSpecDB. This is the dedicated read path
 * that replaces reading wave/task context out of the blueprint document.
 * It wraps existing DB methods (`getWaves`, `getWaveProgress`, `getWaveTasks`)
 * with no new storage layer.
 *
 * @module tools/goop-read-wave
 */

import { tool } from "../../core/sdk-compat.js";
import type { ToolContext, ToolDefinition } from "../../core/sdk-compat.js";
import type { PluginContext } from "../../core/types.js";
import { formatWaves } from "../../features/db/wave-format.js";

// ---------------------------------------------------------------------------
// Tool factory
// ---------------------------------------------------------------------------

export function createGoopReadWaveTool(ctx: PluginContext): ToolDefinition {
  return tool({
    description:
      "Read-only counterpart to goop_write_wave. " +
      "Returns wave/task/PR/status/traceability context for a workflow.",
    args: {
      workflow_id: tool.schema.string().optional(),
      wave_numbers: tool.schema.array(tool.schema.number()).optional(),
    },
    async execute(
      args: {
        workflow_id?: string;
        wave_numbers?: number[];
      },
      _context: ToolContext,
    ): Promise<string> {
      try {
        const workflowId = args.workflow_id ?? ctx.stateManager.getState().activeWorkflowId;
        const waveNumbers = args.wave_numbers;

        const waves =
          waveNumbers !== undefined && waveNumbers.length > 0
            ? ctx.db.getWaves(workflowId, waveNumbers)
            : ctx.db.getWaves(workflowId);

        return formatWaves(ctx.db, workflowId, waves, waveNumbers);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        return `Error in goop_read_wave: ${msg}`;
      }
    },
  });
}
