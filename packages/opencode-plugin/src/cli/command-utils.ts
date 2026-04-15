/**
 * GoopSpec CLI — Shared Command Utilities
 *
 * Common patterns extracted from CLI commands to reduce duplication:
 * - `withDaemon` — daemon availability check wrapper
 * - `withBanner` — banner display + error boundary wrapper
 * - `handleCommandError` — standard error handler
 * - `formatUptime` — human-readable uptime formatting
 */

import { createDaemonClient, type DaemonClient } from "../features/daemon/client.js";
import { showBanner, showError } from "./ui.js";

/**
 * Check daemon availability and call `fn` with the connected client.
 * If the daemon is offline or the client cannot be created, shows a
 * themed error message and returns `undefined`.
 */
export async function withDaemon<T>(
  fn: (client: DaemonClient) => Promise<T>,
): Promise<T | undefined> {
  let client: DaemonClient;
  try {
    client = await createDaemonClient();
  } catch {
    showError(
      "Could not initialize daemon client",
      "Check your configuration with: goopspec status",
    );
    return undefined;
  }

  return fn(client);
}

/**
 * Show the GoopSpec banner, run `fn`, and catch any uncaught errors
 * with `handleCommandError`. Prevents commands from throwing to the
 * top-level CLI dispatcher.
 */
export async function withBanner(fn: () => Promise<void>): Promise<void> {
  try {
    showBanner();
    await fn();
  } catch (error) {
    handleCommandError(error);
  }
}

/**
 * Standard error handler for CLI commands.
 * Extracts the message from Error instances or falls back to a generic
 * string. Calls `showError` — does NOT call `process.exit`.
 */
export function handleCommandError(error: unknown): void {
  const message =
    error instanceof Error ? error.message : "An unexpected error occurred";
  showError(message);
}

/**
 * Format an uptime value in seconds to a human-readable string.
 * Returns "Xd Xh Xm", "Xh Xm", "Xm Xs", or "Xs" depending on magnitude.
 */
export function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  }
  return `${secs}s`;
}
