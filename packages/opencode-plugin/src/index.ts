/**
 * GoopSpec 1.0.0 — OpenCode Plugin Entry Point
 *
 * Assembles the PluginContext, registers all 11 tools and all hooks,
 * and returns the merged Hooks object to the OpenCode loader.
 */

import { createPluginContextV2 } from "./core/context-v2.js";
import { createPluginContext } from "./core/context.js";
import { registerHooksV2 } from "./core/hooks-v2.js";
import type { Plugin } from "./core/sdk-compat.js";
import { registerToolsV2 } from "./core/tools-v2.js";
import { V2Plugin, type V2RuntimeContext } from "./core/v2-compat.js";
import { createConfigWatcher } from "./features/setup/config-watcher.js";
import { DEFAULT_HOOK_FACTORIES, createHooks } from "./hooks/index.js";
import { syncGlobalConfigSidecar } from "./shared/global-config-sidecar.js";
import { logError } from "./shared/logger.js";
import { getProjectGoopspecJsonPath } from "./shared/paths.js";
import { createTools } from "./tools/index.js";

const CONFIG_WATCHER_DEBOUNCE_MS = 100;

const goopspec: Plugin = async (input) => {
  try {
    const ctx = await createPluginContext(input);
    await syncGlobalConfigSidecar(ctx.sdk.directory);
    const hooks = createHooks(ctx, [...DEFAULT_HOOK_FACTORIES]);
    const tools = createTools(ctx);
    const watcher = createConfigWatcher({
      path: getProjectGoopspecJsonPath(ctx.sdk.directory),
      debounceMs: CONFIG_WATCHER_DEBOUNCE_MS,
      // loadMergedConfig has no retained merged-config cache. The reload validates
      // the edit; V1 chat.params resolves current config on every future turn.
      onReload: () => {
        logError(
          "GoopSpec project config reloaded: future turns use updated options; restart OpenCode to refresh the agent menu.",
        );
      },
    });

    return {
      ...hooks,
      dispose: async () => watcher.dispose(),
      tool: { ...(hooks.tool ?? {}), ...tools },
    };
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
      const hooks = await registerHooksV2(ctx, pluginCtx);

      if (ctx.teardown && typeof ctx.teardown.register === "function") {
        const watcher = createConfigWatcher({
          path: getProjectGoopspecJsonPath(pluginCtx.sdk.directory),
          debounceMs: CONFIG_WATCHER_DEBOUNCE_MS,
          onReload: () => hooks.reloadThinkingLevels(),
        });
        try {
          await ctx.teardown.register(async () => {
            watcher.dispose();
            await hooks.dispose();
          });
        } catch (error) {
          watcher.dispose();
          await hooks.dispose();
          throw error;
        }
      } else {
        logError("V2 config watcher skipped: runtime teardown capability is unavailable");
      }
    } catch (error) {
      logError("V2 plugin initialization failed", error);
    }
  },
});

export const server = goopspec;
export default Object.assign(goopspec, v2Plugin);
