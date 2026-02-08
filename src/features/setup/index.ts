/**
 * GoopSpec Setup Module
 * Core setup logic: detect environment, plan changes, apply configuration
 * 
 * @module features/setup
 */

import { existsSync, readFileSync } from "fs";
import { getGlobalConfigPath, getProjectGoopspecDir, joinPath } from "../../shared/paths.js";
import { safeDirname } from "../../shared/platform.js";
import { hasOpenCodeConfig, getOpenCodeConfigPath, readOpenCodeConfig, getExistingMcps } from "../../core/opencode-config.js";
import { DEFAULT_CONFIG, validateConfig } from "../../core/config.js";
import { installMcps } from "./mcp-installer.js";
import { log, logError } from "../../shared/logger.js";
import type { 
  SetupEnvironment, 
  SetupInput, 
  SetupPlan, 
  SetupAction, 
  SetupResult,
  ConfigWrite,
  VerificationResult,
  VerificationCheck,
  InitResult,
  ResetOptions,
  ResetResult,
  SetupStatus,
  MemorySetupResult,
  MemorySetupInput,
} from "./types.js";
import { MCP_PRESETS } from "./types.js";
import { writeFileSync, mkdirSync, rmSync } from "fs";
import { initializeGoopspec } from "../state-manager/manager.js";
import { detectAllDependencies } from "./dependencies.js";
import { installSqliteVec, installLocalEmbeddings } from "./installer.js";
import { getDefaultFeatures, isFeatureAvailable } from "./feature-catalog.js";
import { createDistillationConfig, getDistillationModel } from "./distillation-config.js";

// ============================================================================
// Environment Detection
// ============================================================================

/**
 * Detect current setup environment
 * Checks for existing configs, MCPs, and directory structure
 */
export async function detectEnvironment(projectDir: string): Promise<SetupEnvironment> {
  const globalConfigPath = getGlobalConfigPath();
  const goopspecDir = getProjectGoopspecDir(projectDir);
  const projectConfigPath = joinPath(goopspecDir, "config.json");
  const opencodeConfigPath = getOpenCodeConfigPath();
  const statePath = joinPath(goopspecDir, "state.json");
  const adlPath = joinPath(goopspecDir, "ADL.md");
  const memoryDir = joinPath(goopspecDir, "memory");
  
  const hasGlobal = existsSync(globalConfigPath);
  const hasProject = existsSync(projectConfigPath);
  const hasOpenCode = hasOpenCodeConfig();
  const hasGoopspecDir = existsSync(goopspecDir);
  const hasStateFile = existsSync(statePath);
  const hasADLFile = existsSync(adlPath);
  const hasMemoryDir = existsSync(memoryDir);
  
  let existingMcps: string[] = [];
  if (hasOpenCode) {
    try {
      const config = readOpenCodeConfig();
      existingMcps = getExistingMcps(config);
    } catch {
      // Ignore errors reading config
    }
  }
  
  log("Detected environment", {
    hasGlobal,
    hasProject,
    hasOpenCode,
    hasGoopspecDir,
    hasStateFile,
    hasADLFile,
    hasMemoryDir,
    existingMcps,
  });
  
  return {
    hasOpenCodeConfig: hasOpenCode,
    hasGlobalGoopSpecConfig: hasGlobal,
    hasProjectGoopSpecConfig: hasProject,
    hasGoopspecDir,
    hasStateFile,
    hasADLFile,
    hasMemoryDir,
    existingMcps,
    opencodeConfigPath,
    globalConfigPath,
    projectConfigPath,
    goopspecDir,
  };
}

// ============================================================================
// Planning Functions
// ============================================================================

/**
 * Plan setup actions based on user input
 * Returns a plan describing what will be changed
 */
