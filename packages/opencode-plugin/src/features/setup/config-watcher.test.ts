import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { setupTestEnvironment } from "../../test-utils.js";
import { createConfigWatcher } from "./config-watcher.js";
import type { GoopConfig } from "./index.js";

const DEBOUNCE_MS = 30;
const EVENT_WAIT_MS = 100;

describe("createConfigWatcher", () => {
  let testDir: string;
  let configPath: string;
  let cleanup: () => void;

  beforeEach(() => {
    const env = setupTestEnvironment("config-watcher");
    testDir = env.testDir;
    cleanup = env.cleanup;
    configPath = join(testDir, "goopspec.json");
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => cleanup());

  async function waitForEvents(): Promise<void> {
    await Bun.sleep(EVENT_WAIT_MS);
  }

  it("reloads fresh merged configuration after a file change", async () => {
    const reloaded: GoopConfig[] = [];
    const watcher = createConfigWatcher({
      path: configPath,
      debounceMs: DEBOUNCE_MS,
      onReload: (config) => {
        reloaded.push(config);
      },
    });

    writeFileSync(configPath, JSON.stringify({ agentThinkingLevels: { explorer: "HIGH" } }));
    await waitForEvents();
    watcher.dispose();

    expect(reloaded).toHaveLength(1);
    expect(reloaded[0]?.agentThinkingLevels?.explorer).toBe("high");
  });

  it("collapses rapid edits into one reload", async () => {
    const reloaded: GoopConfig[] = [];
    const watcher = createConfigWatcher({
      path: configPath,
      debounceMs: DEBOUNCE_MS,
      onReload: (config) => {
        reloaded.push(config);
      },
    });

    writeFileSync(configPath, JSON.stringify({ projectName: "first" }));
    writeFileSync(configPath, JSON.stringify({ projectName: "second" }));
    writeFileSync(configPath, JSON.stringify({ projectName: "final" }));
    await waitForEvents();
    watcher.dispose();

    expect(reloaded).toHaveLength(1);
    expect(reloaded[0]?.projectName).toBe("final");
  });

  it("stops pending and future callbacks when disposed", async () => {
    let reloads = 0;
    const watcher = createConfigWatcher({
      path: configPath,
      debounceMs: DEBOUNCE_MS,
      onReload: () => {
        reloads += 1;
      },
    });

    writeFileSync(configPath, JSON.stringify({ projectName: "pending" }));
    watcher.dispose();
    await waitForEvents();
    writeFileSync(configPath, JSON.stringify({ projectName: "after-dispose" }));
    await waitForEvents();

    expect(reloads).toBe(0);
  });

  it("clears each completed debounce before handling the next edit", async () => {
    const reloaded: GoopConfig[] = [];
    const watcher = createConfigWatcher({
      path: configPath,
      debounceMs: DEBOUNCE_MS,
      onReload: (config) => {
        reloaded.push(config);
      },
    });

    for (const projectName of ["one", "two", "three"]) {
      writeFileSync(configPath, JSON.stringify({ projectName }));
      await waitForEvents();
    }
    watcher.dispose();
    await waitForEvents();

    expect(reloaded.map((config) => config.projectName)).toEqual(["one", "two", "three"]);
  });
});
