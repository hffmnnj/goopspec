import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import type { PluginContext } from "../../test-utils.js";
import {
  createMockPluginContext,
  createMockToolContext,
  setupTestEnvironment,
} from "../../test-utils.js";
import { createGoopGetGlobalConfigTool } from "./index.js";

interface ToolResponse {
  success: boolean;
  config?: Record<string, unknown>;
  error?: string;
  path: string;
}

describe("goop_get_global_config tool", () => {
  let ctx: PluginContext;
  let cleanup: () => void;
  let previousGlobalConfigPath: string | undefined;
  let previousXdgConfigHome: string | undefined;
  let configPath: string;

  beforeEach(() => {
    const env = setupTestEnvironment("goop-get-global-config");
    cleanup = env.cleanup;
    ctx = createMockPluginContext({ testDir: env.testDir, db: env.db });
    configPath = join(env.testDir, "xdg", "opencode", "goopspec.json");

    previousGlobalConfigPath = process.env.GOOPSPEC_GLOBAL_CONFIG_PATH;
    previousXdgConfigHome = process.env.XDG_CONFIG_HOME;
    process.env.GOOPSPEC_GLOBAL_CONFIG_PATH = configPath;
    process.env.XDG_CONFIG_HOME = undefined;
  });

  afterEach(async () => {
    if (previousGlobalConfigPath === undefined) {
      process.env.GOOPSPEC_GLOBAL_CONFIG_PATH = undefined;
    } else {
      process.env.GOOPSPEC_GLOBAL_CONFIG_PATH = previousGlobalConfigPath;
    }

    if (previousXdgConfigHome === undefined) {
      process.env.XDG_CONFIG_HOME = undefined;
    } else {
      process.env.XDG_CONFIG_HOME = previousXdgConfigHome;
    }

    await rm(dirname(dirname(configPath)), { recursive: true, force: true });
    cleanup();
  });

  async function executeTool(): Promise<ToolResponse> {
    const tool = createGoopGetGlobalConfigTool(ctx);
    const raw = await tool.execute({}, createMockToolContext());
    const text = typeof raw === "string" ? raw : raw.output;
    return JSON.parse(text) as ToolResponse;
  }

  it("returns parsed JSON when the global config file exists", async () => {
    await mkdir(dirname(configPath), { recursive: true });
    await writeFile(
      configPath,
      JSON.stringify({ defaultModel: "anthropic/claude-sonnet-4-6", memoryEnabled: true }),
      "utf-8",
    );

    const result = await executeTool();

    expect(result).toEqual({
      success: true,
      config: { defaultModel: "anthropic/claude-sonnet-4-6", memoryEnabled: true },
      path: configPath,
    });
  });

  it("returns an empty config when the global config file is missing", async () => {
    const result = await executeTool();

    expect(result).toEqual({ success: true, config: {}, path: configPath });
  });

  it("returns an error when the global config file contains invalid JSON", async () => {
    await mkdir(dirname(configPath), { recursive: true });
    await writeFile(configPath, "{ invalid json", "utf-8");

    const result = await executeTool();

    expect(result.success).toBe(false);
    expect(result.path).toBe(configPath);
    expect(result.error).toContain("JSON");
  });
});
