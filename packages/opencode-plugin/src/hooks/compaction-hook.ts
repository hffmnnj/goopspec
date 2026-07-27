/**
 * Compaction Hook — preserves GoopSpec workflow state across session compaction.
 *
 * Uses the `experimental.session.compacting` hook to push a survival block
 * onto `output.context` (string[]). This ensures the post-compaction model
 * knows the active workflow, phase, wave progress, autopilot directives,
 * and where to find key documents.
 *
 * CRITICAL: pushes to `output.context` (appended to default compaction prompt).
 * Does NOT set `output.prompt` (that would replace the default prompt entirely).
 *
 * @module hooks/compaction-hook
 */

import type { CompactionHandoffSnapshot, PluginContext } from "../core/types.js";
import { log, logError } from "../shared/logger.js";
import { clearCompactionHaltState } from "./compaction-halt/index.js";
import type { HookFactory, Hooks } from "./types.js";
import { safeHandler } from "./utils.js";

export const MAX_NEXT_STEP_CHARS = 200;

function isCompactionHandoffSnapshot(value: unknown): value is CompactionHandoffSnapshot {
  if (value === null || typeof value !== "object") return false;
  const handoff = value as Partial<CompactionHandoffSnapshot>;
  return (
    typeof handoff.workflowId === "string" &&
    typeof handoff.phase === "string" &&
    typeof handoff.mode === "string" &&
    typeof handoff.depth === "string" &&
    typeof handoff.specLocked === "boolean" &&
    typeof handoff.interviewComplete === "boolean" &&
    typeof handoff.acceptanceConfirmed === "boolean" &&
    typeof handoff.currentWave === "number" &&
    typeof handoff.totalWaves === "number" &&
    typeof handoff.autopilot === "boolean" &&
    typeof handoff.lazyAutopilot === "boolean" &&
    (typeof handoff.branch === "string" || handoff.branch === undefined) &&
    typeof handoff.nextStep === "string" &&
    typeof handoff.capturedAtMs === "number"
  );
}

function sanitizeNextStep(nextStep?: string): string | undefined {
  const sanitized = nextStep?.replace(/\s+/g, " ").trim();
  if (!sanitized) return undefined;
  if (sanitized.length <= MAX_NEXT_STEP_CHARS) return sanitized;
  return `${sanitized.slice(0, MAX_NEXT_STEP_CHARS - 1).trimEnd()}…`;
}

/** Minimal workflow state needed to render the survival block. */
interface WorkflowStateLike {
  phase: string;
  mode: string;
  depth: string;
  specLocked: boolean;
  interviewComplete: boolean;
  acceptanceConfirmed: boolean;
  currentWave: number;
  totalWaves: number;
  autopilot: boolean;
  lazyAutopilot: boolean;
  branch: string | undefined;
}

/** Resolve the effective workflow state, preferring the handoff snapshot when present and valid. */
function resolveSurvivalState(
  ctx: PluginContext,
  handoff: CompactionHandoffSnapshot | undefined,
): { workflowId: string; workflow: WorkflowStateLike; fromSnapshot: boolean } | undefined {
  if (handoff !== undefined) {
    return {
      workflowId: handoff.workflowId,
      workflow: {
        phase: handoff.phase,
        mode: handoff.mode,
        depth: handoff.depth,
        specLocked: handoff.specLocked,
        interviewComplete: handoff.interviewComplete,
        acceptanceConfirmed: handoff.acceptanceConfirmed,
        currentWave: handoff.currentWave,
        totalWaves: handoff.totalWaves,
        autopilot: handoff.autopilot,
        lazyAutopilot: handoff.lazyAutopilot,
        branch: handoff.branch,
      },
      fromSnapshot: true,
    };
  }

  const live = ctx.stateManager.getState();
  const workflowId = live.activeWorkflowId;
  const workflow = live.workflows[workflowId];
  if (!workflow) {
    return undefined;
  }
  return {
    workflowId,
    workflow: { ...workflow, branch: undefined },
    fromSnapshot: false,
  };
}

