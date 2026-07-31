/**
 * Shared wave formatting utilities.
 *
 * Used by goop_read_wave and goop_acceptance_audit to render waves/tasks
 * consistently. Exported as a DB feature module because formatting is
 * tightly coupled to the waves/wave_tasks schema and DB read methods.
 *
 * The progress counter is derived from the same task rows (and the same
 * {@link isCompleteStatus} predicate) that drive the per-row display, so
 * `progress: N/M` can never contradict the rows printed beside it.
 *
 * @module features/db/wave-format
 */

import { isCompleteStatus } from "../../shared/status.js";
import type { TraceabilityRow, VerificationRow, WaveRow, WaveTaskRow } from "./types.js";

/** Minimal data-source contract required to format waves. */
export interface WaveDataSource {
  getWaveTasks(waveId: number): WaveTaskRow[];
  getVerifications(workflowId: string, waveId?: number, waveIds?: number[]): VerificationRow[];
  getTraceability(workflowId: string): TraceabilityRow[];
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

function formatWaveVerifications(verifications: VerificationRow[]): string {
  if (verifications.length === 0) {
    return "";
  }
  const lines = verifications.map((v) => {
    const detail = v.detail ? ` — ${v.detail}` : "";
    return `- ${v.check_name}: ${v.status}${detail}`;
  });
  return `\n\n### Verifications\n${lines.join("\n")}`;
}

function formatTraceabilityTarget(row: TraceabilityRow): string {
  const parts: string[] = [];
  if (row.wave_number !== null) {
    parts.push(`wave ${row.wave_number}`);
  }
  if (row.task_index !== null) {
    parts.push(`task ${row.task_index}`);
  }
  return parts.length > 0 ? parts.join(", ") : "(unassigned)";
}

function formatWaveTraceability(rows: TraceabilityRow[]): string {
  if (rows.length === 0) {
    return "";
  }
  const lines = rows.map(
    (t) => `- ${t.requirement_key} -> ${formatTraceabilityTarget(t)} [${t.status}]`,
  );
  return `\n\n### Traceability\n${lines.join("\n")}`;
}

/**
 * Format a single wave with its tasks, verifications, and traceability.
 *
 * Both the progress counter and the per-row display are derived from the same
 * `getWaveTasks` result, so the counter can never disagree with the rows
 * printed beside it regardless of how completion is defined.
 *
 * Verification and traceability sections are scoped to this wave and rendered
 * only when rows exist, so a wave with no side-payload data stays clean.
 */
export function formatWave(dataSource: WaveDataSource, wave: WaveRow): string {
  const tasks = dataSource.getWaveTasks(wave.id);
  const completedTasks = tasks.filter((task) => isCompleteStatus(task.status)).length;
  const totalTasks = tasks.length;
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

  let result = lines.join("\n");

  const verifications = dataSource.getVerifications(wave.workflow_id, wave.id);
  result += formatWaveVerifications(verifications);

  const traceability = dataSource
    .getTraceability(wave.workflow_id)
    .filter((row) => row.wave_number === wave.wave_number);
  result += formatWaveTraceability(traceability);

  return result;
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

  return waves.map((wave) => formatWave(dataSource, wave)).join("\n\n---\n\n");
}
