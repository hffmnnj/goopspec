/**
 * Agent Factory
 * Converts markdown agent definitions to OpenCode AgentConfig objects
 * Includes memory system integration for persistent context
 * 
 * @module agents/agent-factory
 */

import type { ResolvedResource, ResourceResolver, GoopSpecConfig } from "../core/types.js";
import { log } from "../shared/logger.js";
import { ensurePosixPath } from "../shared/platform.js";

/**
 * Memory tools that should be added to agents
 */
const MEMORY_TOOLS = [
  "memory_save",
  "memory_search",
  "memory_note",
  "memory_decision",
  "memory_forget",
];

/**
 * Memory-related skills to inject
 */
const MEMORY_SKILLS = ["memory-usage"];

const QUESTION_TOOLS = ["question", "mcp_question"];
const USER_FACING_AGENTS = ["goop-orchestrator"];

/**
 * OpenCode AgentConfig interface
 * This matches the structure expected by OpenCode's config.agent
 */
export interface AgentConfig {
  mode: "primary" | "subagent" | "all";
  model?: string;
  prompt: string;
  description: string;
  color?: string;
  permission?: Record<string, "allow" | "deny">;
  temperature?: number;
  thinking?: { type: "enabled"; budgetTokens: number };
}

/**
 * Options for creating agent configs
 */
export interface AgentFactoryOptions {
  /** Whether to add memory tools to agents */
  enableMemoryTools?: boolean;
  /** Plugin config for additional settings */
  pluginConfig?: GoopSpecConfig;
}

/**
 * Create an AgentConfig from a markdown agent resource
 * 
 * This function:
 * 1. Extracts configuration from frontmatter
 * 2. Builds permission map from tools list (including memory tools if enabled)
 * 3. Composes the full prompt by injecting skills and references
 * 4. Returns a complete AgentConfig ready for OpenCode registration
 */
export function createAgentFromMarkdown(
  resource: ResolvedResource,
  resolver: ResourceResolver,
  options?: AgentFactoryOptions
): AgentConfig {
  const fm = resource.frontmatter;
  const resourceName = resource.name;
  const agentName = (fm.name as string) || resourceName;
  const { model, source } = resolveAgentModel(resourceName, fm, options);
  const enableMemory = options?.enableMemoryTools ?? (options?.pluginConfig?.memory?.enabled !== false);

  log(`Model for ${agentName}: ${model} (from: ${source})`);
  
  log(`Creating agent config for: ${agentName}`, { enableMemory });
  
  // Build permission map from tools list
  let tools = normalizeStringListField(fm.tools);
  let skills = normalizeStringListField(fm.skills);
  const shouldEnableMemory = enableMemory && hasMemoryCapability(skills, tools);
  const includeQuestionToolInstructions = shouldInjectQuestionToolInstructions(
    resourceName,
    agentName,
    fm,
    tools
  );
  
  // Add memory tools if enabled and not already present
  if (shouldEnableMemory) {
    const existingTools = new Set(tools.map(t => t.toLowerCase()));
    const memoryToolsToAdd = MEMORY_TOOLS.filter(t => !existingTools.has(t.toLowerCase()));
    if (memoryToolsToAdd.length > 0) {
      tools = [...tools, ...memoryToolsToAdd];
      log(`Added memory tools to ${agentName}`, { added: memoryToolsToAdd });
    }
  }
  
  const permission: Record<string, "allow" | "deny"> = {};
  for (const tool of tools) {
    permission[tool] = "allow";
  }
  
  // Load and inject skills/references into prompt
  // Add memory-usage skill if memory is enabled
  if (shouldEnableMemory && !skills.includes("memory-usage")) {
    skills = [...skills, ...MEMORY_SKILLS];
  }
  
  const references = normalizeStringListField(fm.references);
  const composedPrompt = composeAgentPrompt(
    resource.body, 
    skills, 
    references, 
    resolver,
    agentName,
    shouldEnableMemory,
    includeQuestionToolInstructions
  );
  
  // Build the agent configuration
  const config: AgentConfig = {
    mode: (fm.mode as "primary" | "subagent" | "all") ?? "subagent",
    prompt: composedPrompt,
    description: (fm.description as string) ?? `GoopSpec ${agentName} agent`,
    model,
    color: fm.color as string | undefined,
    temperature: fm.temperature as number | undefined,
  };
  
  // Add permission if tools are defined
  if (Object.keys(permission).length > 0) {
    config.permission = permission;
  }
  
  // Add thinking budget if defined
  if (fm.thinking_budget) {
    config.thinking = {
      type: "enabled",
      budgetTokens: fm.thinking_budget as number,
    };
  }
  
  log(`Created agent config for ${agentName}`, {
    mode: config.mode,
    model: config.model,
    toolCount: tools.length,
    skillCount: skills.length,
    referenceCount: references.length,
    memoryEnabled: enableMemory,
  });
  
  return config;
}

