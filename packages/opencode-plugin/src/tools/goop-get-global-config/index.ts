import { readFile } from "node:fs/promises";

import { tool } from "../../core/sdk-compat.js";
import type { ToolContext, ToolDefinition } from "../../core/sdk-compat.js";
import type { PluginContext } from "../../core/types.js";
import { getGlobalConfigPath } from "../../shared/paths.js";

interface GlobalConfigSuccessResult {
  success: true;
  config: Record<string, unknown>;
  path: string;
}

interface GlobalConfigErrorResult {
  success: false;
  error: string;
  path: string;
}

type GlobalConfigResult = GlobalConfigSuccessResult | GlobalConfigErrorResult;

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function readGlobalConfig(): Promise<GlobalConfigResult> {
  const configPath = getGlobalConfigPath();

  try {
    const content = await readFile(configPath, "utf-8");
    const parsed = JSON.parse(content) as unknown;

    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return {
        success: false,
        error: "Global GoopSpec config must be a JSON object",
        path: configPath,
      };
    }

    return { success: true, config: parsed as Record<string, unknown>, path: configPath };
  } catch (error: unknown) {
    if (isMissingFileError(error)) {
      return { success: true, config: {}, path: configPath };
    }

    return { success: false, error: formatError(error), path: configPath };
  }
}

export function createGoopGetGlobalConfigTool(_ctx: PluginContext): ToolDefinition {
  return tool({
    description:
      "Read the global GoopSpec config from the OpenCode config directory " +
      "(~/.config/opencode/goopspec.json, or GOOPSPEC_GLOBAL_CONFIG_PATH when set). " +
      "Returns {} if the file does not exist.",
    args: {},
    async execute(_args: Record<string, never>, _context: ToolContext): Promise<string> {
      const result = await readGlobalConfig();
      return JSON.stringify(result);
    },
  });
}