export async function planSetup(input: SetupInput, env: SetupEnvironment): Promise<SetupPlan> {
  const actions: SetupAction[] = [];
  const configsToWrite: ConfigWrite[] = [];
  const dirsToCreate: string[] = [];
  const searchProvider = input.searchProvider ?? "exa";
  
  // Determine which MCPs to install
  const mcpsToInstall: string[] = [];
  if (input.mcpPreset !== "none") {
    const presetMcps = MCP_PRESETS[input.mcpPreset];
    for (const mcp of presetMcps) {
      if (!env.existingMcps.includes(mcp)) {
        mcpsToInstall.push(mcp);
      }
    }
  }
  
  // Plan global config write
  if (input.scope === "global" || input.scope === "both") {
    const globalConfig: Record<string, unknown> = {
      enforcement: DEFAULT_CONFIG.enforcement,
      adlEnabled: DEFAULT_CONFIG.adlEnabled,
      defaultModel: input.models.default ?? DEFAULT_CONFIG.defaultModel,
      orchestrator: {
        model: input.models.orchestrator ?? "anthropic/claude-opus-4-6",
        thinkingBudget: input.thinkingBudget ?? 32000,
        phaseGates: input.phaseGates ?? "ask",
        waveExecution: input.waveExecution ?? "sequential",
      },
      mcp: {
        ...DEFAULT_CONFIG.mcp,
        searchProvider,
      },
    };
    
    // Add MCP preset to config
    if (input.mcpPreset !== "none") {
      const presetMcps = MCP_PRESETS[input.mcpPreset];
      for (const mcp of presetMcps) {
        (globalConfig.mcp as Record<string, boolean>)[mcp] = true;
      }
    }
    
    // Add agent model overrides to global config
    if (input.agentModels && Object.keys(input.agentModels).length > 0) {
      globalConfig.agents = {};
      for (const [agentName, model] of Object.entries(input.agentModels)) {
        (globalConfig.agents as Record<string, { model: string }>)[agentName] = { model };
      }
    }
    
    // Add memory configuration to global config
    if (input.memory) {
      globalConfig.memory = {
        enabled: input.memory.enabled ?? true,
        workerPort: input.memory.workerPort ?? 37777,
        embeddings: input.memory.embeddings ?? { provider: "local" },
        privacy: input.memory.privacy ?? { enabled: true, retentionDays: 90 },
      };
    }
    
    actions.push({
      type: "write_config",
      target: env.globalConfigPath,
      changes: globalConfig,
      description: "Write global GoopSpec configuration",
    });
    
    configsToWrite.push({
      path: env.globalConfigPath,
      scope: "global",
      content: globalConfig,
    });
  }
  
  // Plan project config write
  if (input.scope === "project" || input.scope === "both") {
    const projectConfig: Record<string, unknown> = {
      projectName: input.projectName,
      orchestrator: {
        model: input.models.orchestrator ?? "anthropic/claude-opus-4-6",
        thinkingBudget: input.thinkingBudget ?? 32000,
        enableAsDefault: input.enableOrchestrator ?? false,
        phaseGates: input.phaseGates ?? "ask",
        waveExecution: input.waveExecution ?? "sequential",
      },
      mcp: {
        searchProvider,
      },
    };
    
    // Add agent model overrides to project config
    if (input.agentModels && Object.keys(input.agentModels).length > 0) {
      projectConfig.agents = {};
      for (const [agentName, model] of Object.entries(input.agentModels)) {
        (projectConfig.agents as Record<string, { model: string }>)[agentName] = { model };
      }
    }
    
    // Add memory configuration to project config if specified
    if (input.memory) {
      projectConfig.memory = {
        enabled: input.memory.enabled ?? true,
        workerPort: input.memory.workerPort ?? 37777,
        embeddings: input.memory.embeddings ?? { provider: "local" },
        privacy: input.memory.privacy ?? { enabled: true, retentionDays: 90 },
      };
    }
    
    actions.push({
      type: "write_config",
      target: env.projectConfigPath,
      changes: projectConfig,
      description: "Write project GoopSpec configuration",
    });
    
    configsToWrite.push({
      path: env.projectConfigPath,
      scope: "project",
      content: projectConfig,
    });
  }
  
  // Plan MCP installation
  if (mcpsToInstall.length > 0) {
    actions.push({
      type: "install_mcp",
      target: "OpenCode MCPs",
      changes: { mcps: mcpsToInstall },
      description: `Install ${mcpsToInstall.length} MCP(s): ${mcpsToInstall.join(", ")}`,
    });
  }
  
  // Build summary
  const summaryParts = [
    `GoopSpec will be configured for: ${input.scope}`,
    input.models.orchestrator && `Orchestrator model: ${input.models.orchestrator}`,
    input.mcpPreset !== "none" && `MCP preset: ${input.mcpPreset}`,
    `Search provider: ${searchProvider}`,
    input.enableOrchestrator && "GoopSpec will be set as default agent",
    input.memory?.enabled !== false && "Memory system: enabled",
    input.memory?.embeddings?.provider && `Embedding provider: ${input.memory.embeddings.provider}`,
  ];
  
  const summary = summaryParts.filter(Boolean).join("\n");
  
  return {
    actions,
    summary,
    mcpsToInstall,
    configsToWrite,
    dirsToCreate,
    memoryConfig: input.memory,
    projectName: input.projectName,
    quick: input.quick,
    searchProvider,
  };
}

