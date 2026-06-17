/**
 * Validation-contract gate for the enforcement subsystem.
 *
 * Pure functions that validate whether a specification contract is complete
 * before the planner decomposes requirements into waves. The gate checks
 * that vision, must-haves, out-of-scope, risks, and constraints are all
 * present and non-empty.
 *
 * Enforced in standard/comprehensive/milestone modes; skipped in quick mode.
 *
 * @module features/enforcement/validation-contract
 */

import type { TaskMode } from "../../core/types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Shape of the specification contract to validate before decomposition.
 *
 * Each field corresponds to a required section in SPEC.md. All fields are
 * optional so callers can pass a partially-built contract for validation.
 */
export interface SpecContract {
  vision?: string;
  mustHaves?: readonly string[];
  outOfScope?: readonly string[];
  risks?: readonly string[];
  constraints?: readonly string[];
}

/**
 * Result of validating a specification contract.
 */
export interface ContractValidation {
  valid: boolean;
  /** Names of missing or empty required sections. */
  missing: string[];
  /** Human-readable summary when the contract is invalid. */
  reason?: string;
}

// ---------------------------------------------------------------------------
// Required sections
// ---------------------------------------------------------------------------

/**
 * Ordered list of required contract sections and their validators.
 *
 * Each entry maps a human-readable section name to a predicate that returns
 * `true` when the section is present and non-empty.
 */
const REQUIRED_SECTIONS: ReadonlyArray<{
  name: string;
  check: (contract: SpecContract) => boolean;
}> = [
  {
    name: "vision",
    check: (c) => typeof c.vision === "string" && c.vision.trim().length > 0,
  },
  {
    name: "mustHaves",
    check: (c) => Array.isArray(c.mustHaves) && c.mustHaves.length > 0,
  },
  {
    name: "outOfScope",
    check: (c) => Array.isArray(c.outOfScope) && c.outOfScope.length > 0,
  },
  {
    name: "risks",
    check: (c) => Array.isArray(c.risks) && c.risks.length > 0,
  },
  {
    name: "constraints",
    check: (c) => Array.isArray(c.constraints) && c.constraints.length > 0,
  },
];

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------

/**
 * Validate that a specification contract has all required sections populated.
 *
 * Checks:
 * - `vision` is a non-empty string
 * - `mustHaves` is a non-empty array
 * - `outOfScope` is a non-empty array
 * - `risks` is a non-empty array
 * - `constraints` is a non-empty array
 */
export function validateSpecContract(contract: SpecContract): ContractValidation {
  const missing: string[] = [];

  for (const section of REQUIRED_SECTIONS) {
    if (!section.check(contract)) {
      missing.push(section.name);
    }
  }

  if (missing.length === 0) {
    return { valid: true, missing: [] };
  }

  return {
    valid: false,
    missing,
    reason: `Specification contract is incomplete. Missing sections: ${missing.join(", ")}.`,
  };
}

/**
 * Determine whether the contract gate should be enforced for the given mode.
 *
 * Returns `false` for quick mode (abbreviated workflow skips the gate).
 * Returns `true` for standard, comprehensive, and milestone modes.
 */
export function shouldEnforceContractGate(mode: TaskMode): boolean {
  return mode !== "quick";
}

/**
 * Convenience function combining mode check and contract validation.
 *
 * If the mode does not require enforcement (quick), returns a passing result.
 * Otherwise delegates to {@link validateSpecContract}.
 */
export function checkContractGate(contract: SpecContract, mode: TaskMode): ContractValidation {
  if (!shouldEnforceContractGate(mode)) {
    return { valid: true, missing: [] };
  }
  return validateSpecContract(contract);
}