/**
 * Rebind the live active-workflow binding to the snapshot workflow when they differ.
 * Returns the workflowId that should be reported in the survival block.
 */
function reconcileActiveWorkflowBinding(
  ctx: PluginContext,
  snapshotWorkflowId: string,
): { workflowId: string; rebound: boolean } {
  const liveActiveId = ctx.stateManager.getActiveWorkflowId();
  if (liveActiveId === snapshotWorkflowId) {
    return { workflowId: snapshotWorkflowId, rebound: false };
  }

  log("compaction survival: rebinding active workflow to snapshot workflow", {
    from: liveActiveId,
    to: snapshotWorkflowId,
  });

  const restored = ctx.stateManager.restoreActiveWorkflowBinding(snapshotWorkflowId);
  if (restored) {
    return { workflowId: snapshotWorkflowId, rebound: true };
  }

  logError(
    "compaction survival: snapshot workflow does not exist in live state; falling back to live binding",
    { snapshotWorkflowId, liveActiveId },
  );

  return { workflowId: liveActiveId, rebound: false };
}

// ---------------------------------------------------------------------------
// Survival block builder
// ---------------------------------------------------------------------------

/**
 * Build the workflow-state survival block that gets injected into compaction
 * context. Includes phase, workflow progress, spec lock, autopilot directives,
 * and pointers to key documents.
 */