/**
 * Plan initialization for a new project
 * This is a comprehensive plan that creates everything needed
 */
export async function planInit(
  _projectDir: string,
  input: SetupInput,
  env: SetupEnvironment
): Promise<SetupPlan> {
  // Start with the regular setup plan
  const basePlan = await planSetup(input, env);
  
  const dirsToCreate: string[] = [];
  const additionalActions: SetupAction[] = [];
  
  // Plan directory creation
  if (!env.hasGoopspecDir) {
    dirsToCreate.push(env.goopspecDir);
    additionalActions.push({
      type: "create_dir",
      target: env.goopspecDir,
      changes: {},
      description: "Create .goopspec directory",
    });
  }
  
  // Plan subdirectory creation
  const checkpointsDir = joinPath(env.goopspecDir, "checkpoints");
  const historyDir = joinPath(env.goopspecDir, "history");
  const memoryDir = joinPath(env.goopspecDir, "memory");
  
  if (!existsSync(checkpointsDir)) {
    dirsToCreate.push(checkpointsDir);
  }
  if (!existsSync(historyDir)) {
    dirsToCreate.push(historyDir);
  }
  if (input.memory?.enabled !== false && !existsSync(memoryDir)) {
    dirsToCreate.push(memoryDir);
    additionalActions.push({
      type: "init_memory",
      target: memoryDir,
      changes: { config: input.memory },
      description: "Initialize memory system directory",
    });
  }
  
  // Plan state initialization
  if (!env.hasStateFile) {
    additionalActions.push({
      type: "init_state",
      target: joinPath(env.goopspecDir, "state.json"),
      changes: { projectName: input.projectName },
      description: "Initialize workflow state",
    });
  }
  
  return {
    ...basePlan,
    actions: [...additionalActions, ...basePlan.actions],
    dirsToCreate,
    isInit: true,
    projectName: input.projectName,
  };
}

// ============================================================================
// Apply Functions
// ============================================================================

/**
 * Apply setup plan
 * Executes all planned actions
 */
export async function applySetup(plan: SetupPlan): Promise<SetupResult> {
  const result: SetupResult = {
    success: true,
    configsWritten: [],
    mcpsInstalled: [],
    errors: [],
    warnings: [],
  };
  
  try {
    // Create directories first
    if (plan.dirsToCreate) {
      for (const dir of plan.dirsToCreate) {
        try {
          if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
            log(`Created directory: ${dir}`);
          }
        } catch (error) {
          const errorMsg = `Failed to create directory ${dir}: ${error instanceof Error ? error.message : String(error)}`;
          result.errors.push(errorMsg);
          result.success = false;
        }
      }
    }
    
    // Write all config files
    for (const configWrite of plan.configsToWrite) {
      try {
        const dir = safeDirname(configWrite.path);
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true });
        }
        
        writeFileSync(configWrite.path, JSON.stringify(configWrite.content, null, 2));
        result.configsWritten.push(configWrite.path);
        log(`Wrote config: ${configWrite.path}`);
      } catch (error) {
        const errorMsg = `Failed to write ${configWrite.scope} config: ${error instanceof Error ? error.message : String(error)}`;
        result.errors.push(errorMsg);
        result.success = false;
      }
    }
    
    // Install MCPs
    if (plan.mcpsToInstall.length > 0) {
      try {
        const installed = await installMcps(plan.mcpsToInstall);
        result.mcpsInstalled = installed;
        log(`Installed ${installed.length} MCPs`);
      } catch (error) {
        const errorMsg = `MCP installation failed: ${error instanceof Error ? error.message : String(error)}`;
        result.errors.push(errorMsg);
        result.warnings.push("You may need to install MCPs manually");
        // Don't mark as failed - configs are still written
      }
    }
  } catch (error) {
    result.success = false;
    result.errors.push(error instanceof Error ? error.message : String(error));
  }
  
  return result;
}