function resolveAgentModel(
  resourceName: string,
  frontmatter: ResolvedResource["frontmatter"],
  options?: AgentFactoryOptions
): { model: string; source: string } {
  const projectAgentModel = options?.pluginConfig?.agents?.[resourceName]?.model;
  if (projectAgentModel) {
    return {
      model: projectAgentModel,
      source: `project config agents.${resourceName}.model`,
    };
  }

  const frontmatterModel = frontmatter.model;
  if (typeof frontmatterModel === "string" && frontmatterModel.trim().length > 0) {
    return {
      model: frontmatterModel,
      source: "frontmatter default",
    };
  }

  const defaultModel = options?.pluginConfig?.defaultModel;
  if (defaultModel) {
    return {
      model: defaultModel,
      source: "project config defaultModel",
    };
  }

  return {
    model: "anthropic/claude-sonnet-4-6",
    source: "hardcoded fallback",
  };
}

/**
 * Compose full agent prompt by injecting skills and references
 * 
 * The composed prompt includes:
 * 1. Base agent prompt (from markdown body)
 * 2. Loaded skills (inline content)
 * 3. Referenced documents (inline content)
 * 4. Memory system instructions (if enabled)
 */
function composeAgentPrompt(
  basePrompt: string,
  skillNames: string[],
  referenceNames: string[],
  resolver: ResourceResolver,
  agentName: string,
  enableMemory: boolean = true,
  includeQuestionToolInstructions: boolean = false
): string {
  const sections: string[] = [basePrompt];
  
  // Inject skills
  if (skillNames.length > 0) {
    sections.push("\n## Loaded Skills\n");
    
    for (const name of skillNames) {
      try {
        // Try direct match first
        let skill = resolver.resolve("skill", name);
        
        // Try with /skill.md suffix
        if (!skill) {
          skill = resolver.resolve("skill", `${name}/skill`);
        }
        
        if (skill) {
          const skillTitle = (skill.frontmatter.name as string) || name;
          sections.push(`### ${skillTitle}\n`);
          sections.push(skill.body);
          sections.push("");
          
          log(`Injected skill: ${name} into ${agentName}`);
        } else {
          log(`Skill not found: ${name} for ${agentName}`, { level: "warn" });
        }
      } catch (error) {
        log(`Failed to load skill: ${name} for ${agentName}`, { error, level: "warn" });
      }
    }
  }
  
  // Inject references
  if (referenceNames.length > 0) {
    sections.push("\n## Reference Documents\n");
    
    for (const name of referenceNames) {
      try {
        const resolved = resolveReferenceResource(resolver, name);
        
        if (resolved) {
          const title = (resolved.resource.frontmatter.name as string) || resolved.resource.name;
          const label = resolved.kind === "template" ? "Template" : "Reference";
          sections.push(`### ${label}: ${title}\n`);
          sections.push(resolved.resource.body);
          sections.push("");
          
          log(`Injected ${resolved.kind}: ${name} into ${agentName}`);
        } else {
          log(`Reference not found: ${name} for ${agentName}`, { level: "warn" });
        }
      } catch (error) {
        log(`Failed to load reference: ${name} for ${agentName}`, { error, level: "warn" });
      }
    }
  }
  
  // Add memory system instructions if enabled
  if (enableMemory && skillNames.includes("memory-usage")) {
    sections.push(`
## Memory System

Use memory to preserve continuity across sessions:
- Search first: \`memory_search\`
- Save findings/patterns: \`memory_save\`
- Save architecture choices with rationale: \`memory_decision\`
- Capture quick notes: \`memory_note\`
- Remove stale/incorrect records when needed: \`memory_forget\`

Best practice: search before decisions, then persist key outcomes.
`);
  }

  if (includeQuestionToolInstructions) {
    sections.push(`
## Question Tool (User Interaction)

When user input is required, use **\`question\`** / **\`mcp_question\`** (not plain-text prompts).

Use structured prompts for short-answer interactions:
- confirmations, gate approvals, next-step choices
- single-choice decisions
- short text inputs (1-2 sentences)

For structured prompts:
- provide 2-5 concise, conversational options
- always include a custom-entry path option labeled **"Type your own answer"**
- keep custom entry enabled by default

Use freeform plain-text prompts only when multi-paragraph input is truly required.
In discovery interviews, keep structured coverage across Vision, Must-Haves, Constraints, Out of Scope, Assumptions, and Risks.

Do not ask users to type free-form command words like "confirm/amend/cancel".
`);
  }
  
  return sections.join("\n");
}

