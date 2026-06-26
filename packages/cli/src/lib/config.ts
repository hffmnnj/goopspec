import { existsSync, mkdirSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";
import type { GoopConfig } from "./types.js";

export type { GoopConfig };

const GOOPSPEC_DIR = ".goopspec";
const CONFIG_FILENAME = "config.json";

export function getConfigPath(): string {
  return join(process.cwd(), GOOPSPEC_DIR, CONFIG_FILENAME);
}

export async function readConfig(): Promise<GoopConfig | null> {
  const path = getConfigPath();
  if (!existsSync(path)) return null;

  try {
    const contents = await Bun.file(path).text();
    const parsed = JSON.parse(contents) as GoopConfig;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Deep-merge patch into existing config.
 *
 * Rules:
 * - Undefined values in patch are ignored (not written).
 * - Null values in patch clear the field (set to undefined in output).
 * - Object fields (agentModels, agentThinkingBudgets) are merged at the field level.
 * - Scalar fields are replaced.
 */
export function mergeConfig(
  existing: GoopConfig,
  patch: Partial<GoopConfig>,
): GoopConfig {
  const result: GoopConfig = { ...existing };

  for (const key of Object.keys(patch) as Array<keyof GoopConfig>) {
    const value = patch[key];

    if (value === undefined) {
      continue;
    }

    if (value === null) {
      delete result[key];
      continue;
    }

    if (key === "agentModels") {
      result.agentModels = { ...result.agentModels, ...(value as GoopConfig["agentModels"]) };
      continue;
    }

    if (key === "agentThinkingBudgets") {
      result.agentThinkingBudgets = { ...result.agentThinkingBudgets, ...(value as GoopConfig["agentThinkingBudgets"]) };
      continue;
    }

    if (key === "projectName" || key === "defaultModel") {
      result[key] = value as string;
      continue;
    }

    if (key === "memoryEnabled" || key === "gitignoreGoopspec") {
      result[key] = value as boolean;
    }
  }

  return result;
}

function stripUndefinedFields(config: GoopConfig): GoopConfig {
  const result: GoopConfig = {};

  const { projectName, defaultModel, agentModels, agentThinkingBudgets, memoryEnabled, gitignoreGoopspec } = config;

  if (projectName !== undefined) result.projectName = projectName;
  if (defaultModel !== undefined) result.defaultModel = defaultModel;
  if (agentModels !== undefined) result.agentModels = agentModels;
  if (agentThinkingBudgets !== undefined) result.agentThinkingBudgets = agentThinkingBudgets;
  if (memoryEnabled !== undefined) result.memoryEnabled = memoryEnabled;
  if (gitignoreGoopspec !== undefined) result.gitignoreGoopspec = gitignoreGoopspec;

  return result;
}

/**
 * Read existing config, merge patch into it, and write the result atomically.
 * Creates the .goopspec/ directory if absent. Never writes undefined fields to JSON.
 */
export async function writeConfig(
  patch: Partial<GoopConfig>,
): Promise<GoopConfig> {
  const existing = (await readConfig()) ?? {};
  const merged = mergeConfig(existing, patch);
  const toWrite = stripUndefinedFields(merged);

  const configPath = getConfigPath();
  mkdirSync(dirname(configPath), { recursive: true });

  const tmp = `${configPath}.tmp`;
  await Bun.write(tmp, JSON.stringify(toWrite, null, 2));
  renameSync(tmp, configPath);

  return toWrite;
}
