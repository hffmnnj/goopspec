/**
 * Verifier stage-gating predicates: is a role dispatchable in the current
 * phase, and do a wave's verification rows satisfy the completion gate.
 * Pure and side-effect-free — the runtime guard hook and wave-completion
 * gate (later tasks) consume these but own all I/O themselves.
 *
 * @module features/enforcement/verifier-stage
 */

import type { WorkflowPhase } from "../../core/types.js";
import { VERIFICATION_STATUSES, type VerificationStatus } from "../db/types.js";
import type { ValidationResult } from "./validators.js";

// ---------------------------------------------------------------------------
// Verifier dispatch gating
// ---------------------------------------------------------------------------

const ACCEPT_ONLY_ROLE = "verifier";
const EXECUTE_ONLY_ROLE = "wave-verifier";

export interface VerifierDispatchCheck {
  /**
   * Arbitrary string, not just {@link AgentRole} — the caller derives this
   * from a delegated agent name and may not normalize it. Undefined or
   * unrecognized values are treated as undetermined and allowed.
   */
  role: string | undefined;
  phase: WorkflowPhase;
}

/**
 * `"verifier"` is accept-only and `"wave-verifier"` is execute-only; every
 * other role (including undetermined ones) is allowed in every phase —
 * fails OPEN so unrelated delegations are never blocked by this predicate.
 */
export function isVerifierDispatchAllowed({
  role,
  phase,
}: VerifierDispatchCheck): ValidationResult {
  if (role === ACCEPT_ONLY_ROLE) {
    return phase === "accept"
      ? { allowed: true }
      : {
          allowed: false,
          reason: `verifier is acceptance-only; dispatch wave-verifier during execute (current phase: ${phase}).`,
        };
  }

  if (role === EXECUTE_ONLY_ROLE) {
    return phase === "execute"
      ? { allowed: true }
      : {
          allowed: false,
          reason: `wave-verifier is execute-only; dispatch verifier during accept (current phase: ${phase}).`,
        };
  }

  return { allowed: true };
}

// ---------------------------------------------------------------------------
// Verification-result <-> DB status mapping (single source of truth)
// ---------------------------------------------------------------------------

/** `goop_write_wave`'s `verifications[]` vocabulary, distinct from the DB's
 * stored {@link VerificationStatus} (which also has a transient `"pending"`). */
export const VERIFICATION_RESULT_STATUSES = ["pass", "fail", "skip"] as const;
export type VerificationResultStatus = (typeof VERIFICATION_RESULT_STATUSES)[number];

export const VERIFICATION_RESULT_TO_DB_STATUS: Readonly<
  Record<VerificationResultStatus, VerificationStatus>
> = {
  pass: "passed",
  fail: "failed",
  skip: "skipped",
};

/** Returns `undefined` for input outside {@link VERIFICATION_RESULT_STATUSES}
 * rather than throwing — callers decide how to surface an invalid input. */
export function toDbVerificationStatus(status: string): VerificationStatus | undefined {
  return VERIFICATION_RESULT_TO_DB_STATUS[status as VerificationResultStatus];
}

// Re-exported so consumers don't need a second import from features/db/types.js.
export { VERIFICATION_STATUSES };
export type { VerificationStatus };

// ---------------------------------------------------------------------------
// Wave verification gate
// ---------------------------------------------------------------------------

export interface VerifiedRowLike {
  /** Recency key. `id` is `INTEGER PRIMARY KEY AUTOINCREMENT` on the
   * append-only `verifications` table, so it is strictly increasing in
   * insertion order — sorted here rather than trusted from caller order. */
  id: number;
  /** The logical check this row reports on (e.g. `"test"`, `"typecheck"`). */
  check_name: string;
  status: VerificationStatus;
}

/**
 * True when every distinct `check_name`'s *effective* (latest-by-`id`) row
 * is non-`"failed"`, and at least one check exists. Rows are append-only —
 * a later `pass`/`skip` for the SAME check supersedes that check's prior
 * `fail`; a pass for a DIFFERENT check never erases another check's
 * unresolved fail. A wave with zero rows is never verified; an explicit
 * `"skipped"` effective row satisfies the gate as an auditable escape.
 */
export function isWaveVerified(rows: readonly VerifiedRowLike[]): boolean {
  if (rows.length === 0) return false;

  const latestByCheck = new Map<string, VerifiedRowLike>();
  for (const row of rows) {
    const existing = latestByCheck.get(row.check_name);
    if (existing === undefined || row.id > existing.id) {
      latestByCheck.set(row.check_name, row);
    }
  }

  if (latestByCheck.size === 0) return false;
  for (const row of latestByCheck.values()) {
    if (row.status === "failed") return false;
  }
  return true;
}
