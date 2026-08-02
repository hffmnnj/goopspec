/**
 * Typed, bounded continuation-prompt construction for the V1 compaction hook.
 * This module intentionally has no host, environment, or filesystem dependencies.
 */

import type {
  CompactionHandoffBlocker,
  CompactionHandoffSnapshot,
  CompactionHandoffTask,
  PluginContext,
} from "../core/types.js";
import { logError } from "./logger.js";

/** Hard upper bound for the replacement prompt replayed into future turns. */
export const MAX_CONTINUATION_PROMPT_CHARS = 10_000;

const MAX_TEXT_CHARS = 340;
const MAX_IDENTIFIER_CHARS = 160;
const MAX_TASKS = 8;
const MAX_BLOCKERS = 5;

/** The complete allowlisted data surface accepted by the formatter. */
export interface WorkflowContinuationDetail {
  readonly workflowId: string;
  readonly phase: string;
  readonly mode: string;
  readonly depth: string;
  readonly specLocked: boolean;
  readonly interviewComplete: boolean;
  readonly acceptanceConfirmed: boolean;
  readonly currentWave: number;
  readonly totalWaves: number;
  readonly autopilot: boolean;
  readonly lazyAutopilot: boolean;
  readonly branch?: string;
  readonly nextStep?: string;
  readonly currentWaveTitle?: string;
  readonly currentWaveStatus?: string;
  readonly tasks: readonly CompactionHandoffTask[];
  readonly openBlockers: readonly CompactionHandoffBlocker[];
  readonly prBranch?: string;
  readonly prUrl?: string;
}

function isSnapshot(
  value: CompactionHandoffSnapshot | undefined,
): value is CompactionHandoffSnapshot {
  if (value === undefined) return false;
  return (
    typeof value.workflowId === "string" &&
    typeof value.phase === "string" &&
    typeof value.mode === "string" &&
    typeof value.depth === "string" &&
    typeof value.specLocked === "boolean" &&
    typeof value.interviewComplete === "boolean" &&
    typeof value.acceptanceConfirmed === "boolean" &&
    typeof value.currentWave === "number" &&
    typeof value.totalWaves === "number" &&
    typeof value.autopilot === "boolean" &&
    typeof value.lazyAutopilot === "boolean" &&
    (typeof value.branch === "string" || value.branch === undefined) &&
    typeof value.nextStep === "string"
  );
}

function fromSnapshot(snapshot: CompactionHandoffSnapshot): WorkflowContinuationDetail {
  return {
    workflowId: snapshot.workflowId,
    phase: snapshot.phase,
    mode: snapshot.mode,
    depth: snapshot.depth,
    specLocked: snapshot.specLocked,
    interviewComplete: snapshot.interviewComplete,
    acceptanceConfirmed: snapshot.acceptanceConfirmed,
    currentWave: snapshot.currentWave,
    totalWaves: snapshot.totalWaves,
    autopilot: snapshot.autopilot,
    lazyAutopilot: snapshot.lazyAutopilot,
    branch: snapshot.branch,
    nextStep: snapshot.nextStep,
    currentWaveTitle: snapshot.currentWaveTitle,
    currentWaveStatus: snapshot.currentWaveStatus,
    tasks: snapshot.tasks ?? [],
    openBlockers: snapshot.openBlockers ?? [],
    prBranch: snapshot.prBranch,
    prUrl: snapshot.prUrl,
  };
}

/**
 * Resolve only workflow fields suitable for a continuation prompt. A snapshot
 * is authoritative; live state uses a best-effort current-wave database read.
 */
export function collectContinuationDetail(
  ctx: PluginContext,
  snapshot?: CompactionHandoffSnapshot,
): WorkflowContinuationDetail | undefined {
  try {
    if (snapshot !== undefined) return isSnapshot(snapshot) ? fromSnapshot(snapshot) : undefined;

    const state = ctx.stateManager.getState();
    const workflowId = state.activeWorkflowId;
    const workflow = state.workflows[workflowId];
    if (!workflowId || !workflow) return undefined;

    let currentWaveTitle: string | undefined;
    let currentWaveStatus: string | undefined;
    let tasks: readonly CompactionHandoffTask[] = [];
    let openBlockers: readonly CompactionHandoffBlocker[] = [];
    let prBranch: string | undefined;
    let prUrl: string | undefined;

    try {
      const wave =
        workflow.currentWave > 0
          ? ctx.db.getWaves(workflowId, [workflow.currentWave])[0]
          : undefined;
      if (wave) {
        currentWaveTitle = wave.title || undefined;
        currentWaveStatus = wave.status;
        tasks = ctx.db.getWaveTasks(wave.id).map((task) => ({
          index: task.task_index,
          description: task.description,
          status: task.status,
          agent: task.agent ?? undefined,
        }));
        prBranch = wave.pr_branch ?? undefined;
        prUrl = wave.pr_url ?? undefined;
      }
      openBlockers = ctx.db.getBlockers(workflowId, "open").map((blocker) => ({
        id: blocker.id,
        severity: blocker.severity,
        description: blocker.description,
      }));
    } catch (error) {
      logError("continuation prompt could not collect current-wave metadata", error);
      return undefined;
    }

    return {
      workflowId,
      phase: workflow.phase,
      mode: workflow.mode,
      depth: workflow.depth,
      specLocked: workflow.specLocked,
      interviewComplete: workflow.interviewComplete,
      acceptanceConfirmed: workflow.acceptanceConfirmed,
      currentWave: workflow.currentWave,
      totalWaves: workflow.totalWaves,
      autopilot: workflow.autopilot,
      lazyAutopilot: workflow.lazyAutopilot,
      currentWaveTitle,
      currentWaveStatus,
      tasks,
      openBlockers,
      prBranch,
      prUrl,
    };
  } catch (error) {
    logError("continuation prompt could not resolve workflow state", error);
    return undefined;
  }
}

