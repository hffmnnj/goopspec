/**
 * Compact-reminder shared helper.
 *
 * Pure, side-effect-free source of truth for the goop_compact reminder strings
 * and the wave-completion predicate. No I/O, no logging, no context imports.
 */

import { isCompleteStatus } from "./status.js";

/**
 * Reminder shown after the spec is locked: planning is done and now is a
 * scheduled compaction point before dispatching the first execute wave.
 */
export const SPEC_LOCK_COMPACT_REMINDER =
  "\n\n💡 Spec locked. Before dispatching the first execute wave, call goop_compact with a next_step description.";

/**
 * Reminder shown when a wave is marked complete: maintain a between-waves
 * compaction cadence.
 */
export const WAVE_COMPLETE_COMPACT_REMINDER =
  "\n\n💡 Wave complete. Consider calling goop_compact every 3-5 waves (sooner after heavy waves) with a next_step description, and always before /goop-accept.";

/**
 * Directive shown after a successful goop_compact queueing to remind the
 * calling agent to reconcile the resumed state before ending its turn.
 */
export const COMPACT_RECONCILIATION_DIRECTIVE =
  " Before ending your turn, reconcile the active workflow, phase, current wave, and task statuses against the durable state shown above.";

/**
 * Returns true only when the provided status is a terminal wave status.
 *
 * Delegates to the shared {@link isCompleteStatus} predicate so the
 * compact-reminder gate and the wave renderer can never disagree on what
 * counts as complete. Tolerates the legacy `complete` near-miss for rows
 * already persisted in existing databases.
 */
export function isWaveComplete(status?: string): boolean {
  return isCompleteStatus(status);
}
