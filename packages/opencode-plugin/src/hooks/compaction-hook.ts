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

import type { PluginContext } from "../core/types.js";
import { log } from "../shared/logger.js";
import type { HookFactory, Hooks } from "./types.js";
import { safeHandler } from "./utils.js";

// ---------------------------------------------------------------------------
// Survival block builder
// ---------------------------------------------------------------------------

/**
 * Build the workflow-state survival block that gets injected into compaction
 * context. Includes phase, wave progress, spec lock, autopilot directives,
 * and pointers to key documents.
 */
export function buildWorkflowSurvivalBlock(ctx: PluginContext): string {
  const state = ctx.stateManager.getState();
  const workflowId = state.activeWorkflowId;
  const workflow = state.workflows[workflowId];

  if (!workflow) {
    return "";
  }

  const docPrefix = workflowId === "default" ? ".goopspec/" : `.goopspec/${workflowId}/`;

  const lines: string[] = [];

  lines.push("## GoopSpec Workflow State (Compaction Survival)");
  lines.push("");
  lines.push(`RESUME FROM THIS POINT. You are in the ${workflow.phase.toUpperCase()} phase.`);
  lines.push("");
  lines.push("Current Status:");
  lines.push(`- Active Workflow: ${workflowId}`);
  lines.push(`- Phase: ${workflow.phase}`);
  lines.push(`- Mode: ${workflow.mode}`);
  lines.push(`- Depth: ${workflow.depth}`);
  lines.push(`- Spec Locked: ${workflow.specLocked ? "yes" : "no"}`);

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
      _input: { sessionID: string },
      output: { context: string[]; prompt?: string },
    ): Promise<void> => {
      const block = buildWorkflowSurvivalBlock(ctx);

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