/**
 * Setup memory system dependencies (vector search, embeddings, distillation)
 * 
 * When the user selects local embeddings, this function will attempt to install
 * the required native dependencies (sqlite-vec, onnxruntime-node, @huggingface/transformers).
 * 
 * @param memoryConfig - Memory configuration from user input
 * @param quick - If true, install silently without verbose output
 * @param agentModels - Agent model configuration for distillation
 * @param defaultModel - Default model for distillation
 * @param installDependencies - If true, attempt to install missing dependencies (default: true)
 */
export async function setupMemoryDependencies(
  memoryConfig: MemorySetupInput | undefined,
  quick: boolean = false,
  agentModels: Record<string, string> = {},
  defaultModel: string = "anthropic/claude-sonnet-4-5",
  installDependencies: boolean = true
): Promise<MemorySetupResult> {
  const result: MemorySetupResult = {
    enabled: memoryConfig?.enabled !== false,
    vectorSearch: { enabled: false },
    localEmbeddings: { enabled: false },
    distillation: { enabled: false },
    degradedFeatures: [],
  };
  
  if (!result.enabled) return result;
  
  // Detect current dependencies
  const deps = await detectAllDependencies();
  
  // Determine which features to set up
  const defaultFeatures = getDefaultFeatures();
  const featureIds = defaultFeatures.map(f => f.id);
  
  // Check what's already available
  for (const feature of defaultFeatures) {
    if (isFeatureAvailable(feature, deps)) {
      if (feature.id === "vector-search") result.vectorSearch.enabled = true;
      if (feature.id === "local-embeddings") result.localEmbeddings.enabled = true;
    }
  }
  
  // Determine if we should install dependencies
  // Install if: installDependencies is true AND local embeddings are requested
  const shouldInstall = installDependencies && 
    (memoryConfig?.embeddings?.provider === "local" || memoryConfig?.embeddings?.provider === undefined);
  
  if (shouldInstall) {
    const installOptions = { silent: quick };
    
    // Install sqlite-vec if needed for vector search
    if (featureIds.includes("vector-search") && !result.vectorSearch.enabled) {
      log("Installing sqlite-vec for vector search...");
      const installResult = await installSqliteVec(deps.platform, installOptions);
      result.vectorSearch.enabled = installResult.success;
      if (!installResult.success) {
        result.vectorSearch.error = installResult.error;
        result.degradedFeatures.push(...(installResult.degradedFeatures ?? []));
      } else {
        log("sqlite-vec installed successfully");
      }
    }
    
    // Install local embeddings dependencies if needed
    if (featureIds.includes("local-embeddings") && !result.localEmbeddings.enabled) {
      log("Installing local embedding dependencies (onnxruntime-node, @huggingface/transformers)...");
      const installResult = await installLocalEmbeddings(deps.platform, installOptions);
      if (installResult.allSucceeded) {
        result.localEmbeddings.enabled = true;
        log("Local embedding dependencies installed successfully");
      } else {
        result.localEmbeddings.error = installResult.results
          .filter(r => !r.success)
          .map(r => r.error)
          .join("; ");
        result.degradedFeatures.push(...installResult.degradedFeatures);
        log(`Some local embedding dependencies failed to install: ${result.localEmbeddings.error}`);
      }
    }
  } else if (!installDependencies) {
    // If we're not installing, report what's missing as degraded features
    if (featureIds.includes("vector-search") && !result.vectorSearch.enabled) {
      result.degradedFeatures.push(
        `Vector search not available - install: bun add sqlite-vec-${deps.platform.packageSuffix}`
      );
    }
    if (featureIds.includes("local-embeddings") && !result.localEmbeddings.enabled) {
      const missingPkgs: string[] = [];
      if (!deps.onnxRuntime.available) missingPkgs.push("onnxruntime-node");
      if (!deps.transformers.available) missingPkgs.push("@huggingface/transformers");
      if (missingPkgs.length > 0) {
        result.degradedFeatures.push(
          `Local embeddings not available - install: bun add ${missingPkgs.join(" ")}`
        );
      }
    }
  }
  
  // Configure distillation (always available if memory is enabled)
  if (featureIds.includes("distillation")) {
    const distillConfig = createDistillationConfig(true, "session-end");
    result.distillation.enabled = distillConfig.enabled;
    result.distillation.model = getDistillationModel(distillConfig, agentModels, defaultModel);
  }
  
  return result;
}

