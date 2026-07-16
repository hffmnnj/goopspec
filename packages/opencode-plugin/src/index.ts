/**
 * GoopSpec 1.0.0 — OpenCode Plugin Entry Point
 *
 * Assembles the PluginContext, registers all 11 tools and all hooks,
 * and returns the merged Hooks object to the OpenCode loader.
 */

import { createPluginContextV2 } from "./core/context-v2.js";
import { createPluginContext } from "./core/context.js";
import type { Plugin } from "./core/sdk-compat.js";
import { registerToolsV2 } from "./core/tools-v2.js";
import { V2Plugin, type V2RuntimeContext } from "./core/v2-compat.js";
import { DEFAULT_HOOK_FACTORIES, createHooks } from "./hooks/index.js";
import { syncGlobalConfigSidecar } from "./shared/global-config-sidecar.js";
import { logError } from "./shared/logger.js";
import { createTools } from "./tools/index.js";

const goopspec: Plugin = async (input) => {
  try {
    const ctx = await createPluginContext(input);
    await syncGlobalConfigSidecar(ctx.sdk.directory);
    const hooks = createHooks(ctx, [...DEFAULT_HOOK_FACTORIES]);
    const tools = createTools(ctx);
    return { ...hooks, tool: { ...(hooks.tool ?? {}), ...tools } };
  } catch (error) {
    logError("Plugin initialization failed", error);
    return {};
  }
};

const v2Plugin = V2Plugin.define({
  id: "goopspec",
  async setup(ctx: V2RuntimeContext): Promise<void> {
    try {
      const pluginCtx = await createPluginContextV2(ctx);
      await syncGlobalConfigSidecar(pluginCtx.sdk.directory);
      await registerToolsV2(ctx, pluginCtx);
    } catch (error) {
      logError("V2 plugin initialization failed", error);
    }
  },
});

export const server = goopspec;
export default Object.assign(goopspec, v2Plugin);