export function buildWorkflowSurvivalBlock(
  ctx: PluginContext,
  handoff?: CompactionHandoffSnapshot,
  nextStep?: string,
): string {
  const resolved = resolveSurvivalState(ctx, handoff);
  if (!resolved) {
    return "";
  }

  let { workflowId, workflow, fromSnapshot } = resolved;

  if (fromSnapshot) {
    const reconciliation = reconcileActiveWorkflowBinding(ctx, workflowId);
    if (reconciliation.workflowId !== workflowId) {
      // Snapshot workflow did not exist in live state; fall back to live binding and its workflow.
      const live = ctx.stateManager.getState();
      const liveWorkflow = live.workflows[reconciliation.workflowId];
      if (!liveWorkflow) {
        return "";
      }
      workflowId = reconciliation.workflowId;
      workflow = { ...liveWorkflow, branch: undefined };
    }
  }

  const docPrefix = workflowId === "default" ? ".goopspec/" : `.goopspec/${workflowId}/`;
  const safeNextStep = sanitizeNextStep(nextStep);

  const lines: string[] = [];

  lines.push("## GoopSpec Workflow State (Compaction Survival)");
  lines.push("");
  lines.push(`RESUME FROM THIS POINT. You are in the ${workflow.phase.toUpperCase()} phase.`);
  if (safeNextStep) {
    lines.push(`IMMEDIATE NEXT STEP (declared before compaction): ${safeNextStep}`);
  }
  lines.push("");
  lines.push("Current Status:");
  lines.push(`- Active Workflow: ${workflowId}`);
  lines.push(`- Phase: ${workflow.phase}`);
  lines.push(`- Mode: ${workflow.mode}`);
  lines.push(`- Depth: ${workflow.depth}`);
  lines.push(`- Spec Locked: ${workflow.specLocked ? "yes" : "no"}`);
  lines.push(`- Interview Complete: ${workflow.interviewComplete ? "yes" : "no"}`);
  lines.push(`- Acceptance Confirmed: ${workflow.acceptanceConfirmed ? "yes" : "no"}`);

  if (workflow.branch) {
    lines.push(`- Git Branch: ${workflow.branch}`);
  }

  // Expose the raw lazyAutopilot boolean so later runtime hooks can gate behavior directly.
  lines.push(`- Lazy Autopilot: ${workflow.lazyAutopilot ? "true" : "false"}`);

  if (workflow.currentWave !== 0 || workflow.totalWaves !== 0) {
    lines.push(`- Wave: ${workflow.currentWave} of ${workflow.totalWaves}`);
  }

  // Autopilot directives — CRITICAL for surviving compaction
  if (workflow.autopilot && !workflow.lazyAutopilot) {
    lines.push("");
    lines.push(
      "AUTOPILOT ACTIVE: Do not pause between phases. Continue to the next phase immediately. " +
        "Do not suggest starting a new session. Keep driving phase transitions unattended.",
    );
    lines.push(
      "Hard stops still apply per phase-gates: Rule 4 architectural decisions, credentials/secrets, " +
        "and destructive/irreversible operations.",
    );
  }

  if (workflow.autopilot && workflow.lazyAutopilot) {
    lines.push("");
    lines.push("LAZY AUTOPILOT ACTIVE. Rules:");
    lines.push("- Do NOT ask the user any questions.");
    lines.push("- Do NOT pause for phase confirmations or reviews.");
    lines.push("- Do NOT request clarifications — infer from context.");
    lines.push(
      "- ONLY stop for: (1) missing credentials/secrets, " +
        "(2) ambiguous destructive/irreversible operations.",
    );
    lines.push(
      "- On a Rule 4 architectural decision, decide autonomously using best judgment. " +
        "Log full rationale to ADL via goop_adl (rule, issue, decision, reasoning, affected files) — do not pause.",
    );
    lines.push("- For ALL other situations: make your best inference and continue.");
  }

  if (workflow.autopilot || workflow.lazyAutopilot) {
    lines.push("");
    lines.push(
      "AUTOPILOT SESSION RULES: Do NOT warn about context length or token limits. " +
        "Do NOT suggest starting a new session. Continue working until complete or a permitted stop condition.",
    );
  }

  // Document pointers for re-hydration
  lines.push("");
  lines.push("Key Documents (reload after compaction):");
  lines.push(`- Spec: ${docPrefix}SPEC.md`);
  lines.push(`- Blueprint: ${docPrefix}BLUEPRINT.md`);
  lines.push(`- Chronicle: ${docPrefix}CHRONICLE.md`);
  lines.push("");
  lines.push("Run `goop_status` to restore full workflow context before taking any action.");

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Hook factory
// ---------------------------------------------------------------------------

/**
 * Create the compaction hook that preserves workflow state across compaction.
 *
 * Pushes the survival block onto `output.context` (never sets `output.prompt`).
 */
export const createCompactionHook: HookFactory = (ctx: PluginContext): Partial<Hooks> => {
  const handler = safeHandler(
    "experimental.session.compacting",
    async (
      input: { sessionID: string },
      output: { context: string[]; prompt?: string },
    ): Promise<void> => {
      const sessionID = input.sessionID;
      const rawHandoff = sessionID ? ctx.compactionHandoff.get(sessionID) : undefined;
      const snapshot = isCompactionHandoffSnapshot(rawHandoff) ? rawHandoff : undefined;
      const nextStep = snapshot?.nextStep;

      if (rawHandoff === undefined) {
        logError(
          "compaction handoff snapshot was unavailable; continuing without it",
          new Error("No handoff snapshot for compacting session"),
        );
      } else if (snapshot === undefined) {
        logError("compaction handoff snapshot was malformed; continuing without it", rawHandoff);
      }

      if (sessionID) {
        ctx.compactionHandoff.delete(sessionID);
        ctx.pendingCompactions.delete(sessionID);
        clearCompactionHaltState(sessionID);
      }

      let block: string;
      try {
        block = buildWorkflowSurvivalBlock(ctx, snapshot, nextStep);
      } catch (error) {
        logError("compaction survival block failed; continuing without it", error);
        return;
      }

      if (block.trim().length > 0) {
        if (!Array.isArray(output.context)) {
          output.context = [];
          log("compaction output.context was absent, initialising");
        }
        output.context.push(block);
      }
    },
  );

  return {
    "experimental.session.compacting": handler,
  };
};
