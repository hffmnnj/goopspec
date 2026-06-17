/**
 * Logging utilities for GoopSpec 1.0.0 plugin.
 *
 * - `log()` is a debug-only no-op unless `GOOPSPEC_DEBUG=true`.
 * - `logError()` always writes to stderr.
 *
 * Neither function throws — callers can use them freely in catch blocks.
 */

const PREFIX = "[goopspec]";

/**
 * Debug log — only emits when `GOOPSPEC_DEBUG` is set to `"true"`.
 *
 * Safe to call unconditionally; zero cost in production.
 */
export function log(msg: string, data?: unknown): void {
  if (process.env.GOOPSPEC_DEBUG !== "true") return;

  // biome-ignore lint/suspicious/noConsole: intentional debug output
  if (data !== undefined) console.log(`${PREFIX} ${msg}`, data);
  // biome-ignore lint/suspicious/noConsole: intentional debug output
  else console.log(`${PREFIX} ${msg}`);
}

/**
 * Error log — always emits to stderr regardless of debug flag.
 *
 * Accepts an optional second argument that is typically an Error instance
 * but can be anything (e.g. a string or unknown from a catch block).
 */
export function logError(msg: string, error?: unknown): void {
  // biome-ignore lint/suspicious/noConsole: intentional error output
  if (error !== undefined) console.error(`${PREFIX} ${msg}`, error);
  // biome-ignore lint/suspicious/noConsole: intentional error output
  else console.error(`${PREFIX} ${msg}`);
}
