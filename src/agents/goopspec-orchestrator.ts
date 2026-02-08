/**
 * GoopSpec Orchestrator Agent Factory
 * Creates the primary orchestrator agent configuration
 * 
 * @module agents/goopspec-orchestrator
 */

import type { 
  GoopSpecConfig,
  ResourceResolver, 
  ResolvedResource,
  PhaseGateMode, 
  WaveExecutionMode 
} from "../core/types.js";
import { buildOrchestratorPrompt } from "./prompt-sections/index.js";
import { log } from "../shared/logger.js";

// ============================================================================
// Types
// ============================================================================

export interface OrchestratorOptions {
  pluginConfig?: GoopSpecConfig;
  model?: string;
  thinkingBudget?: number;
  phaseGates?: PhaseGateMode;
  waveExecution?: WaveExecutionMode;
  resolver: ResourceResolver;
}

export interface OrchestratorAgentConfig {
  name: string;
  mode: "primary";
  model: string;
  thinking: { type: "enabled"; budgetTokens: number };
  prompt: string;
  description: string;
  color: string;
  permission: Record<string, string>;
}

// ============================================================================
// Agent Factory
// ============================================================================

/**
 * Create the GoopSpec orchestrator agent configuration
 * 
 * This is the primary user-facing agent that:
 * - Controls the 5-phase workflow (Discuss → Plan → Execute → Audit → Confirm)
 * - Delegates to specialized sub-agents
 * - Manages phase gates and wave execution
 */
export function createGoopSpecOrchestrator(options: OrchestratorOptions): OrchestratorAgentConfig {
  const { resolver } = options;
  const { model, source } = resolveOrchestratorModel(options);

  log(`Model for goop-orchestrator: ${model} (from: ${source})`);
  
  // Get available sub-agents and skills for dynamic prompt generation
  const availableAgents = resolver.resolveAll("agent");
  const availableSkills = resolver.resolveAll("skill");
  
  log("Building GoopSpec orchestrator", {
    agentCount: availableAgents.length,
    skillCount: availableSkills.length,
    phaseGates: options.phaseGates ?? "ask",
    waveExecution: options.waveExecution ?? "sequential",
  });

  // Build the dynamic prompt based on available resources
  const prompt = buildOrchestratorPrompt({
    phaseGates: options.phaseGates ?? "ask",
    waveExecution: options.waveExecution ?? "sequential",
    availableAgents,
    availableSkills,
  });

  return {
    // NOTE: name MUST match the registration key in config-handler.ts
    // OpenCode looks up agents by name when switching via Tab
    name: "goopspec",
    mode: "primary",
    model,
    thinking: { 
      type: "enabled", 
      budgetTokens: options.thinkingBudget ?? 32000 
    },
    prompt,
    description: "GoopSpec Orchestrator - Spec-driven development (Plan → Research → Specify → Execute → Accept)",
    color: "#65f463", // Green to distinguish GoopSpec
    permission: {
      // GoopSpec tools
      goop_delegate: "allow",
      goop_skill: "allow",
      goop_status: "allow",
      goop_adl: "allow",
      goop_spec: "allow",
      goop_checkpoint: "allow",
      // Standard tools
      question: "allow",
      todowrite: "allow",
      todoread: "allow",
      read: "allow",
      glob: "allow",
      grep: "allow",
      edit: "allow",
      write: "allow",
      bash: "allow",
      task: "allow",
    },
  };
}

function resolveOrchestratorModel(options: OrchestratorOptions): { model: string; source: string } {
  const agentsModel = options.pluginConfig?.agents?.["goop-orchestrator"]?.model;
  if (agentsModel) {
    return {
      model: agentsModel,
      source: "project config agents.goop-orchestrator.model",
    };
  }

  const orchestratorModel = options.pluginConfig?.orchestrator?.model ?? options.model;
  if (orchestratorModel) {
    return {
      model: orchestratorModel,
      source: options.pluginConfig?.orchestrator?.model ? "project config orchestrator.model" : "runtime options model",
    };
  }

  const frontmatterModel = getOrchestratorFrontmatterModel(options.resolver);
  if (frontmatterModel) {
    return {
      model: frontmatterModel,
      source: "frontmatter default",
    };
  }

  return {
    model: "anthropic/claude-opus-4-6",
    source: "hardcoded fallback",
  };
}

function getOrchestratorFrontmatterModel(resolver: ResourceResolver): string | undefined {
  const orchestratorResource = resolver.resolve("agent", "goop-orchestrator");
  const configuredModel = orchestratorResource?.frontmatter.model;

  return typeof configuredModel === "string" ? configuredModel : undefined;
}

/**
 * Extract agent names from resolved resources for prompt building
 */
export function getAgentNames(agents: ResolvedResource[]): string[] {
  return agents
    .map(a => a.frontmatter.name || a.name)
    .filter((name): name is string => typeof name === "string");
}

/**
 * Extract skill names from resolved resources for prompt building
 */
export function getSkillNames(skills: ResolvedResource[]): string[] {
  return skills
    .map(s => s.frontmatter.name || s.name)
    .filter((name): name is string => typeof name === "string");
}
