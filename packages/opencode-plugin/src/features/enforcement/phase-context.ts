/**
 * Per-phase context rules for the enforcement subsystem.
 *
 * Builds phase-specific instruction blocks that the system-transform hook
 * (Wave 5) injects into the LLM system prompt. Each phase has MUST DO /
 * MUST NOT DO rules, required documents, and optional delegation guidance.
 *
 * All functions are pure — they take state and return strings.
 *
 * @module features/enforcement/phase-context
 */

import type { WorkflowPhase, WorkflowState } from "../../core/types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PhaseRules {
  phase: WorkflowPhase;
  label: string;
  mustDo: readonly string[];
  mustNotDo: readonly string[];
  requiredDocuments: readonly string[];
  delegationNote?: string;
}

// ---------------------------------------------------------------------------
// Phase rule definitions
// ---------------------------------------------------------------------------

const DELEGATION_NOTE = [
  "DELEGATE all code work to executor subagents using the task() tool.",
  'Use subagent_type: "goop-executor-{tier}" (low/medium/high/frontend-low/frontend-medium/frontend-high).',
  "Never write implementation code directly as the orchestrator.",
].join("\n");

const PHASE_RULES: Record<WorkflowPhase, Omit<PhaseRules, "phase">> = {
  idle: {
    label: "IDLE",
    mustDo: [
      "Use /goop-discuss or /goop-plan to start a new feature",
      "Use /goop-status to check current state",
    ],
    mustNotDo: ["Write implementation code without a plan", "Skip the planning phase"],
    requiredDocuments: [],
  },

  discuss: {
    label: "DISCUSS",
    mustDo: [
      "Ask clarifying questions to understand requirements",
      "Identify must-haves, nice-to-haves, and out-of-scope items",
      "Challenge assumptions respectfully",
      "Summarise understanding before moving to plan",
    ],
    mustNotDo: [
      "Write ANY implementation code",
      "Create source files outside .goopspec/",
      "Skip requirement gathering",
      "Proceed to execution without a plan",
    ],
    requiredDocuments: [],
  },

  plan: {
    label: "PLAN",
    mustDo: [
      "Create SPEC.md with must-haves, nice-to-haves, out-of-scope",
      "Create BLUEPRINT.md with wave-based execution plan",
      "Map all must-haves to specific tasks",
      "Define verification steps for each task",
      "Get user confirmation before locking the spec",
    ],
    mustNotDo: [
      "Write ANY implementation code",
      "Create source files (only .goopspec/ documents)",
      "Proceed without user confirmation",
      "Use write/edit tools on src/ files",
    ],
    requiredDocuments: ["SPEC.md"],
  },

  execute: {
    label: "EXECUTE",
    mustDo: [
      "DELEGATE all code work to executor subagents",
      "Track progress in CHRONICLE.md",
      "Follow wave order (complete wave N before wave N+1)",
      "Verify each task completion before moving on",
      "Save checkpoints at wave boundaries",
      "Log deviations in ADL.md",
    ],
    mustNotDo: [
      "Write code directly — ALWAYS delegate to subagents",
      "Skip verification steps",
      "Ignore test failures",
      "Modify files outside BLUEPRINT.md scope",
    ],
    requiredDocuments: ["SPEC.md", "BLUEPRINT.md", "CHRONICLE.md"],
    delegationNote: DELEGATION_NOTE,
  },

  accept: {
    label: "ACCEPT",
    mustDo: [
      "Verify ALL must-haves from SPEC.md are complete",
      "Run all tests and ensure they pass",
      "Check for any deviations in ADL.md",
      "Get explicit user acceptance",
    ],
    mustNotDo: [
      "Mark complete without verification",
      "Skip user confirmation",
      "Ignore failing tests",
      "Write new features — only fixes for acceptance gaps",
    ],
    requiredDocuments: ["SPEC.md", "BLUEPRINT.md", "CHRONICLE.md"],
  },
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get the enforcement rules for a specific phase.
 */
export function getPhaseRules(phase: WorkflowPhase): PhaseRules {
  const rules = PHASE_RULES[phase];
  return { phase, ...rules };
}

/**
 * Build the phase enforcement block for system prompt injection.
 *
 * Returns a markdown-formatted string with MUST DO / MUST NOT DO rules.
 */
export function buildPhaseEnforcement(phase: WorkflowPhase): string {
  const rules = PHASE_RULES[phase];
  if (!rules) return "";

  const lines: string[] = [`## PHASE ENFORCEMENT: ${rules.label}`, "", "### MUST DO:"];

  for (const item of rules.mustDo) {
    lines.push(`- ${item}`);
  }

  lines.push("", "### MUST NOT DO:");
  for (const item of rules.mustNotDo) {
    lines.push(`- ${item}`);
  }

  if (rules.requiredDocuments.length > 0) {
    lines.push("", "### REQUIRED DOCUMENTS:");
    for (const doc of rules.requiredDocuments) {
      lines.push(`- ${doc}`);
    }
  }

  if (rules.delegationNote) {
    lines.push("", "### DELEGATION (CRITICAL):", "", rules.delegationNote);
  }

  return lines.join("\n");
}

/**
 * Build a compact state summary for system prompt injection.
 */
export function buildStateContext(workflow: WorkflowState, workflowId: string): string {
  const lines: string[] = [
    "## CURRENT STATE",
    "",
    `**Workflow:** ${workflowId}`,
    `**Phase:** ${workflow.phase}`,
    `**Mode:** ${workflow.mode}`,
    `**Spec Locked:** ${workflow.specLocked ? "Yes" : "No"}`,
  ];

  if (workflow.totalWaves > 0) {
    lines.push(`**Wave Progress:** ${workflow.currentWave}/${workflow.totalWaves}`);
  }

  if (workflow.acceptanceConfirmed) {
    lines.push("**Acceptance:** Confirmed");
  }

  if (workflow.checkpoint) {
    lines.push(`**Checkpoint:** ${workflow.checkpoint}`);
  }

  return lines.join("\n");
}

/**
 * Build the complete enforcement context (state + phase rules).
 *
 * This is the primary entry point for the system-transform hook.
 */
export function buildEnforcementContext(workflow: WorkflowState, workflowId: string): string {
  const stateBlock = buildStateContext(workflow, workflowId);
  const phaseBlock = buildPhaseEnforcement(workflow.phase);

  if (!phaseBlock) return stateBlock;
  return `${stateBlock}\n\n${phaseBlock}`;
}
