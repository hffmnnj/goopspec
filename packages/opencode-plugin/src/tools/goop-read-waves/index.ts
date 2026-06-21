/**
 * goop_read_waves tool — read wave metadata, task rows, and progress.
 *
 * Reads waves from SQLite and renders a markdown summary with task completion
 * counts from the v_wave_progress view.
 *
 * @module tools/goop-read-waves
 */

import { tool } from "../../core/sdk-compat.js";
import type { ToolContext, ToolDefinition } from "../../core/sdk-compat.js";
import type { PluginContext } from "../../core/types.js";
import type { WaveProgressRow, WaveRow } from "../../features/db/types.js";

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function formatWave(ctx: PluginContext, wave: WaveRow, progress?: WaveProgressRow): string {
  const tasks = ctx.db.getWaveTasks(wave.id);
  const completedTasks = progress?.completed_tasks ?? 0;
  const totalTasks = progress?.total_tasks ?? tasks.length;
  const lines = [
    `## Wave ${wave.wave_number}: ${wave.title || "Untitled"}`,
    "",
    `- status: ${wave.status}`,
    `- progress: ${completedTasks}/${totalTasks} tasks complete`,
  ];

  if (wave.pr_branch !== null && wave.pr_branch !== "") {
    lines.push(`- pr_branch: ${wave.pr_branch}`);
  }
  if (wave.pr_url !== null && wave.pr_url !== "") {
    lines.push(`- pr_url: ${wave.pr_url}`);
  }

  lines.push("", "### Tasks");

  if (tasks.length === 0) {
    lines.push("", "_(No tasks found.)_");
  } else {
    for (const task of tasks) {
      const description = task.description || "(no description)";
      lines.push(`- ${task.task_index}. [${task.status}] ${description}`);
      if (task.agent !== null && task.agent !== "") {
        lines.push(`  - agent: ${task.agent}`);
      }
    }
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Tool factory
// ---------------------------------------------------------------------------

export function createGoopReadWavesTool(ctx: PluginContext): ToolDefinition {
  return tool({
    description:
      "Read workflow waves with task lists and completion ratios from GoopSpecDB.\n\n" +
      "Args:\n" +
      "- wave_number: Optional wave number; omit to read all waves\n" +
      "- status: Optional wave status filter\n" +
      "- workflow_id: Optional workflow ID (defaults to active workflow)",
    args: {
      wave_number: tool.schema.number().optional(),
      status: tool.schema.string().optional(),
      workflow_id: tool.schema.string().optional(),
    },
    async execute(
      args: {
        wave_number?: number;
        status?: string;
        workflow_id?: string;
      },
      _context: ToolContext,
    ): Promise<string> {
      try {
        const workflowId = args.workflow_id ?? ctx.stateManager.getState().activeWorkflowId;
        const waves =
          args.wave_number !== undefined
            ? [ctx.db.getWave(workflowId, args.wave_number)].filter((w): w is WaveRow => w !== null)
            : ctx.db.getWaves(workflowId);
        const filteredWaves =
          args.status !== undefined ? waves.filter((wave) => wave.status === args.status) : waves;

        if (filteredWaves.length === 0) {
          const scope = args.wave_number !== undefined ? `wave ${args.wave_number}` : "waves";
          const status = args.status !== undefined ? ` with status '${args.status}'` : "";
          return `No ${scope}${status} found for workflow '${workflowId}'. Use goop_write_wave to create one.`;
        }

        const progressRows = ctx.db.getWaveProgress(workflowId, args.wave_number);
        const progressByWaveNumber = new Map(
          progressRows.map((row) => [row.wave_number, row] as const),
        );

        return filteredWaves
          .map((wave) => formatWave(ctx, wave, progressByWaveNumber.get(wave.wave_number)))
          .join("\n\n---\n\n");
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        return `Error in goop_read_waves: ${msg}`;
      }
    },
  });
}
