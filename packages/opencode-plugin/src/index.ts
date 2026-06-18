/**
 * GoopSpec 1.0.0 — OpenCode Plugin Entry Point
 *
 * Assembles the PluginContext, registers all 11 tools and all hooks,
 * and returns the merged Hooks object to the OpenCode loader.
 */

import { createPluginContext } from "./core/context.js";
import type { Plugin } from "./core/sdk-compat.js";
import { createHooks } from "./hooks/index.js";
import { logError } from "./shared/logger.js";
import { createTools } from "./tools/index.js";

const goopspec: Plugin = async (input) => {
  try {
    const ctx = await createPluginContext(input);
    const hooks = createHooks(ctx);
    const tools = createTools(ctx);
    return { ...hooks, tool: { ...(hooks.tool ?? {}), ...tools } };
  } catch (error) {
    logError("Plugin initialization failed", error);
    return {};
  }
};

export const server = goopspec;
export default goopspec;
