/**
 * GoopSpec Setup Feature — Simplified for 1.0.0 (plugin-only).
 *
 * Provides project detection, .goopspec initialisation, config management,
 * per-role model routing, verification, status, and reset.
 *
 * Dropped from 0.2.x: daemon setup, web panel setup, memory-worker setup,
 * MCP installation, platform/dependency detection, distillation config.
 * Memory is now in-process via bun:sqlite — no external worker.
 *
 * @module features/setup
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

import { AGENT_ROLES, DEFAULT_THINKING_LEVELS, GOOPSPEC_DIR } from "../../core/constants.js";
import type { AgentRole } from "../../core/constants.js";
import type { StateManager } from "../../core/types.js";
import { log, logError } from "../../shared/logger.js";
import { getDbPath, getGlobalConfigPath, getProjectGoopspecJsonPath } from "../../shared/paths.js";
import { GoopSpecDB } from "../db/index.js";
import { CURRENT_SCHEMA_VERSION } from "../db/migrations.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CONFIG_FILENAME = "config.json";

export const ENFORCEMENT_MODES = ["assist", "warn", "strict"] as const;
export type EnforcementMode = (typeof ENFORCEMENT_MODES)[number];

/** Default model recommendations per agent role (MH16). */
export const DEFAULT_MODEL_MAP: Record<AgentRole, string> = {
  orchestrator: "anthropic/claude-opus-4-6",
  "executor-low": "anthropic/claude-sonnet-4-6",
  "executor-medium": "anthropic/claude-sonnet-4-6",
  "executor-high": "anthropic/claude-opus-4-6",
  "executor-frontend-low": "anthropic/claude-sonnet-4-6",
  "executor-frontend-high": "anthropic/claude-opus-4-6",
  planner: "anthropic/claude-opus-4-6",
  verifier: "anthropic/claude-sonnet-4-6",
  researcher: "anthropic/claude-sonnet-4-6",
  explorer: "anthropic/claude-sonnet-4-6",
  debugger: "anthropic/claude-sonnet-4-6",
  tester: "anthropic/claude-sonnet-4-6",
  writer: "anthropic/claude-sonnet-4-6",
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export const THINKING_LEVELS = ["none", "low", "medium", "high", "xhigh"] as const;
export type ThinkingLevel = (typeof THINKING_LEVELS)[number];

/** Persisted project-level config stored in `.goopspec/config.json`. */
export interface GoopConfig {
  projectName?: string;
  defaultModel?: string;
  enforcement?: EnforcementMode;
  adlEnabled?: boolean;
  agentModels?: Partial<Record<string, string>>;
  agentThinkingLevels?: Partial<Record<string, ThinkingLevel>>;
  agentThinkingBudgets?: Partial<Record<string, number>>;
  memoryEnabled?: boolean;
  gitignoreGoopspec?: boolean;
}

/** Result of environment detection. */
export interface DetectResult {
  hasGoopspecDir: boolean;
  hasStateFile: boolean;
  hasConfigFile: boolean;
  hasPackageJson: boolean;
  projectName: string | undefined;
  detectedStack: string[];
  goopspecDir: string;
}

/** Result of a verification check. */
export interface VerifyCheck {
  name: string;
  passed: boolean;
  message: string;
  fix?: string;
}

export interface VerifyResult {
  success: boolean;
  checks: VerifyCheck[];
}

export interface ResetResult {
  success: boolean;
  reset: string[];
  preserved: string[];
  errors: string[];
}

export interface InitResult {
  success: boolean;
  created: string[];
  errors: string[];
}

export interface SetupStatusResult {
  initialized: boolean;
  projectName: string | undefined;
  config: GoopConfig | null;
  stateVersion: number | null;
  activeWorkflow: string | null;
  phase: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function goopDir(projectDir: string): string {
  return join(projectDir, GOOPSPEC_DIR);
}

function configPath(projectDir: string): string {
  return join(goopDir(projectDir), CONFIG_FILENAME);
}

function statePath(projectDir: string): string {
  return join(goopDir(projectDir), "state.json");
}

function safeReadJson<T>(filePath: string): T | null {
  try {
    if (!existsSync(filePath)) return null;
    return JSON.parse(readFileSync(filePath, "utf-8")) as T;
  } catch {
    return null;
  }
}

function safeWriteJson(filePath: string, data: unknown): void {
  const dir = join(filePath, "..");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

// ---------------------------------------------------------------------------
// Detect
// ---------------------------------------------------------------------------

/**
 * Inspect the project directory and report what exists.
 * Detects package.json stack hints (runtime, framework, test runner).
 */
export function detect(projectDir: string): DetectResult {
  const gd = goopDir(projectDir);
  const pkgPath = join(projectDir, "package.json");
  const hasPackageJson = existsSync(pkgPath);

  let projectName: string | undefined;
  const detectedStack: string[] = [];

  if (hasPackageJson) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as Record<string, unknown>;
      projectName = typeof pkg.name === "string" ? pkg.name : undefined;

      const allDeps = {
        ...(typeof pkg.dependencies === "object" && pkg.dependencies !== null
          ? (pkg.dependencies as Record<string, string>)
          : {}),
        ...(typeof pkg.devDependencies === "object" && pkg.devDependencies !== null
          ? (pkg.devDependencies as Record<string, string>)
          : {}),
      };

      // Runtime
      if (
        allDeps.bun ||
        existsSync(join(projectDir, "bun.lockb")) ||
        existsSync(join(projectDir, "bun.lock"))
      ) {
        detectedStack.push("bun");
      } else {
        detectedStack.push("node");
      }

      // Language
      if (allDeps.typescript || existsSync(join(projectDir, "tsconfig.json"))) {
        detectedStack.push("typescript");
      }

      // Frameworks
      const frameworkHints: [string, string][] = [
        ["next", "Next.js"],
        ["react", "React"],
        ["vue", "Vue"],
        ["svelte", "Svelte"],
        ["express", "Express"],
        ["hono", "Hono"],
        ["astro", "Astro"],
      ];
      for (const [dep, label] of frameworkHints) {
        if (allDeps[dep]) detectedStack.push(label);
      }

      // Test runners
      const testHints: [string, string][] = [
        ["vitest", "Vitest"],
        ["jest", "Jest"],
      ];
      for (const [dep, label] of testHints) {
        if (allDeps[dep]) detectedStack.push(label);
      }
    } catch {
      // Ignore parse errors
    }
  }

  if (!projectName) {
    projectName = basename(projectDir);
  }

  return {
    hasGoopspecDir: existsSync(gd),
    hasStateFile: existsSync(getDbPath(projectDir)),
    hasConfigFile: existsSync(configPath(projectDir)),
    hasPackageJson,
    projectName,
    detectedStack,
    goopspecDir: gd,
  };
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

/**
 * Initialise `.goopspec/` directory structure, state.json, and config.json.
 *
 * Uses the provided StateManager to create state (so it goes through the
 * standard atomic-write path). Config is written directly.
 */
export function init(
  projectDir: string,
  stateManager: StateManager,
  opts: {
    projectName?: string;
    defaultModel?: string;
    agentModels?: Record<string, string>;
    memoryEnabled?: boolean;
    gitignoreGoopspec?: boolean;
  } = {},
): InitResult {
  const result: InitResult = { success: true, created: [], errors: [] };
  const gd = goopDir(projectDir);

  try {
    // Create directory structure
    const dirs = [gd, join(gd, "default"), join(gd, "checkpoints")];
    for (const dir of dirs) {
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
        result.created.push(dir);
      }
    }

    // Initialise state via StateManager
    const state = stateManager.getState();
    if (!state.workflows.default) {
      stateManager.createWorkflow("default");
    }

    // Ensure goopspec.db exists on disk (verify/getStatus read it directly)
    const dbPath = getDbPath(projectDir);
    if (!existsSync(dbPath)) {
      const db = new GoopSpecDB(dbPath);
      db.upsertWorkflow("_meta", { activeWorkflowId: state.activeWorkflowId });
      for (const [id, wf] of Object.entries(state.workflows)) {
        db.upsertWorkflow(id, wf);
      }
      db.close();
    }
    result.created.push(dbPath);

    // Write config
    const detected = detect(projectDir);
    const config: GoopConfig = {
      projectName: opts.projectName ?? detected.projectName,
      defaultModel: opts.defaultModel,
      agentModels: opts.agentModels,
      memoryEnabled: opts.memoryEnabled ?? true,
      gitignoreGoopspec: opts.gitignoreGoopspec,
    };
    safeWriteJson(configPath(projectDir), config);
    result.created.push(configPath(projectDir));

    // Optionally add .goopspec/ to .gitignore
    if (opts.gitignoreGoopspec) {
      ensureGitignoreEntry(projectDir);
    }
  } catch (error: unknown) {
    result.success = false;
    result.errors.push(error instanceof Error ? error.message : String(error));
  }

  return result;
}

// ---------------------------------------------------------------------------
// Config read/write
// ---------------------------------------------------------------------------

/** Read the project config, or null if it doesn't exist / is invalid. */
export function readConfig(projectDir: string): GoopConfig | null {
  return safeReadJson<GoopConfig>(configPath(projectDir));
}

/** Write (overwrite) the project config. */
export function writeConfig(projectDir: string, config: GoopConfig): void {
  safeWriteJson(configPath(projectDir), config);
}

/** Merge partial updates into the existing config. */
export function updateConfig(projectDir: string, updates: Partial<GoopConfig>): GoopConfig {
  const existing = readConfig(projectDir) ?? {};
  const merged: GoopConfig = {
    ...existing,
    ...updates,
    // Deep-merge agentModels
    agentModels:
      updates.agentModels !== undefined
        ? { ...(existing.agentModels ?? {}), ...updates.agentModels }
        : existing.agentModels,
  };
  writeConfig(projectDir, merged);
  return merged;
}

// ---------------------------------------------------------------------------
// Config normalization and multi-source loading
// ---------------------------------------------------------------------------

/**
 * Normalize a raw config object to GoopConfig, handling both the 1.0.0 format
 * (agentModels: bare role → model string) and the legacy 0.2.x format
 * (agents: goop-prefixed → { model, temperature }).
 *
 * If both `agents` and `agentModels` are present, `agentModels` wins.
 */
export function normalizeConfig(raw: Record<string, unknown>): GoopConfig {
  const config: GoopConfig = {};

  if (typeof raw.projectName === "string") config.projectName = raw.projectName;
  if (typeof raw.defaultModel === "string") config.defaultModel = raw.defaultModel;
  if (
    typeof raw.enforcement === "string" &&
    (ENFORCEMENT_MODES as readonly string[]).includes(raw.enforcement)
  ) {
    config.enforcement = raw.enforcement as EnforcementMode;
  }
  if (typeof raw.adlEnabled === "boolean") config.adlEnabled = raw.adlEnabled;
  if (typeof raw.memoryEnabled === "boolean") config.memoryEnabled = raw.memoryEnabled;
  if (typeof raw.gitignoreGoopspec === "boolean") config.gitignoreGoopspec = raw.gitignoreGoopspec;

  // New format: agentThinkingLevels (bare role → canonical thinking level)
  if (raw.agentThinkingLevels && typeof raw.agentThinkingLevels === "object") {
    config.agentThinkingLevels = {};
    for (const [role, label] of Object.entries(
      raw.agentThinkingLevels as Record<string, unknown>,
    )) {
      if (typeof label !== "string") {
        logError(`normalizeConfig: agentThinkingLevels["${role}"] must be a string — skipping.`);
        continue;
      }

      const normalized = label.trim().toLowerCase();
      if ((THINKING_LEVELS as readonly string[]).includes(normalized)) {
        config.agentThinkingLevels[role] = normalized as ThinkingLevel;
      } else {
        logError(
          `normalizeConfig: unknown thinking level "${label}" for role "${role}" — skipping. Valid levels: ${THINKING_LEVELS.join(", ")}.`,
        );
      }
    }
  }

  // New format: agentModels (bare role → model string)
  if (raw.agentModels && typeof raw.agentModels === "object") {
    config.agentModels = {};
    for (const [role, model] of Object.entries(raw.agentModels as Record<string, unknown>)) {
      if (typeof model === "string") {
        config.agentModels[role] = model;
      }
    }
  }

  // Old format: agents (goop-prefixed → { model, temperature }) — only if agentModels absent
  if (raw.agents && typeof raw.agents === "object" && !config.agentModels) {
    config.agentModels = {};
    for (const [agentName, agentConfig] of Object.entries(raw.agents as Record<string, unknown>)) {
      if (agentConfig && typeof agentConfig === "object" && "model" in agentConfig) {
        const role = agentName.replace(/^goop-/, "");
        const model = (agentConfig as { model: string }).model;

        // Expand partial tier names to valid AGENT_ROLES
        const partialExpansions: Record<string, string[]> = {
          "executor-frontend": ["executor-frontend-high", "executor-frontend-low"],
          executor: ["executor-medium"],
        };
        const expanded = partialExpansions[role] ?? [role];

        for (const r of expanded) {
          if ((AGENT_ROLES as readonly string[]).includes(r)) {
            config.agentModels[r] = model;
          } else {
            logError(
              `normalizeConfig: unknown agent role "${r}" (from "${agentName}") — skipping. Valid roles: ${AGENT_ROLES.join(", ")}`,
            );
          }
        }
      }
    }
  }

  // Old format: orchestrator.model → agentModels.orchestrator
  if (raw.orchestrator && typeof raw.orchestrator === "object") {
    const orch = raw.orchestrator as Record<string, unknown>;
    if (typeof orch.model === "string") {
      if (!config.agentModels) config.agentModels = {};
      if (!config.agentModels.orchestrator) {
        config.agentModels.orchestrator = orch.model;
      }
    }
    if (typeof orch.thinkingBudget === "number") {
      if (!config.agentThinkingBudgets) config.agentThinkingBudgets = {};
      config.agentThinkingBudgets.orchestrator = orch.thinkingBudget;
    }
  }

  return config;
}

/**
 * Load and merge config from all three sources (lowest → highest priority):
 *   1. Global  ~/.config/opencode/goopspec.json
 *   2. Internal .goopspec/config.json
 *   3. Project  goopspec.json (highest priority)
 *
 * Each source is normalized before merging. Invalid/missing files are skipped.
 */
export function loadMergedConfig(projectDir: string): GoopConfig {
  const sources: string[] = [
    getGlobalConfigPath(),
    configPath(projectDir),
    getProjectGoopspecJsonPath(projectDir),
  ];

  let merged: GoopConfig = {};

  for (const filePath of sources) {
    try {
      if (!existsSync(filePath)) continue;
      const raw = JSON.parse(readFileSync(filePath, "utf-8")) as Record<string, unknown>;
      const normalized = normalizeConfig(raw);

      merged = {
        ...merged,
        ...normalized,
        agentModels:
          normalized.agentModels !== undefined
            ? { ...(merged.agentModels ?? {}), ...normalized.agentModels }
            : merged.agentModels,
        agentThinkingLevels:
          normalized.agentThinkingLevels !== undefined
            ? { ...(merged.agentThinkingLevels ?? {}), ...normalized.agentThinkingLevels }
            : merged.agentThinkingLevels,
        agentThinkingBudgets:
          normalized.agentThinkingBudgets !== undefined
            ? { ...(merged.agentThinkingBudgets ?? {}), ...normalized.agentThinkingBudgets }
            : merged.agentThinkingBudgets,
      };
    } catch {
      log(`loadMergedConfig: skipping unreadable file ${filePath}`);
    }
  }

  return merged;
}

// ---------------------------------------------------------------------------
// Models (MH16 — per-role model routing)
// ---------------------------------------------------------------------------

/**
 * Return the effective model map: defaults merged with user overrides from all config sources.
 */
export function getEffectiveModelMap(projectDir: string): Record<string, string> {
  const config = loadMergedConfig(projectDir);
  const base: Record<string, string> = { ...DEFAULT_MODEL_MAP };

  if (config?.defaultModel) {
    for (const role of AGENT_ROLES) {
      base[role] = config.defaultModel;
    }
  }

  if (config?.agentModels) {
    for (const [role, model] of Object.entries(config.agentModels)) {
      if (model) base[role] = model;
    }
  }

  return base;
}

/**
 * Return the effective thinking-level map: built-in role defaults merged with
 * user overrides from all config sources. Values are plain canonical labels.
 */
export function getEffectiveThinkingLevels(projectDir: string): Record<AgentRole, ThinkingLevel> {
  const config = loadMergedConfig(projectDir);
  const base: Record<AgentRole, ThinkingLevel> = { ...DEFAULT_THINKING_LEVELS };

  if (config?.agentThinkingLevels) {
    for (const [role, level] of Object.entries(config.agentThinkingLevels)) {
      if (
        level &&
        (AGENT_ROLES as readonly string[]).includes(role) &&
        (THINKING_LEVELS as readonly string[]).includes(level)
      ) {
        base[role as AgentRole] = level;
      }
    }
  }

  return base;
}

/**
 * Format model configuration for display.
 */
export function formatModelInfo(projectDir: string): string {
  const effective = getEffectiveModelMap(projectDir);
  const config = readConfig(projectDir);
  const lines: string[] = [
    "# Agent Model Configuration",
    "",
    "Per-role model routing allows cost/quality optimisation across agent tiers.",
    "",
    "## Current Configuration",
    "",
    "| Agent Role | Model | Source |",
    "|------------|-------|--------|",
  ];

  for (const role of AGENT_ROLES) {
    const model = effective[role] ?? "unknown";
    const isOverride = config?.agentModels?.[role] != null;
    const isDefault = config?.defaultModel != null && !isOverride;
    const source = isOverride ? "config override" : isDefault ? "default model" : "built-in";
    lines.push(`| ${role} | \`${model}\` | ${source} |`);
  }

  lines.push("");
  lines.push("## Usage");
  lines.push("");
  lines.push("Set per-role models via `goop_setup`:");
  lines.push("```");
  lines.push('goop_setup(action: "models", agentModels: {');
  lines.push('  "executor-low": "anthropic/claude-sonnet-4-6",');
  lines.push('  "executor-high": "anthropic/claude-opus-4-6"');
  lines.push("})");
  lines.push("```");
  lines.push("");
  lines.push("Or set a blanket default:");
  lines.push("```");
  lines.push('goop_setup(action: "models", defaultModel: "anthropic/claude-sonnet-4-6")');
  lines.push("```");

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Verify
// ---------------------------------------------------------------------------

/** Run health checks on the setup. */
export function verify(projectDir: string): VerifyResult {
  const checks: VerifyCheck[] = [];
  const gd = goopDir(projectDir);

  // 1. Directory
  const hasDir = existsSync(gd);
  checks.push({
    name: "Directory Structure",
    passed: hasDir,
    message: hasDir ? ".goopspec/ exists" : ".goopspec/ not found",
    fix: hasDir ? undefined : 'Run goop_setup(action: "init")',
  });

  // 2. State database
  const dbPath = getDbPath(projectDir);
  const hasDb = existsSync(dbPath);
  checks.push({
    name: "State Database",
    passed: hasDb,
    message: hasDb ? "goopspec.db exists" : "goopspec.db not found",
    fix: hasDb ? undefined : 'Run goop_setup(action: "init")',
  });

  // 3. State version
  if (hasDb) {
    let schemaVersion: number | null = null;
    try {
      const db = new GoopSpecDB(dbPath);
      schemaVersion = db.getSchemaVersion();
      db.close();
    } catch {
      // DB unreadable — version stays null
    }
    const correctVersion = schemaVersion === CURRENT_SCHEMA_VERSION;
    checks.push({
      name: "State Version",
      passed: correctVersion,
      message: correctVersion
        ? `v${CURRENT_SCHEMA_VERSION} (current)`
        : `Expected v${CURRENT_SCHEMA_VERSION}, got v${schemaVersion ?? "unknown"}`,
      fix: correctVersion ? undefined : 'Run goop_setup(action: "reset") to recreate',
    });
  }

  // 4. Config file
  const hasConfig = existsSync(configPath(projectDir));
  checks.push({
    name: "Config File",
    passed: hasConfig,
    message: hasConfig ? "config.json exists" : "config.json not found",
    fix: hasConfig ? undefined : 'Run goop_setup(action: "init")',
  });

  // 5. Config validity
  if (hasConfig) {
    const config = safeReadJson<GoopConfig>(configPath(projectDir));
    const valid = config !== null && typeof config === "object";
    checks.push({
      name: "Config Validity",
      passed: valid,
      message: valid ? "config.json is valid JSON" : "config.json is invalid",
      fix: valid ? undefined : 'Run goop_setup(action: "reset") to recreate',
    });
  }

  // 6. Memory enabled
  const config = readConfig(projectDir);
  const memEnabled = config?.memoryEnabled !== false;
  checks.push({
    name: "Memory System",
    passed: memEnabled,
    message: memEnabled ? "Memory enabled (in-process bun:sqlite)" : "Memory disabled in config",
    fix: memEnabled ? undefined : 'Set memoryEnabled: true in goop_setup(action: "init")',
  });

  const allPassed = checks.every((c) => c.passed);
  return { success: allPassed, checks };
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

/** Get a summary of the current setup. */
export function getStatus(projectDir: string): SetupStatusResult {
  const config = readConfig(projectDir);
  const dbPath = getDbPath(projectDir);
  const dbInfo = readStateFromDb(dbPath);

  return {
    initialized: existsSync(goopDir(projectDir)) && existsSync(dbPath),
    projectName: config?.projectName ?? dbInfo.activeWorkflow ?? undefined,
    config,
    stateVersion: dbInfo.stateVersion,
    activeWorkflow: dbInfo.activeWorkflow,
    phase: dbInfo.phase,
  };
}

/** Read state summary from GoopSpecDB without requiring a full StateManager. */
function readStateFromDb(dbPath: string): {
  stateVersion: number | null;
  activeWorkflow: string | null;
  phase: string | null;
} {
  if (!existsSync(dbPath)) {
    return { stateVersion: null, activeWorkflow: null, phase: null };
  }

  let db: GoopSpecDB | null = null;
  try {
    db = new GoopSpecDB(dbPath);
    const stateVersion = db.getSchemaVersion();

    // Active workflow ID is stored in a special _meta row
    const metaRow = db.getWorkflow("_meta");
    const meta = metaRow ? (JSON.parse(metaRow.state) as { activeWorkflowId?: string }) : null;
    const activeWorkflow = meta?.activeWorkflowId ?? null;

    // Phase of the active workflow
    let phase: string | null = null;
    if (activeWorkflow) {
      const wfRow = db.getWorkflow(activeWorkflow);
      if (wfRow) {
        const wfState = JSON.parse(wfRow.state) as { phase?: string };
        phase = wfState.phase ?? null;
      }
    }

    return { stateVersion, activeWorkflow, phase };
  } catch {
    return { stateVersion: null, activeWorkflow: null, phase: null };
  } finally {
    db?.close();
  }
}

// ---------------------------------------------------------------------------
// Reset
// ---------------------------------------------------------------------------

/** Reset config and optionally state/data. */
export function reset(
  projectDir: string,
  opts: { preserveData?: boolean; confirmed?: boolean } = {},
): ResetResult {
  const result: ResetResult = { success: true, reset: [], preserved: [], errors: [] };

  if (!opts.confirmed) {
    result.success = false;
    result.errors.push("Reset requires confirmed: true");
    return result;
  }

  const gd = goopDir(projectDir);

  try {
    // Always reset config
    if (existsSync(configPath(projectDir))) {
      const freshConfig: GoopConfig = { memoryEnabled: true };
      safeWriteJson(configPath(projectDir), freshConfig);
      result.reset.push(configPath(projectDir));
    }

    const dbFile = getDbPath(projectDir);

    if (opts.preserveData !== false) {
      // Preserve state and data, only reset config
      if (existsSync(dbFile)) {
        result.preserved.push(dbFile);
      }
      const checkpointsDir = join(gd, "checkpoints");
      if (existsSync(checkpointsDir)) {
        result.preserved.push(checkpointsDir);
      }
    } else {
      // Full destructive reset
      if (existsSync(dbFile)) {
        rmSync(dbFile);
        result.reset.push(dbFile);
      }
      // Also clean up legacy state.json if present
      if (existsSync(statePath(projectDir))) {
        rmSync(statePath(projectDir));
      }
      const checkpointsDir = join(gd, "checkpoints");
      if (existsSync(checkpointsDir)) {
        rmSync(checkpointsDir, { recursive: true, force: true });
        result.reset.push(checkpointsDir);
      }
    }
  } catch (error: unknown) {
    result.success = false;
    result.errors.push(error instanceof Error ? error.message : String(error));
  }

  return result;
}

// ---------------------------------------------------------------------------
// Gitignore helper
// ---------------------------------------------------------------------------

/** Ensure `.goopspec/` is in the project's `.gitignore`. */
export function ensureGitignoreEntry(projectDir: string): void {
  const gitignorePath = join(projectDir, ".gitignore");
  const entry = ".goopspec/";

  if (!existsSync(gitignorePath)) {
    writeFileSync(gitignorePath, `${entry}\n`, "utf-8");
    return;
  }

  const content = readFileSync(gitignorePath, "utf-8");
  const alreadyPresent = content
    .split(/\r?\n/)
    .some((line) => line.trim().replace(/\/+$/, "") === ".goopspec");

  if (alreadyPresent) return;

  const separator = content.length > 0 && !content.endsWith("\n") ? "\n" : "";
  writeFileSync(gitignorePath, `${content}${separator}${entry}\n`, "utf-8");
}
