/**
 * Configuration System for GoopSpec
 * Zod schema validation and multi-level config loading
 * 
 * @module core/config
 */

import { existsSync, readFileSync } from "fs";
import { z } from "zod";
import type { GoopSpecConfig, EnforcementLevel } from "./types.js";
import { MEMORY_TYPES, SEARCH_PROVIDERS } from "./types.js";
import { getGlobalConfigPath, getProjectGoopspecDir, joinPath } from "../shared/paths.js";
import { log, logError } from "../shared/logger.js";

// ============================================================================
// Zod Schemas
// ============================================================================

const AgentConfigSchema = z.object({
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
});

const McpConfigSchema = z.object({
  context7: z.boolean().optional(),
  exa: z.boolean().optional(),
  searchProvider: z.enum(SEARCH_PROVIDERS).optional().default("exa"),
  playwright: z.boolean().optional(),
  memory: z.boolean().optional(),
  github: z.boolean().optional(),
  sqlite: z.boolean().optional(),
});

const OrchestratorConfigSchema = z.object({
  enableAsDefault: z.boolean().optional(),
  model: z.string().optional(),
  thinkingBudget: z.number().min(1000).max(128000).optional(),
  phaseGates: z.enum(["strict", "automatic", "ask"]).optional(),
  waveExecution: z.enum(["sequential", "parallel"]).optional(),
});

// Memory system configuration schemas
const MemoryCaptureConfigSchema = z.object({
  enabled: z.boolean().optional(),
  captureToolUse: z.boolean().optional(),
  captureMessages: z.boolean().optional(),
  capturePhaseChanges: z.boolean().optional(),
  skipTools: z.array(z.string()).optional(),
  minImportanceThreshold: z.number().min(0).max(1).optional(),
});

const MemoryInjectionConfigSchema = z.object({
  enabled: z.boolean().optional(),
  budgetTokens: z.number().min(100).max(4000).optional(),
  format: z.enum(["timeline", "bullets", "structured"]).optional(),
  priorityTypes: z.array(z.enum(MEMORY_TYPES)).optional(),
});

const MemoryPrivacyConfigSchema = z.object({
  enabled: z.boolean().optional(),
  stripPatterns: z.array(z.string()).optional(),
  privateTagEnabled: z.boolean().optional(),
  retentionDays: z.number().min(1).max(365).optional(),
  maxMemories: z.number().min(100).max(100000).optional(),
});

const MemoryEmbeddingsConfigSchema = z.object({
  provider: z.enum(["local", "openai", "ollama"]).optional(),
  model: z.string().optional(),
  dimensions: z.number().min(128).max(3072).optional(),
});

const MemorySystemConfigSchema = z.object({
  enabled: z.boolean().optional(),
  workerPort: z.number().min(1024).max(65535).optional(),
  capture: MemoryCaptureConfigSchema.optional(),
  injection: MemoryInjectionConfigSchema.optional(),
  privacy: MemoryPrivacyConfigSchema.optional(),
  embeddings: MemoryEmbeddingsConfigSchema.optional(),
});

export const GoopSpecConfigSchema = z.object({
  projectName: z.string().optional(),
  enforcement: z.enum(["assist", "warn", "strict"]).optional(),
  constitution: z.boolean().optional(),
  adlEnabled: z.boolean().optional(),
  defaultModel: z.string().optional(),
  agents: z.record(z.string(), AgentConfigSchema).optional(),
  mcp: McpConfigSchema.optional(),
  orchestrator: OrchestratorConfigSchema.optional(),
  memory: MemorySystemConfigSchema.optional(),
});

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_CONFIG: GoopSpecConfig = {
  enforcement: "assist" as EnforcementLevel,
  adlEnabled: true,
  defaultModel: "anthropic/claude-sonnet-4-6",
  mcp: {
    context7: true,
    exa: true,
    searchProvider: "exa",
  },
};

// ============================================================================
// Config Loading Functions
// ============================================================================

/**
 * Load and parse a JSON config file
 */
function loadConfigFile(path: string): GoopSpecConfig | null {
  try {
    if (!existsSync(path)) {
      return null;
    }

    const content = readFileSync(path, "utf-8");
    const rawConfig = JSON.parse(content);
    
    // Validate with Zod
    const result = GoopSpecConfigSchema.safeParse(rawConfig);
    
    if (!result.success) {
      logError(`Config validation error in ${path}:`, result.error.issues);
      return null;
    }

    log(`Loaded config from ${path}`);
    return result.data as GoopSpecConfig;
  } catch (error) {
    logError(`Failed to load config from ${path}:`, error);
    return null;
  }
}

