/**
 * Enforcement subsystem — phase validators, document scaffolder, and
 * context injection rules.
 *
 * This module re-exports the three enforcement concerns as a single
 * public surface. Hooks (Wave 5) consume these pure functions.
 *
 * @module features/enforcement
 */

// Validators — phase-action allow/deny logic
export {
  canStartExecution,
  canStartPlanning,
  isImplementationFile,
  isOperationAllowed,
  isOrchestratorCodeWrite,
  validateWriteOperation,
  type EnforcedOperation,
  type ValidationResult,
} from "./validators.js";

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

// Validation contract — spec completeness gate before wave decomposition
export {
  checkContractGate,
  shouldEnforceContractGate,
  validateSpecContract,
  type ContractValidation,
  type SpecContract,
} from "./validation-contract.js";
