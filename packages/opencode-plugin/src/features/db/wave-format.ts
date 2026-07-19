/**
 * Shared wave formatting utilities.
 *
 * Used by goop_read_wave and goop_acceptance_audit to render waves/tasks
 * consistently. Exported as a DB feature module because formatting is
 * tightly coupled to the waves/wave_tasks schema and DB read methods.
 *
 * @module features/db/wave-format
 */

import type { WaveProgressRow, WaveRow, WaveTaskRow } from "./types.js";

/** Minimal data-source contract required to format waves. */
export interface WaveDataSource {
  getWaveTasks(waveId: number): WaveTaskRow[];
  getWaveProgress(
    workflowId: string,
    waveNumber?: number,
    waveNumbers?: number[],
  ): WaveProgressRow[];
}

function formatWaveTasks(tasks: WaveTaskRow[]): string {
  if (tasks.length === 0) {
    return "\n_(No tasks found.)_";
  }

  const lines: string[] = [];
  for (const task of tasks) {
    const description = task.description || "(no description)";
    lines.push(`- ${task.task_index}. [${task.status}] ${description}`);
    if (task.agent !== null && task.agent !== "") {
      lines.push(`  - agent: ${task.agent}`);
    }
  }

  return lines.join("\n");
}

/**
 * Format a single wave with its tasks and optional progress.
 */
export function formatWave(
  dataSource: WaveDataSource,
  wave: WaveRow,
  progress?: WaveProgressRow,
): string {
  const tasks = dataSource.getWaveTasks(wave.id);
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
  lines.push(formatWaveTasks(tasks));

  return lines.join("\n");
}

/**
 * Format a collection of waves, optionally filtered by wave numbers.
 */
export function formatWaves(
  dataSource: WaveDataSource,
  workflowId: string,
  waves: WaveRow[],
  waveNumbers?: number[],
): string {
  if (waves.length === 0) {
    const scope =
      waveNumbers !== undefined && waveNumbers.length > 0
        ? `wave numbers [${waveNumbers.join(", ")}]`
        : "waves";
    return `No ${scope} found for workflow '${workflowId}'. Use goop_write_wave to create one.`;
  }

  const progressRows =
    waveNumbers !== undefined && waveNumbers.length > 0
      ? dataSource.getWaveProgress(workflowId, undefined, waveNumbers)
      : dataSource.getWaveProgress(workflowId);

  const progressByWaveNumber = new Map(progressRows.map((row) => [row.wave_number, row] as const));

  return waves
    .map((wave) => formatWave(dataSource, wave, progressByWaveNumber.get(wave.wave_number)))
    .join("\n\n---\n\n");
}