function bounded(value: string | undefined, maximum = MAX_TEXT_CHARS): string | undefined {
  const normalized = value?.replace(/\s+/g, " ").trim();
  if (!normalized) return undefined;
  if (normalized.length <= maximum) return normalized;
  return `${normalized.slice(0, maximum - 1).trimEnd()}…`;
}

function required(value: string, maximum = MAX_IDENTIFIER_CHARS): string {
  return bounded(value, maximum) ?? "unknown";
}

function workflowStateLines(detail: WorkflowContinuationDetail): string[] {
  const lines = [
    `- Workflow ID: ${required(detail.workflowId)}`,
    `- Phase: ${required(detail.phase, 80)}`,
    `- Mode: ${required(detail.mode, 80)}`,
    `- Depth: ${required(detail.depth, 80)}`,
    `- Spec Locked: ${detail.specLocked ? "true" : "false"}`,
    `- Interview Complete: ${detail.interviewComplete ? "true" : "false"}`,
    `- Acceptance Confirmed: ${detail.acceptanceConfirmed ? "true" : "false"}`,
    `- Wave: ${detail.currentWave} of ${detail.totalWaves}`,
    `- Lazy Autopilot: ${detail.lazyAutopilot ? "true" : "false"}`,
  ];
  const optional: [string, string | undefined][] = [
    ["Git Branch", bounded(detail.branch, MAX_IDENTIFIER_CHARS)],
    ["Current Wave", bounded(detail.currentWaveTitle)],
    ["Current Wave Status", bounded(detail.currentWaveStatus, 80)],
    ["PR Branch", bounded(detail.prBranch, MAX_IDENTIFIER_CHARS)],
    ["PR URL", bounded(detail.prUrl, MAX_IDENTIFIER_CHARS)],
  ];
  for (const [label, value] of optional) if (value) lines.push(`- ${label}: ${value}`);

  const tasks = detail.tasks.slice(0, MAX_TASKS);
  lines.push(`- Current-Wave Tasks: ${tasks.length === 0 ? "none" : ""}`.trimEnd());
  for (const task of tasks) {
    const agent = bounded(task.agent, 80);
    lines.push(
      `  - ${task.index}. [${required(task.status, 80)}] ${required(task.description)}${agent ? ` (${agent})` : ""}`,
    );
  }

  const blockers = detail.openBlockers.slice(0, MAX_BLOCKERS);
  lines.push(`- Open Blockers: ${blockers.length === 0 ? "none" : ""}`.trimEnd());
  for (const blocker of blockers) {
    lines.push(
      `  - #${blocker.id} [${required(blocker.severity, 80)}] ${required(blocker.description)}`,
    );
  }

  if (detail.autopilot && !detail.lazyAutopilot) {
    lines.push(
      "- AUTOPILOT ACTIVE: Do not pause between phases. Continue to the next phase immediately.",
    );
    lines.push(
      "- Hard stops still apply per phase-gates: Rule 4 architectural decisions, credentials/secrets, and destructive/irreversible operations.",
    );
  }
  if (detail.autopilot && detail.lazyAutopilot) {
    lines.push(
      "- LAZY AUTOPILOT ACTIVE: Do not ask questions or pause for phase confirmations or reviews.",
    );
    lines.push(
      "- Decide Rule 4 architectural questions autonomously and log full rationale to ADL; stop only for missing credentials/secrets or ambiguous destructive/irreversible operations.",
    );
  }
  if (detail.autopilot || detail.lazyAutopilot) {
    lines.push(
      "- AUTOPILOT SESSION RULES: Do not warn about context limits or suggest a new session; continue until complete or a permitted stop condition.",
    );
  }
  return lines;
}

/** Build the bounded replacement prompt with the upstream-compatible heading skeleton. */
export function buildContinuationPrompt(detail: WorkflowContinuationDetail): string {
  const nextStep = bounded(detail.nextStep, MAX_TEXT_CHARS);
  const lines = [
    "Create a continuation brief using EXACTLY the structure below. Keep every heading, even when its section is empty.",
    "- Use terse bullets. Preserve exact file paths, commands, and identifiers.",
    "- Do not mention summarizing or compaction.",
    "- If an earlier GoopSpec continuation brief appears in the history, use it as the anchored baseline: preserve still-true details, drop stale ones, and merge new facts.",
    "",
    "## Objective",
    "- Preserve the active workflow handoff and the immediate safe action.",
    "",
    "## GoopSpec Workflow State",
    "Reproduce the following block verbatim, changing nothing:",
    ...workflowStateLines(detail),
    "",
    "## Important Details",
    "- Preserve factual workflow state exactly as provided above.",
    "",
    "## Work State",
    "### Completed",
    "- Record completed work supported by the conversation history.",
    "### Active",
    "- Record the current work in progress from the conversation history.",
    "### Blocked",
    "- Record only active blockers from the workflow state or conversation history.",
    "",
    "## Next Move",
    nextStep
      ? `1. ${nextStep}`
      : "1. Run `goop_status` and derive the gate-appropriate action before acting.",
    "",
    "## Relevant Files",
    "- Preserve relevant exact paths from the conversation history.",
  ];
  const prompt = lines.join("\n");

  // All untrusted fields and collections are bounded above, so this guard is
  // defensive rather than a section-dropping truncation path.
  if (prompt.length > MAX_CONTINUATION_PROMPT_CHARS) {
    return `${prompt.slice(0, MAX_CONTINUATION_PROMPT_CHARS - 1).trimEnd()}…`;
  }
  return prompt;
}
