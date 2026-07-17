import { type FSWatcher, readFileSync, watch } from "node:fs";
import { basename, dirname } from "node:path";

import { log, logError } from "../../shared/logger.js";
import { loadMergedConfig, normalizeConfig } from "./index.js";
import type { GoopConfig } from "./index.js";

export interface ConfigWatcherOptions {
  path: string;
  onReload: (config: GoopConfig) => void | Promise<void>;
  debounceMs: number;
}

export interface ConfigWatcher {
  dispose(): void;
}

/**
 * Watch a project-level goopspec.json and deliver fresh merged configuration
 * after a quiet period. Watching its parent directory survives atomic file
 * replacements, which otherwise detach a file-level fs.watch subscription.
 */
export function createConfigWatcher({
  path,
  onReload,
  debounceMs,
}: ConfigWatcherOptions): ConfigWatcher {
  let disposed = false;
  let reloadTimer: ReturnType<typeof setTimeout> | undefined;
  const filename = basename(path);
  const projectDir = dirname(path);

  const scheduleReload = (): void => {
    if (disposed) return;

    if (reloadTimer) clearTimeout(reloadTimer);
    reloadTimer = setTimeout(() => {
      reloadTimer = undefined;
      void reload();
    }, debounceMs);
  };

  const reload = async (): Promise<void> => {
    if (disposed) return;

    try {
      const raw = JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown>;
      normalizeConfig(raw);
      const config = loadMergedConfig(projectDir);

      if (!disposed) await onReload(config);
    } catch (error) {
      logError(`Config watcher: skipping invalid config ${path}`, error);
    }
  };

  let watcher: FSWatcher;
  try {
    watcher = watch(projectDir, (_eventType, changedFilename) => {
      if (changedFilename === filename) scheduleReload();
    });
  } catch (error) {
    logError(`Config watcher: unable to watch ${path}`, error);
    watcher = { close: () => undefined } as FSWatcher;
  }

  return {
    dispose(): void {
      if (disposed) return;
      disposed = true;
      watcher.close();
      if (reloadTimer) {
        clearTimeout(reloadTimer);
        reloadTimer = undefined;
      }
      log(`Config watcher: disposed ${path}`);
    },
  };
}