function hasMemoryCapability(skills: string[], tools: string[]): boolean {
  if (skills.includes("memory-usage")) {
    return true;
  }

  const normalizedTools = new Set(tools.map(tool => tool.toLowerCase()));
  return MEMORY_TOOLS.some(tool => normalizedTools.has(tool.toLowerCase()));
}

function normalizeStringListField(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === "string")
      .map(item => item.trim())
      .filter(item => item.length > 0);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return [];
    }

    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        const parsed = JSON.parse(trimmed);
        return normalizeStringListField(parsed);
      } catch {
        return [];
      }
    }

    return [trimmed];
  }

  return [];
}

function shouldInjectQuestionToolInstructions(
  resourceName: string,
  agentName: string,
  frontmatter: ResolvedResource["frontmatter"],
  tools: string[]
): boolean {
  if (frontmatter.user_facing === true || frontmatter.mode === "orchestrator") {
    return true;
  }

  const normalizedName = resourceName.toLowerCase();
  const normalizedAgentName = agentName.toLowerCase();
  if (USER_FACING_AGENTS.includes(normalizedName) || USER_FACING_AGENTS.includes(normalizedAgentName)) {
    return true;
  }

  const normalizedTools = new Set(tools.map(tool => tool.toLowerCase()));
  return QUESTION_TOOLS.some(tool => normalizedTools.has(tool.toLowerCase()));
}

function normalizeReferencePath(name: string): string {
  return ensurePosixPath(name.trim()).replace(/^\.\/?/, "");
}

function extractTemplateName(name: string): string | null {
  const normalized = normalizeReferencePath(name);
  if (normalized.startsWith("templates/")) {
    return normalized.slice("templates/".length);
  }
  if (normalized.startsWith("template:")) {
    return normalized.slice("template:".length);
  }
  return null;
}

function resolveReferenceResource(
  resolver: ResourceResolver,
  name: string
): { resource: ResolvedResource; kind: "reference" | "template" } | null {
  const templateName = extractTemplateName(name);
  if (templateName) {
    const template = resolver.resolve("template", templateName);
    if (template) {
      return { resource: template, kind: "template" };
    }
  }

  const reference = resolver.resolve("reference", normalizeReferencePath(name));
  if (reference) {
    return { resource: reference, kind: "reference" };
  }

  return null;
}

/**
 * Validate that an agent resource has required frontmatter fields
 * Returns array of missing/invalid fields
 */
export function validateAgentResource(resource: ResolvedResource): string[] {
  const issues: string[] = [];
  const fm = resource.frontmatter;
  
  if (!fm.name && !resource.name) {
    issues.push("Missing 'name' field");
  }
  
  if (!fm.description) {
    issues.push("Missing 'description' field");
  }
  
  if (!fm.mode || !["primary", "subagent", "all"].includes(fm.mode as string)) {
    issues.push("Invalid or missing 'mode' field (must be primary, subagent, or all)");
  }
  
  if (!resource.body || resource.body.trim().length === 0) {
    issues.push("Empty agent prompt body");
  }
  
  return issues;
}
