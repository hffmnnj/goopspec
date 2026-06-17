/**
 * GoopSpec CLI Theme System
 *
 * Centralized color palette and semantic color roles.
 * All color output uses semantic wrappers, never raw picocolors calls.
 * Respects NO_COLOR env var, FORCE_COLOR env var, and --no-color flag.
 */

import pc from "picocolors";

// ---------------------------------------------------------------------------
// Color state
// ---------------------------------------------------------------------------

/**
 * Explicit override set by `setColorEnabled()`.
 * `null` means "auto-detect from environment".
 */
let _colorOverride: boolean | null = null;

// ---------------------------------------------------------------------------
// Public API — color state management
// ---------------------------------------------------------------------------

/**
 * Check if color output is enabled.
 *
 * Priority:
 *  1. Explicit override via `setColorEnabled()`
 *  2. `FORCE_COLOR` env var (any truthy value enables color)
 *  3. `NO_COLOR` env var (any non-empty value disables color)
 *  4. picocolors built-in TTY detection
 */
export function isColorEnabled(): boolean {
  if (_colorOverride !== null) {
    return _colorOverride;
  }

  // FORCE_COLOR takes precedence over NO_COLOR (matches community convention)
  const forceColor = process.env["FORCE_COLOR"];
  if (forceColor !== undefined && forceColor !== "" && forceColor !== "0") {
    return true;
  }

  const noColor = process.env["NO_COLOR"];
  if (noColor !== undefined && noColor !== "") {
    return false;
  }

  return pc.isColorSupported;
}

/**
 * Explicitly enable or disable color output.
 * Called by the `--no-color` flag parser.
 */
export function setColorEnabled(enabled: boolean): void {
  _colorOverride = enabled;
}

/**
 * Reset to auto-detect mode (re-reads env vars on next call).
 */
export function resetColorEnabled(): void {
  _colorOverride = null;
}

// ---------------------------------------------------------------------------
// Internal — lazy color instance
// ---------------------------------------------------------------------------

/**
 * Returns a picocolors instance matching the current color state.
 * We call `createColors` on every invocation so that toggling
 * `setColorEnabled` takes effect immediately without caching stale state.
 */
function colors(): ReturnType<typeof pc.createColors> {
  return pc.createColors(isColorEnabled());
}

// ---------------------------------------------------------------------------
// Semantic color functions
// ---------------------------------------------------------------------------

/** Magenta — GoopSpec brand color */
export function primary(text: string): string {
  return colors().magenta(text);
}

/** Cyan — informational messages */
export function info(text: string): string {
  return colors().cyan(text);
}

/** Green — success states */
export function success(text: string): string {
  return colors().green(text);
}

/** Red — errors */
export function error(text: string): string {
  return colors().red(text);
}

/** Yellow — warnings */
export function warning(text: string): string {
  return colors().yellow(text);
}

/** Dim/gray — secondary information */
export function dim(text: string): string {
  return colors().dim(text);
}

/** Bold — emphasis */
export function bold(text: string): string {
  return colors().bold(text);
}

/** Italic — taglines, hints */
export function italic(text: string): string {
  return colors().italic(text);
}

/** Cyan + dim — inline code references */
export function code(text: string): string {
  const c = colors();
  return c.dim(c.cyan(text));
}

/** Magenta bold — key terms, highlighted values */
export function highlight(text: string): string {
  const c = colors();
  return c.bold(c.magenta(text));
}

// ---------------------------------------------------------------------------
// Composite helpers
// ---------------------------------------------------------------------------

/** Dim brackets around text — e.g. `[info]` */
export function label(text: string): string {
  const c = colors();
  return c.dim("[") + text + c.dim("]");
}

/** Primary + bold — status tags */
export function tag(text: string): string {
  const c = colors();
  return c.bold(c.magenta(text));
}
