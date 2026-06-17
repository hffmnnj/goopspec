/**
 * v2 state schema definitions and default factories.
 *
 * The v2 schema supports multiple concurrent workflows, each with its own
 * phase, wave progress, spec lock status, and document directory.
 *
 * @module features/state-manager/schema
 */

import { STATE_SCHEMA_VERSION } from "../../core/constants.js";
import type { GoopState, WorkflowState } from "../../core/types.js";

// ---------------------------------------------------------------------------
// Valid phase transitions
// ---------------------------------------------------------------------------

/**
 * Legal phase transitions for the 5-phase workflow.
 *
 * idle    -> discuss | plan
 * discuss -> plan | idle
 * plan    -> execute | discuss | idle
 * execute -> accept | plan
 * accept  -> idle
 */
export const VALID_TRANSITIONS: Record<string, readonly string[]> = {
  idle: ["discuss", "plan"],
  discuss: ["plan", "idle"],
  plan: ["execute", "discuss", "idle"],
  execute: ["accept", "plan"],
  accept: ["idle"],
} as const;

// ---------------------------------------------------------------------------
// Default factories
// ---------------------------------------------------------------------------

/** Create a fresh WorkflowState with sensible defaults. */
export function createDefaultWorkflowState(overrides: Partial<WorkflowState> = {}): WorkflowState {
  return {
    phase: "idle",
    mode: "standard",
    depth: "standard",
    interviewComplete: false,
    specLocked: false,
    acceptanceConfirmed: false,
    currentWave: 0,
    totalWaves: 0,
    autopilot: false,
    lazyAutopilot: false,
    ...overrides,
  };
}

/** Create a fresh v2 GoopState with a single "default" workflow. */
export function createDefaultState(activeWorkflowId = "default"): GoopState {
  return {
    version: STATE_SCHEMA_VERSION,
    activeWorkflowId,
    workflows: {
      [activeWorkflowId]: createDefaultWorkflowState(),
    },
  };
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/** Check whether a phase transition is legal. */
export function isValidTransition(from: string, to: string): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Return the list of phases reachable from `from`. */
export function allowedTransitions(from: string): readonly string[] {
  return VALID_TRANSITIONS[from] ?? [];
}
