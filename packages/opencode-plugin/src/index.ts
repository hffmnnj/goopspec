/**
 * GoopSpec 1.0.0 — OpenCode Plugin Entry Point
 *
 * Plugin shape per installed @opencode-ai/plugin@1.1.47:
 *   Plugin = (input: PluginInput) => Promise<Hooks>
 *
 * The loader discovers named exports that are Plugin functions,
 * or a `server` export. We export both for compatibility.
 */

import type { Hooks, Plugin } from "@opencode-ai/plugin";

function createFallbackHooks(): Hooks {
  return {};
}

const goopspec: Plugin = async (_input) => {
  try {
    // Tools, hooks, and features wire in during Waves 3–7
    const hooks: Hooks = {};
    return hooks;
  } catch (error) {
    if (error instanceof Error) {
      // biome-ignore lint/suspicious/noConsole: logError not yet wired; replaced in Wave 3
      console.error(`[goopspec] Plugin initialization failed: ${error.message}`);
    }
    return createFallbackHooks();
  }
};

export const server = goopspec;
export default goopspec;