/**
 * Deep merge two config objects
 * Override takes precedence, but nested objects are merged
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepMerge<T extends object>(base: T, override: Partial<T>): T {
  const result = { ...base } as T;
  const baseRecord = base as Record<string, unknown>;
  const overrideRecord = override as Record<string, unknown>;

  for (const [key, value] of Object.entries(overrideRecord)) {
    if (value === undefined) {
      continue;
    }

    const baseValue = baseRecord[key];

    if (Array.isArray(value)) {
      (result as Record<string, unknown>)[key] = value.slice();
      continue;
    }

    if (isPlainObject(value) && isPlainObject(baseValue)) {
      (result as Record<string, unknown>)[key] = deepMerge(
        baseValue as object,
        value as object
      );
      continue;
    }

    (result as Record<string, unknown>)[key] = value as unknown;
  }

  return result;
}

function mergeConfigs(base: GoopSpecConfig, override: GoopSpecConfig): GoopSpecConfig {
  return deepMerge(base, override) as GoopSpecConfig;
}

function collectOverriddenKeys(
  base: Record<string, unknown>,
  override: Record<string, unknown>,
  prefix = ""
): string[] {
  const keys: string[] = [];

  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) {
      continue;
    }

    const fullKey = prefix ? `${prefix}.${key}` : key;
    const baseValue = base[key];

    if (isPlainObject(value) && isPlainObject(baseValue)) {
      keys.push(...collectOverriddenKeys(baseValue, value, fullKey));
      continue;
    }

    keys.push(fullKey);
  }

  return keys;
}

/**
 * Load plugin configuration
 * 
 * Loading order (later overrides earlier):
 * 1. Default config
 * 2. Global config (~/.config/opencode/goopspec.json)
 * 3. Project config (.goopspec/config.json)
 * 
 * @param projectDir - The project directory
 */
export function loadPluginConfig(projectDir: string): GoopSpecConfig {
  let config = { ...DEFAULT_CONFIG };

  // Load global config
  const globalPath = getGlobalConfigPath();
  const hasGlobalConfig = existsSync(globalPath);
  log(`Loading global config from ${globalPath} (${hasGlobalConfig ? "found" : "not found"})`);
  const globalConfig = hasGlobalConfig ? loadConfigFile(globalPath) : null;
  if (globalConfig) {
    const overriddenKeys = collectOverriddenKeys(
      config as Record<string, unknown>,
      globalConfig as Record<string, unknown>
    );
    for (const overriddenKey of overriddenKeys) {
      log(`Merged: ${overriddenKey} overridden by global config`);
    }
    config = mergeConfigs(config, globalConfig);
  }

  // Load project config
  const projectPath = joinPath(getProjectGoopspecDir(projectDir), "config.json");
  const hasProjectConfig = existsSync(projectPath);
  log(`Loading project config from ${projectPath} (${hasProjectConfig ? "found" : "not found"})`);
  const projectConfig = hasProjectConfig ? loadConfigFile(projectPath) : null;
  if (projectConfig) {
    const overriddenKeys = collectOverriddenKeys(
      config as Record<string, unknown>,
      projectConfig as Record<string, unknown>
    );
    for (const overriddenKey of overriddenKeys) {
      log(`Merged: ${overriddenKey} overridden by project config`);
    }
    config = mergeConfigs(config, projectConfig);
  }

  log("Final merged config summary", {
    loadedSources: {
      global: hasGlobalConfig,
      project: hasProjectConfig,
    },
    topLevelKeyCount: Object.keys(config).length,
    agentCount: Object.keys(config.agents ?? {}).length,
    hasOrchestratorConfig: Boolean(config.orchestrator),
    hasMemoryConfig: Boolean(config.memory),
    defaultModel: config.defaultModel,
    enforcement: config.enforcement,
  });
  log("Final merged config", { config });
  return config;
}

function getSuggestedAgentName(unknownKey: string, knownNames: string[]): string | null {
  const normalizedUnknown = unknownKey.toLowerCase();

  const prefixMatch = knownNames.find((knownName) =>
    knownName.toLowerCase().startsWith(normalizedUnknown)
  );
  if (prefixMatch) {
    return prefixMatch;
  }

  const substringMatch = knownNames.find((knownName) => {
    const normalizedKnown = knownName.toLowerCase();
    return normalizedKnown.includes(normalizedUnknown) || normalizedUnknown.includes(normalizedKnown);
  });

  return substringMatch ?? null;
}

export function validateAgentKeys(
  config: GoopSpecConfig,
  knownNames: string[],
  warn: (message: string) => void = logError
): void {
  if (!config.agents) {
    return;
  }

  const knownAgentNames = new Set(knownNames);

  for (const agentKey of Object.keys(config.agents)) {
    if (knownAgentNames.has(agentKey)) {
      continue;
    }

    const suggestion = getSuggestedAgentName(agentKey, knownNames);
    if (suggestion) {
      warn(`Config warning: unknown agent key '${agentKey}' - did you mean '${suggestion}'?`);
      continue;
    }

    warn(`Config warning: unknown agent key '${agentKey}'`);
  }
}

/**
 * Validate a config object
 */
export function validateConfig(config: unknown): { valid: boolean; errors?: string[] } {
  const result = GoopSpecConfigSchema.safeParse(config);
  
  if (result.success) {
    return { valid: true };
  }

  return {
    valid: false,
    errors: result.error.issues.map(i => `${i.path.join(".")}: ${i.message}`),
  };
}

/**
 * Get the default config
 */
export function getDefaultConfig(): GoopSpecConfig {
  return { ...DEFAULT_CONFIG };
}
