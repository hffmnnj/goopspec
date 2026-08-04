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
      "Read wave, task, PR, status, verification, and traceability rows for one workflow. " +
      "WHEN TO USE: Inspect wave progress, task status, PR links, or recorded verification/traceability rows. " +
      "WHEN NOT TO USE: goop_read_db loads workflow DOCUMENTS (SPEC, BLUEPRINT) — this reads tracking rows only, and picking the wrong one is a common silent mistake. goop_acceptance_audit combines blockers, verifications, and waves at the accept gate. " +
      "RETURNS: A markdown block of wave rows with tasks, progress, and any verification/traceability rows; a no-waves message when none exist. " +
      "CAVEATS: workflow_id defaults to the active workflow. Omit wave_numbers to read every wave; supply an array to filter. Read-only.",
    args: {
      workflow_id: tool.schema
        .string()
        .optional()
        .describe(
          "Target workflow id; omit to read the active workflow. This tool is workflow-scoped, not cross-workflow.",
        ),
      wave_numbers: tool.schema
        .array(tool.schema.number())
        .optional()
        .describe(
          "Optional filter; omit (or pass an empty array) to read every wave for the workflow, or supply specific wave numbers to read a subset.",
        ),
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
