/**
 * Compact-reminder shared helper.
 *
 * Pure, side-effect-free source of truth for the goop_compact reminder strings
 * and the wave-completion predicate. No I/O, no logging, no context imports.
 */

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
 * Returns true only when the provided status is a terminal wave status.
 *
 * Terminal statuses are "done" and "completed" (case-insensitive).
 * Intentionally non-terminal: "complete" (no trailing 'd').
 */
export function isWaveComplete(status?: string): boolean {
  const normalized = status?.trim().toLowerCase() ?? "";
  return normalized === "done" || normalized === "completed";
}