/**
 * Apply initialization plan
 * Executes init-specific actions in addition to regular setup
 */
export async function applyInit(
  projectDir: string,
  plan: SetupPlan
): Promise<InitResult> {
  const result: InitResult = {
    success: true,
    projectName: plan.projectName ?? "unnamed",
    created: [],
    configsWritten: [],
    mcpsInstalled: [],
    errors: [],
    warnings: [],
  };
  
  try {
    // Create directories first
    if (plan.dirsToCreate) {
      for (const dir of plan.dirsToCreate) {
        try {
          if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
            result.created.push(dir);
            log(`Created directory: ${dir}`);
          }
        } catch (error) {
          const errorMsg = `Failed to create directory ${dir}: ${error instanceof Error ? error.message : String(error)}`;
          result.errors.push(errorMsg);
          result.success = false;
        }
      }
    }
    
    // Initialize state and ADL using state manager
    try {
      await initializeGoopspec(projectDir, plan.projectName ?? "unnamed");
      result.created.push(joinPath(getProjectGoopspecDir(projectDir), "state.json"));
      result.created.push(joinPath(getProjectGoopspecDir(projectDir), "ADL.md"));
      log("Initialized GoopSpec state and ADL");
    } catch (error) {
      const errorMsg = `Failed to initialize state: ${error instanceof Error ? error.message : String(error)}`;
      result.errors.push(errorMsg);
      result.success = false;
    }
    
    // Apply regular setup
    const setupResult = await applySetup(plan);
    result.configsWritten = setupResult.configsWritten;
    result.mcpsInstalled = setupResult.mcpsInstalled;
    result.errors.push(...setupResult.errors);
    result.warnings.push(...setupResult.warnings);
    
    if (!setupResult.success) {
      result.success = false;
    }
    
    // Setup memory dependencies if memory is enabled
    if (plan.memoryConfig?.enabled !== false) {
      result.memorySetup = await setupMemoryDependencies(
        plan.memoryConfig,
        plan.quick ?? false,
        plan.agentModels ?? {},
        "anthropic/claude-sonnet-4-5"
      );
      
      // Add degraded features as warnings
      if (result.memorySetup.degradedFeatures.length > 0) {
        result.warnings.push(...result.memorySetup.degradedFeatures);
      }
    }
    
  } catch (error) {
    result.success = false;
    result.errors.push(error instanceof Error ? error.message : String(error));
  }
  
  return result;
}

// ============================================================================
// Verification Functions
// ============================================================================

/**
 * Verify GoopSpec setup is complete and working
 */
