/**
 * Logging utilities for @goopspec/pi-package.
 *
 * - `log()` is a debug-only no-op unless `GOOPSPEC_DEBUG=true`.
 * - `logError()` always writes to stderr.
 *
 * Both functions write directly to stderr to avoid biome's noConsole rule
 * and to keep output separate from tool results. Neither function throws.
 */

const PREFIX = "[goopspec:pi]";
const ERROR_PREFIX = "[goopspec:pi:error]";

/**
 * Debug log — only emits when `GOOPSPEC_DEBUG` is set to `"true"`.
 *
 * Safe to call unconditionally; zero cost in production.
 */
export function log(message: string, data?: unknown): void {
  if (process.env.GOOPSPEC_DEBUG !== "true") return;

  const timestamp = new Date().toISOString();
  const dataStr = data !== undefined ? ` ${JSON.stringify(data)}` : "";
  process.stderr.write(`${PREFIX} ${timestamp} ${message}${dataStr}\n`);
}

/**
 * Error log — always emits to stderr regardless of debug flag.
 *
 * Accepts an optional second argument that is typically an Error instance
 * but can be anything (e.g. a string or unknown from a catch block).
 */
export function logError(message: string, error?: unknown): void {
  const timestamp = new Date().toISOString();
  const errorStr =
    error instanceof Error ? ` ${error.message}` : error !== undefined ? ` ${String(error)}` : "";
  process.stderr.write(`${ERROR_PREFIX} ${timestamp} ${message}${errorStr}\n`);
}
