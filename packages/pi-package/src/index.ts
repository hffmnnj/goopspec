/**
 * @goopspec/pi-package — GoopSpec five-phase workflow orchestration for Pi agent.
 *
 * This is the Pi extension entry point. Pi loads it via jiti (in-process TypeScript).
 * The extension factory receives Pi's API and registers tools, commands, and hooks.
 */

import type { PiExtensionAPI } from "./core/types.js";
import { log } from "./shared/logger.js";

const VERSION = "0.1.0";

/**
 * Extension factory called by Pi when the package is installed.
 *
 * Tools, commands, and hooks are registered in subsequent waves:
 * - Wave 3: registerTools(pi)
 * - Wave 4: registerCommands(pi), registerHooks(pi)
 * - Wave 5: registerAdvancedTools(pi)
 */
export default function goopspec(pi: PiExtensionAPI): void {
  log("GoopSpec Pi extension loading", { version: VERSION });

  // Placeholder — tool/command/hook registration added in later waves.
  void pi;

  log("GoopSpec Pi extension loaded");
}

export { goopspec };