export async function verifySetup(projectDir: string): Promise<VerificationResult> {
  const checks: VerificationCheck[] = [];
  const env = await detectEnvironment(projectDir);
  
  // Check 1: Directory structure
  checks.push({
    name: "Directory Structure",
    passed: env.hasGoopspecDir,
    message: env.hasGoopspecDir 
      ? ".goopspec directory exists" 
      : ".goopspec directory not found",
    suggestedFix: env.hasGoopspecDir 
      ? undefined 
      : "Run goop_setup(action: 'init') to create the directory structure",
  });
  
  // Check 2: Configuration files
  const hasAnyConfig = env.hasGlobalGoopSpecConfig || env.hasProjectGoopSpecConfig;
  checks.push({
    name: "Configuration",
    passed: hasAnyConfig,
    message: hasAnyConfig 
      ? `Config found: ${env.hasGlobalGoopSpecConfig ? "global" : ""}${env.hasGlobalGoopSpecConfig && env.hasProjectGoopSpecConfig ? " + " : ""}${env.hasProjectGoopSpecConfig ? "project" : ""}`
      : "No GoopSpec configuration found",
    suggestedFix: hasAnyConfig 
      ? undefined 
      : "Run goop_setup(action: 'apply', scope: 'both') to create configuration",
  });
  
  // Check 3: Config validity
  if (env.hasProjectGoopSpecConfig) {
    try {
      const configContent = readFileSync(env.projectConfigPath, "utf-8");
      const config = JSON.parse(configContent);
      const validation = validateConfig(config);
      
      checks.push({
        name: "Config Validity",
        passed: validation.valid,
        message: validation.valid 
          ? "Project configuration is valid" 
          : `Invalid config: ${validation.errors?.join(", ")}`,
        suggestedFix: validation.valid 
          ? undefined 
          : "Fix configuration errors or reset with goop_setup(action: 'reset')",
      });
    } catch (error) {
      checks.push({
        name: "Config Validity",
        passed: false,
        message: `Failed to parse config: ${error instanceof Error ? error.message : String(error)}`,
        suggestedFix: "Check config.json for syntax errors",
      });
    }
  }
  
  // Check 4: State file
  checks.push({
    name: "State File",
    passed: env.hasStateFile,
    message: env.hasStateFile 
      ? "state.json exists" 
      : "state.json not found",
    suggestedFix: env.hasStateFile 
      ? undefined 
      : "Run goop_setup(action: 'init') to initialize state",
  });
  
  // Check 5: ADL file
  checks.push({
    name: "ADL File",
    passed: env.hasADLFile,
    message: env.hasADLFile 
      ? "ADL.md exists" 
      : "ADL.md not found",
    suggestedFix: env.hasADLFile 
      ? undefined 
      : "Run goop_setup(action: 'init') to create ADL",
  });
  
  // Check 6: Memory system
  checks.push({
    name: "Memory Directory",
    passed: env.hasMemoryDir,
    message: env.hasMemoryDir 
      ? "Memory directory exists" 
      : "Memory directory not found (optional)",
    suggestedFix: env.hasMemoryDir 
      ? undefined 
      : "Memory will be initialized on first use, or run init with memory enabled",
  });
  
  // Check 7: MCPs
  const recommendedMcps = MCP_PRESETS.recommended;
  const installedRecommended = recommendedMcps.filter(mcp => env.existingMcps.includes(mcp));
  const allMcpsInstalled = installedRecommended.length === recommendedMcps.length;
  
  checks.push({
    name: "MCPs",
    passed: env.existingMcps.length > 0,
    message: env.existingMcps.length > 0
      ? `Installed: ${env.existingMcps.join(", ")}`
      : "No MCPs detected",
    suggestedFix: allMcpsInstalled 
      ? undefined 
      : `Consider installing: ${recommendedMcps.filter(m => !env.existingMcps.includes(m)).join(", ")}`,
    details: {
      installed: env.existingMcps,
      recommended: recommendedMcps,
      missing: recommendedMcps.filter(m => !env.existingMcps.includes(m)),
    },
  });
  
  // Check 8: Memory Dependencies (optional but informational)
  if (env.hasMemoryDir) {
    const deps = await detectAllDependencies();
    
    // Vector search (sqlite-vec)
    checks.push({
      name: "Vector Search (sqlite-vec)",
      passed: deps.sqliteVec.available,
      message: deps.sqliteVec.available
        ? `sqlite-vec available${deps.sqliteVec.version ? ` (${deps.sqliteVec.version})` : ""}`
        : "sqlite-vec not available - using keyword search only",
      suggestedFix: deps.sqliteVec.available
        ? undefined
        : `Install: bun add sqlite-vec-${deps.platform.packageSuffix}`,
      details: {
        feature: deps.sqliteVec.feature,
        error: deps.sqliteVec.error,
      },
    });
    
    // Local embeddings (ONNX + transformers)
    const localEmbeddingsAvailable = deps.onnxRuntime.available && deps.transformers.available;
    const missingPkgs: string[] = [];
    if (!deps.onnxRuntime.available) missingPkgs.push("onnxruntime-node");
    if (!deps.transformers.available) missingPkgs.push("@huggingface/transformers");
    
    checks.push({
      name: "Local Embeddings",
      passed: localEmbeddingsAvailable,
      message: localEmbeddingsAvailable
        ? "Local embedding generation available (no API costs)"
        : `Local embeddings not available - ${missingPkgs.length > 0 ? `missing: ${missingPkgs.join(", ")}` : ""}`,
      suggestedFix: localEmbeddingsAvailable
        ? undefined
        : `Install: bun add ${missingPkgs.join(" ")}`,
      details: {
        onnxRuntime: deps.onnxRuntime,
        transformers: deps.transformers,
      },
    });
  }
  
  // Calculate summary
  const passed = checks.filter(c => c.passed).length;
  const failed = checks.filter(c => !c.passed).length;
  
  return {
    success: failed === 0,
    timestamp: new Date().toISOString(),
    checks,
    summary: {
      total: checks.length,
      passed,
      failed,
      warnings: checks.filter(c => c.suggestedFix && c.passed).length,
    },
  };
}

