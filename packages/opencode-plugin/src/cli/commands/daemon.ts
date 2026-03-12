/**
 * GoopSpec CLI - Daemon Command
 * Manages the GoopSpec daemon service (start, stop, status, install, uninstall).
 *
 * Stub — full implementation in Wave 3 (Task 3.5).
 */

import { warning } from "../theme.js";

export async function runDaemon(
  _subcommand: string,
  _flags: Record<string, string | boolean>,
): Promise<void> {
  console.log(warning("'daemon' command is not yet implemented. Coming soon."));
}
