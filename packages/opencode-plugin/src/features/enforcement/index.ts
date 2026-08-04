/**
 * Enforcement subsystem — document scaffolder and context injection rules.
 *
 * This module re-exports the retained enforcement concerns as a single
 * public surface. Hooks consume these pure functions.
 *
 * @module features/enforcement
 */

// Scaffolder — document auto-creation per phase
export {
  checkPhaseDocuments,
  getRequiredDocuments,
  getWorkflowDocDir,
  getWorkflowDocPath,
  scaffoldPhaseDocuments,
  type DocumentCheckResult,
  type DocumentName,
  type ScaffoldResult,
} from "./scaffolder.js";

// Phase context — per-phase rules for system prompt injection
export {
  buildEnforcementContext,
  buildPhaseEnforcement,
  buildStateContext,
  getPhaseRules,
  type PhaseRules,
} from "./phase-context.js";