// ============================================================================
// Reset Functions
// ============================================================================

/**
 * Reset GoopSpec configuration to defaults
 */
export async function resetSetup(
  projectDir: string,
  options: ResetOptions
): Promise<ResetResult> {
  const result: ResetResult = {
    success: true,
    reset: [],
    preserved: [],
    errors: [],
  };
  
  if (!options.confirmed) {
    result.success = false;
    result.errors.push("Reset requires confirmation. Set confirmed: true to proceed.");
    return result;
  }
  
  const env = await detectEnvironment(projectDir);
  
  try {
    // Reset global config
    if ((options.scope === "global" || options.scope === "both") && env.hasGlobalGoopSpecConfig) {
      try {
        writeFileSync(env.globalConfigPath, JSON.stringify(DEFAULT_CONFIG, null, 2));
        result.reset.push(env.globalConfigPath);
        log(`Reset global config to defaults`);
      } catch (error) {
        result.errors.push(`Failed to reset global config: ${error instanceof Error ? error.message : String(error)}`);
        result.success = false;
      }
    }
    
    // Reset project config
    if ((options.scope === "project" || options.scope === "both") && env.hasProjectGoopSpecConfig) {
      const defaultProjectConfig = {
        orchestrator: {
          enableAsDefault: false,
          phaseGates: "ask",
          waveExecution: "sequential",
        },
        memory: {
          enabled: true,
        },
      };
      
      try {
        writeFileSync(env.projectConfigPath, JSON.stringify(defaultProjectConfig, null, 2));
        result.reset.push(env.projectConfigPath);
        log(`Reset project config to defaults`);
      } catch (error) {
        result.errors.push(`Failed to reset project config: ${error instanceof Error ? error.message : String(error)}`);
        result.success = false;
      }
    }
    
    // Preserve user data by default
    if (options.preserveData !== false) {
      const preservedPaths = [
        joinPath(env.goopspecDir, "memory"),
        joinPath(env.goopspecDir, "history"),
        joinPath(env.goopspecDir, "checkpoints"),
      ];
      
      for (const path of preservedPaths) {
        if (existsSync(path)) {
          result.preserved.push(path);
        }
      }
    } else if (options.preserveData === false) {
      // Full destructive reset - delete everything except config
      const dirsToDelete = [
        joinPath(env.goopspecDir, "memory"),
        joinPath(env.goopspecDir, "history"),
        joinPath(env.goopspecDir, "checkpoints"),
      ];
      
      for (const dir of dirsToDelete) {
        if (existsSync(dir)) {
          try {
            rmSync(dir, { recursive: true, force: true });
            result.reset.push(dir);
            log(`Deleted: ${dir}`);
          } catch (error) {
            result.errors.push(`Failed to delete ${dir}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      }
      
      // Reset state.json
      if (env.hasStateFile) {
        try {
          rmSync(joinPath(env.goopspecDir, "state.json"));
          result.reset.push(joinPath(env.goopspecDir, "state.json"));
        } catch (error) {
          logError("Failed to delete state.json", error);
        }
      }
    }
    
  } catch (error) {
    result.success = false;
    result.errors.push(error instanceof Error ? error.message : String(error));
  }
  
  return result;
}

// ============================================================================
// Status Functions
// ============================================================================

/**
 * Get current setup status
 */
export async function getSetupStatus(projectDir: string): Promise<SetupStatus> {
  const env = await detectEnvironment(projectDir);
  
  let projectName: string | undefined;
  let memoryEnabled = false;
  let memoryProvider: string | undefined;
  let searchProvider: "exa" | "brave" = "exa";
  const agentModels: Record<string, string> = {};
  
  // Read project config for details
  if (env.hasProjectGoopSpecConfig) {
    try {
      const content = readFileSync(env.projectConfigPath, "utf-8");
      const config = JSON.parse(content);
      projectName = config.projectName;
      memoryEnabled = config.memory?.enabled !== false;
      memoryProvider = config.memory?.embeddings?.provider ?? "local";
      if (config.mcp?.searchProvider === "exa" || config.mcp?.searchProvider === "brave") {
        searchProvider = config.mcp.searchProvider;
      }
      
      if (config.agents) {
        for (const [name, agent] of Object.entries(config.agents)) {
          if (typeof agent === "object" && agent && "model" in agent) {
            agentModels[name] = (agent as { model: string }).model;
          }
        }
      }
    } catch {
      // Ignore parse errors
    }
  }
  
  // Read state for project name if not in config
  if (!projectName && env.hasStateFile) {
    try {
      const statePath = joinPath(env.goopspecDir, "state.json");
      const content = readFileSync(statePath, "utf-8");
      const state = JSON.parse(content);
      projectName = state.project?.name;
    } catch {
      // Ignore parse errors
    }
  }

  if (searchProvider === "exa" && env.hasGlobalGoopSpecConfig) {
    try {
      const content = readFileSync(env.globalConfigPath, "utf-8");
      const config = JSON.parse(content);
      if (config.mcp?.searchProvider === "exa" || config.mcp?.searchProvider === "brave") {
        searchProvider = config.mcp.searchProvider;
      }
    } catch {
      // Ignore parse errors
    }
  }
  
  // Determine missing MCPs
  const recommendedMcps = MCP_PRESETS.recommended;
  const missingMcps = recommendedMcps.filter(m => !env.existingMcps.includes(m));
  
  return {
    initialized: env.hasGoopspecDir && env.hasStateFile,
    projectName,
    scope: {
      hasGlobal: env.hasGlobalGoopSpecConfig,
      hasProject: env.hasProjectGoopSpecConfig,
    },
    memory: {
      configured: env.hasProjectGoopSpecConfig || env.hasGlobalGoopSpecConfig,
      enabled: memoryEnabled,
      provider: memoryProvider,
      workerRunning: undefined, // Would need to check worker health
    },
    mcps: {
      installed: env.existingMcps,
      missing: missingMcps,
    },
    searchProvider,
    agentModels,
  };
}

export {
  AGENT_MODEL_SUGGESTIONS,
  ALL_AGENTS,
  type AgentModelSuggestion,
} from "./model-suggestions.js";

export { detectAllDependencies };
