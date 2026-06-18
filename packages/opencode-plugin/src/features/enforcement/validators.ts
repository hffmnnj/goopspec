/**
 * Phase-action validators for the enforcement subsystem.
 *
 * Pure functions that determine whether a given action is allowed in a
 * given workflow phase. Used by hooks (Wave 5) to block or warn on
 * disallowed operations.
 *
 * @module features/enforcement/validators
 */

import { basename, extname } from "node:path";
import type { WorkflowPhase, WorkflowState } from "../../core/types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ValidationResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Operations that can be validated against the current phase.
 *
 * - write_code:  Writing/editing implementation source files
 * - create_doc:  Creating/editing .goopspec documents
 * - delegate:    Delegating work to executor subagents
 * - execute_cmd: Running build/test/lint commands
 */
export type EnforcedOperation = "write_code" | "create_doc" | "delegate" | "execute_cmd";

// ---------------------------------------------------------------------------
// Implementation file detection
// ---------------------------------------------------------------------------

const IMPLEMENTATION_DIRS = ["src", "lib", "app", "apps", "packages", "server", "client"] as const;

const NON_CODE_EXTENSIONS = new Set([".md", ".json", ".yaml", ".yml", ".toml", ".txt", ".env"]);

/**
 * Normalise a file path to forward slashes for consistent matching.
 */
function normalisePath(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}

/**
 * Determine whether a file path points to implementation code.
 *
 * Returns `false` for:
 * - `.goopspec/` files
 * - `node_modules/` files
 * - Non-code extensions (.md, .json, .yaml, etc.)
 *
 * Returns `true` when the path is inside a known implementation directory
 * and has a code-like extension.
 */
export function isImplementationFile(filePath: string): boolean {
  const normalised = normalisePath(filePath).toLowerCase();
  if (!normalised) return false;

  // Exclude GoopSpec and node_modules paths
  if (
    normalised.includes("/.goopspec/") ||
    normalised.startsWith(".goopspec/") ||
    normalised.includes("/node_modules/") ||
    normalised.startsWith("node_modules/")
  ) {
    return false;
  }

  // Exclude non-code file types (extname returns "" for dotfiles like .env)
  const ext = extname(normalised);
  if (NON_CODE_EXTENSIONS.has(ext)) return false;
  const base = basename(normalised);
  if (NON_CODE_EXTENSIONS.has(base)) return false;

  // Must be inside a known implementation directory
  return IMPLEMENTATION_DIRS.some(
    (dir) =>
      normalised === dir || normalised.startsWith(`${dir}/`) || normalised.includes(`/${dir}/`),
  );
}

// ---------------------------------------------------------------------------
// Phase-action validation
// ---------------------------------------------------------------------------

/**
 * Check whether an operation is allowed in the given phase.
 *
 * Rules:
 * - write_code:  Only allowed in `execute` (by executors) and `idle` (no enforcement).
 *                In `execute`, the orchestrator itself should NOT write — it delegates.
 * - create_doc:  Always allowed (docs live in .goopspec/).
 * - delegate:    Only allowed in `execute` (and `accept` for verification tasks).
 * - execute_cmd: Always allowed (running tests/builds is fine in any phase).
 */
export function isOperationAllowed(
  phase: WorkflowPhase,
  operation: EnforcedOperation,
): ValidationResult {
  switch (operation) {
    case "write_code": {
      if (phase === "idle") return { allowed: true };
      if (phase === "discuss" || phase === "plan") {
        return {
          allowed: false,
          reason: `Cannot write implementation code in ${phase} phase. Complete planning first.`,
        };
      }
      if (phase === "execute") {
        // Allowed for executor subagents; the orchestrator hook will
        // separately block the orchestrator from writing.
        return { allowed: true };
      }
      if (phase === "accept") {
        return {
          allowed: false,
          reason: "Cannot write new code in accept phase. Only verification is allowed.",
        };
      }
      return { allowed: true };
    }

    case "create_doc":
      return { allowed: true };

    case "delegate": {
      if (phase === "idle" || phase === "discuss" || phase === "plan") {
        return {
          allowed: false,
          reason: `Cannot delegate implementation work in ${phase} phase. Complete planning first.`,
        };
      }
      return { allowed: true };
    }

    case "execute_cmd":
      return { allowed: true };

    default:
      return { allowed: true };
  }
}

/**
 * Validate whether a file write should be allowed given the current phase.
 *
 * Non-implementation files (docs, config) are always allowed.
 * Implementation files are checked against phase rules.
 */
export function validateWriteOperation(phase: WorkflowPhase, filePath: string): ValidationResult {
  if (!isImplementationFile(filePath)) {
    return { allowed: true };
  }
  return isOperationAllowed(phase, "write_code");
}

// ---------------------------------------------------------------------------
// Precondition validators
// ---------------------------------------------------------------------------

/**
 * Check whether execution can begin.
 *
 * Requires:
 * - Spec must be locked
 * - Interview must be complete (for standard/comprehensive modes)
 */
export function canStartExecution(workflow: WorkflowState): ValidationResult {
  if (!workflow.specLocked) {
    return {
      allowed: false,
      reason: "Cannot start execution: specification is not locked. Lock the spec first.",
    };
  }
  if (!workflow.interviewComplete && workflow.mode !== "quick") {
    return {
      allowed: false,
      reason: "Cannot start execution: discovery interview is not complete.",
    };
  }
  return { allowed: true };
}

/**
 * Check whether planning can begin.
 *
 * Requires:
 * - Interview must be complete (for standard/comprehensive modes)
 */
export function canStartPlanning(workflow: WorkflowState): ValidationResult {
  if (!workflow.interviewComplete && workflow.mode !== "quick") {
    return {
      allowed: false,
      reason: "Cannot start planning: discovery interview is not complete.",
    };
  }
  return { allowed: true };
}

/**
 * Check whether the orchestrator is attempting to write code directly.
 *
 * The orchestrator should NEVER write implementation files — it must
 * delegate to executor subagents.
 */
export function isOrchestratorCodeWrite(agentRole: string, filePath: string): ValidationResult {
  if (agentRole !== "orchestrator") {
    return { allowed: true };
  }
  if (!isImplementationFile(filePath)) {
    return { allowed: true };
  }
  return {
    allowed: false,
    reason:
      "Orchestrator must not write implementation code directly. Delegate to an executor subagent.",
  };
}
