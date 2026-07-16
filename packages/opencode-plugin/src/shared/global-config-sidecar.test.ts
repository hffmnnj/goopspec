import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { syncGlobalConfigSidecar } from "./global-config-sidecar.js";
import { getGoopspecRootFilePath } from "./paths.js";

describe("syncGlobalConfigSidecar", () => {
  let projectDir: string;
  let globalConfigPath: string;
  let previousGlobalConfigPath: string | undefined;

  beforeEach(async () => {
    projectDir = mkdtempSync(join(tmpdir(), "global-config-sidecar-project-"));
    globalConfigPath = join(
      mkdtempSync(join(tmpdir(), "global-config-sidecar-home-")),
      "opencode",
      "goopspec.json",
    );
    previousGlobalConfigPath = process.env.GOOPSPEC_GLOBAL_CONFIG_PATH;
    process.env.GOOPSPEC_GLOBAL_CONFIG_PATH = globalConfigPath;
    await mkdir(dirname(globalConfigPath), { recursive: true });
  });

  afterEach(() => {
    if (previousGlobalConfigPath === undefined) {
      process.env.GOOPSPEC_GLOBAL_CONFIG_PATH = undefined;
    } else {
      process.env.GOOPSPEC_GLOBAL_CONFIG_PATH = previousGlobalConfigPath;
    }
    rmSync(projectDir, { recursive: true, force: true });
    rmSync(dirname(dirname(globalConfigPath)), {
      recursive: true,
      force: true,
    });
  });

  it("writes valid global config to the project sidecar", async () => {
    writeFileSync(
      globalConfigPath,
      JSON.stringify({ agentModels: { orchestrator: "global/orchestrator" } }),
      "utf-8",
    );

    await syncGlobalConfigSidecar(projectDir);

    const sidecarPath = getGoopspecRootFilePath(projectDir, "global-config.json");
    expect(JSON.parse(readFileSync(sidecarPath, "utf-8"))).toEqual({
      agentModels: { orchestrator: "global/orchestrator" },
    });
  });

  it("removes stale sidecar when global config is unavailable", async () => {
    const sidecarPath = getGoopspecRootFilePath(projectDir, "global-config.json");
    await mkdir(dirname(sidecarPath), { recursive: true });
    writeFileSync(sidecarPath, JSON.stringify({ defaultModel: "stale/model" }), "utf-8");

    await syncGlobalConfigSidecar(projectDir);

    expect(existsSync(sidecarPath)).toBe(false);
  });

  it("removes stale sidecar when global config is invalid", async () => {
    const sidecarPath = getGoopspecRootFilePath(projectDir, "global-config.json");
    await mkdir(dirname(sidecarPath), { recursive: true });
    writeFileSync(sidecarPath, JSON.stringify({ defaultModel: "stale/model" }), "utf-8");
    writeFileSync(globalConfigPath, "[]", "utf-8");

    await syncGlobalConfigSidecar(projectDir);

    expect(existsSync(sidecarPath)).toBe(false);
  });
});
