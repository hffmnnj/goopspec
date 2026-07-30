/**
 * Shared status predicates — the single source of truth for what counts as
 * "complete" across the wave renderer, the compact-reminder gate, and the
 * SQL progress views.
 *
 * The set of complete statuses MUST stay aligned with:
 *  - the `STATUS_NEAR_MISSES` map in `features/db/types.ts` (legacy `complete`
 *    -> `completed` normalisation at the write boundary), and
 *  - the `LOWER(TRIM(status)) IN (...)` expressions in the `v_wave_progress`
 *    and `v_workflow_summary` view definitions (`features/db/migrations.ts`).
 *
 * Keeping these three in sync is what prevents the rendered progress counter
 * from disagreeing with the rendered task rows.
 */

/**
 * Statuses that count as "complete" (matched case-insensitively after trim).
 *
 * `done` and `completed` are the canonical terminal statuses. `complete` is a
 * legacy near-miss that the write boundary now normalises to `completed`, but
 * existing databases may still contain raw `complete` rows, so it is tolerated
 * here for read-side consistency.
 */
const COMPLETE_STATUSES: ReadonlySet<string> = new Set(["done", "completed", "complete"]);

/**
 * Returns true when the given status counts as complete.
 *
 * Pure, total, never throws. This is the single predicate consumed by the wave
 * renderer (`features/db/wave-format.ts`) and the compact-reminder gate
 * (`shared/compact-reminder.ts`); the SQL progress views in
 * `features/db/migrations.ts` mirror the same semantics so every consumer
 * agrees on what "complete" means.
 */
export function isCompleteStatus(status?: string): boolean {
  const normalized = status?.trim().toLowerCase() ?? "";
  return COMPLETE_STATUSES.has(normalized);
}
