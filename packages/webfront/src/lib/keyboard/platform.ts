/**
 * Platform detection and normalization for keyboard shortcuts.
 *
 * Kept tiny and side-effect free so it can be overridden in unit tests.
 */

/** True if the current runtime reports a macOS-derived platform. */
export function isMac(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Mac|iPod|iPhone|iPad/i.test(navigator.platform);
}

/**
 * Normalize the 'mod' meta-modifier to 'cmd' on macOS and 'ctrl' elsewhere.
 * This makes it possible to write cross-platform combos as 'mod+k'.
 */
export function normalizeMod(key: string): string {
  return key === 'mod' ? (isMac() ? 'cmd' : 'ctrl') : key;
}

/** Normalize a single key token to lower-case for matching. */
export function normalizeKey(key: string): string {
  return key.toLowerCase();
}
