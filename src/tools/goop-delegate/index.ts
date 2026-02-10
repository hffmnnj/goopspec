/**
 * GoopSpec Delegate Tool
 * Spawn specialized agents with context injection
 * 
 * @module tools/goop-delegate
 */

import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool";
import type {
  PluginContext,
  AgentDefinition,
  ToolContext,
  ResolvedResource,
  SearchProvider,
} from "../../core/types.js";
import {
  generateTeamAwarenessSection,
  type TeamAwarenessContext,
  type TeamAwarenessSibling,
} from "../../agents/prompt-sections/team-awareness.js";
import { log, logError } from "../../shared/logger.js";
import { loadPluginConfig } from "../../core/config.js";
import { fetchAvailableAgents, type OpenCodeClient } from "../../shared/opencode-client.js";
import { getActiveAgents, registerAgent } from "../../features/team/index.js";
import {
  checkFileConflict,
  generateConflictWarning,
  type ConflictInfo,
} from "../../features/team/conflict.js";
import type { AgentRegistration } from "../../features/team/types.js";
import { getSessionGoopspecPath } from "../../shared/paths.js";
import { ensurePosixPath } from "../../shared/platform.js";

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
  resolver: PluginContext["resolver"],
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

function parseTeamContext(raw?: string): TeamAwarenessContext | undefined {
  if (!raw) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(raw) as TeamAwarenessContext;
    if (parsed && typeof parsed === "object") {
      return parsed;
    }
  } catch (error) {
    log("Invalid team_context JSON", { error });
  }

  return undefined;
}

function generateAgentId(): string {
  return crypto.randomUUID().slice(0, 8);
}

function mergeTeamContexts(
  base: TeamAwarenessContext | undefined,
  extra: TeamAwarenessContext | undefined
): TeamAwarenessContext {
  const siblings = new Map<string, TeamAwarenessSibling>();
  const allSiblings = [...(base?.siblings ?? []), ...(extra?.siblings ?? [])];

  for (const sibling of allSiblings) {
    siblings.set(sibling.id, sibling);
  }

  const mergedSiblings = Array.from(siblings.values());
  return mergedSiblings.length > 0 ? { siblings: mergedSiblings } : {};
}

interface SearchProviderSubstitution {
  toolMap: Readonly<Record<string, string>>;
  promptReplacements: ReadonlyArray<{ pattern: RegExp; replacement: string }>;
}

const SEARCH_PROVIDER_SUBSTITUTIONS: Record<SearchProvider, SearchProviderSubstitution> = {
  exa: {
    toolMap: {},
    promptReplacements: [],
  },
  brave: {
    toolMap: {
      web_search_exa: "brave_web_search",
      company_research_exa: "brave_web_search",
      get_code_context_exa: "brave_web_search",
    },
    promptReplacements: [{ pattern: /\bExa\b/g, replacement: "Brave Search" }],
  },
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceMappedTokens(input: string, toolMap: Readonly<Record<string, string>>): string {
  let output = input;

  for (const [from, to] of Object.entries(toolMap)) {
    const pattern = new RegExp(`\\b${escapeRegExp(from)}\\b`, "g");
    output = output.replace(pattern, to);
  }

  return output;
}

function applySearchProviderSubstitution(
  agentDef: AgentDefinition,
  searchProvider: SearchProvider
): AgentDefinition {
  if (searchProvider === "exa") {
    return agentDef;
  }

  const substitution = SEARCH_PROVIDER_SUBSTITUTIONS[searchProvider];
  const substitutedTools = Array.from(
    new Set(agentDef.tools.map(toolName => substitution.toolMap[toolName] ?? toolName))
  );

  let substitutedPrompt = replaceMappedTokens(agentDef.prompt, substitution.toolMap);
  for (const { pattern, replacement } of substitution.promptReplacements) {
    substitutedPrompt = substitutedPrompt.replace(pattern, replacement);
  }

  return {
    ...agentDef,
    tools: substitutedTools,
    prompt: substitutedPrompt,
  };
}

function normalizeFileReference(value: string): string | null {
  const trimmed = value.trim().replace(/^`|`$/g, "");
  if (!trimmed) {
    return null;
  }

  const candidate = trimmed.split(/\s+-\s+|\s+—\s+/)[0]?.trim();
  if (!candidate) {
    return null;
  }

  if (candidate.startsWith("http://") || candidate.startsWith("https://")) {
    return null;
  }

  if (!candidate.includes("/") && !candidate.includes(".")) {
    return null;
  }

  return candidate;
}

function extractFilePathsFromContext(...contexts: Array<string | undefined>): string[] {
  const results = new Set<string>();
  const sectionHeaderPattern = /^#{1,6}\s+/;
  const filesHeaderPattern = /^files?(\s+to\s+modify|\s+to\s+read)?\s*:/i;

  for (const context of contexts) {
    if (!context) {
      continue;
    }

    let inFilesSection = false;
    const lines = context.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }

      if (sectionHeaderPattern.test(trimmed)) {
        inFilesSection = /files?/i.test(trimmed);
        continue;
      }

      if (filesHeaderPattern.test(trimmed)) {
        inFilesSection = true;
        const inlineList = trimmed.replace(filesHeaderPattern, "").trim();
        if (inlineList) {
          const parts = inlineList.split(",");
          for (const part of parts) {
            const normalized = normalizeFileReference(part);
            if (normalized) {
              results.add(normalized);
            }
          }
        }
        continue;
      }

      if (!inFilesSection) {
        continue;
      }

      if (/^[A-Za-z].*:$/.test(trimmed)) {
        inFilesSection = false;
        continue;
      }

      const bulletMatch = trimmed.match(/^[-*]\s+(.+)$/);
      const candidate = bulletMatch ? bulletMatch[1] : trimmed;
      const normalized = normalizeFileReference(candidate);
      if (normalized) {
        results.add(normalized);
      }
    }
  }

  return Array.from(results);
}

async function buildAutoTeamContext(currentAgentId: string): Promise<TeamAwarenessContext> {
  const activeAgents = await getActiveAgents();
  const siblings = activeAgents
    .filter(agent => agent.id !== currentAgentId)
    .map(agent => ({
      id: agent.id,
      type: agent.type,
      task: agent.task,
    }));

  return siblings.length > 0 ? { siblings } : {};
}

const MANDATORY_BOOTSTRAP_BLOCK = `## ⚠️ MANDATORY FIRST STEP

**DO NOT proceed past this section until all steps are complete.**

1. \`goop_state({ action: "get" })\` - Load workflow state
2. \`Read(".goopspec/SPEC.md")\` - Read specification
3. \`Read(".goopspec/BLUEPRINT.md")\` - Read execution plan
4. \`memory_search({ query: "[task context]", limit: 5 })\` - Search relevant memory

**Then acknowledge:** current phase, spec lock status, active task.`;

/**
 * Build agent prompt with skills and references
 */
function buildAgentPrompt(
  ctx: PluginContext,
  agentDef: AgentDefinition,
  userPrompt: string,
  additionalContext?: string,
   teamContext?: TeamAwarenessContext,
   sessionId?: string,
): string {
  const sections: string[] = [];
  const scopedSessionId = typeof sessionId === "string" && sessionId.trim().length > 0
    ? sessionId.trim()
    : undefined;
  const specPath = ensurePosixPath(getSessionGoopspecPath("", "SPEC.md", scopedSessionId));
  const blueprintPath = ensurePosixPath(getSessionGoopspecPath("", "BLUEPRINT.md", scopedSessionId));
  const chroniclePath = ensurePosixPath(getSessionGoopspecPath("", "CHRONICLE.md", scopedSessionId));
  const researchPath = ensurePosixPath(getSessionGoopspecPath("", "RESEARCH.md", scopedSessionId));
  
  // Agent identity
  sections.push(`# Agent: ${agentDef.name}`);
  sections.push("");
  sections.push(MANDATORY_BOOTSTRAP_BLOCK);
  sections.push("");
  sections.push(agentDef.prompt);
  sections.push("");
  
  // Planning file paths
  sections.push("## Planning Files (Read These First)\n");
  sections.push(`- SPEC.md: \`${specPath}\` - Specification contract`);
  sections.push(`- BLUEPRINT.md: \`${blueprintPath}\` - Execution plan`);
  sections.push(`- CHRONICLE.md: \`${chroniclePath}\` - Progress log`);
  sections.push(`- RESEARCH.md: \`${researchPath}\` - Research findings`);
  if (scopedSessionId) {
    sections.push("");
    sections.push("## Session Context\n");
    sections.push(`- sessionId: \`${scopedSessionId}\``);
    sections.push(`- Session root: \`${ensurePosixPath(getSessionGoopspecPath("", "", scopedSessionId))}\``);
  }
  sections.push("");
  
  // Load and inject skills
  if (agentDef.skills.length > 0) {
    sections.push("## Loaded Skills\n");
    for (const skillName of agentDef.skills) {
      const skill = ctx.resolver.resolve("skill", skillName) 
        || ctx.resolver.resolve("skill", `${skillName}/skill`);
      if (skill) {
        sections.push(`### ${skill.frontmatter.name || skill.name}`);
        sections.push(skill.body);
        sections.push("");
      }
    }
  }
  
  // Load and inject references
  if (agentDef.references.length > 0) {
    sections.push("## References\n");
    for (const refName of agentDef.references) {
      const resolved = resolveReferenceResource(ctx.resolver, refName);
      if (resolved?.resource) {
        const title = resolved.resource.frontmatter.name || resolved.resource.name;
        const label = resolved.kind === "template" ? "Template" : "Reference";
        sections.push(`### ${label}: ${title}`);
        sections.push(resolved.resource.body);
        sections.push("");
      }
    }
  }

  if (teamContext) {
    sections.push(generateTeamAwarenessSection(teamContext));
    sections.push("");
  }
  
  // Additional context
  if (additionalContext) {
    sections.push("## Additional Context\n");
    sections.push(additionalContext);
    sections.push("");
  }
  
  // User task
  sections.push("## Your Task\n");
  sections.push(userPrompt);
  
  return sections.join("\n");
}

/**
 * Infer category from agent name
 */
function inferCategory(agentName: string): string {
  const categoryMap: Record<string, string> = {
    "goop-executor-low": "code",
    "goop-executor-medium": "code",
    "goop-executor-high": "code",
    "goop-executor-frontend": "code",
    "goop-planner": "plan",
    "goop-researcher": "research",
    "goop-explorer": "explore",
    "goop-librarian": "search",
    "goop-verifier": "verify",
    "goop-creative": "creative",
    "goop-debugger": "debug",
    "goop-designer": "visual",
    "goop-tester": "test",
    "goop-writer": "docs",
    "memory-distiller": "memory",
  };
  return categoryMap[agentName] || "general";
}

/**
 * Resolve the best available subagent type for task delegation.
 */
function resolveSubagentType(agentDef: AgentDefinition, available: string[]): string {
  const preferredMap: Record<string, string> = {
    "goop-explorer": "explore",
    "goop-researcher": "general",
    "goop-planner": "general",
    "goop-executor-low": "general",
    "goop-executor-medium": "general",
    "goop-executor-high": "general",
    "goop-executor-frontend": "general",
    "goop-verifier": "general",
    "goop-creative": "general",
    "goop-debugger": "general",
    "goop-designer": "general",
    "goop-tester": "general",
    "goop-writer": "general",
    "memory-distiller": "general",
  };

  if (available.length === 0) {
    return preferredMap[agentDef.name] || "general";
  }

  const availableSet = new Set(available);
  const candidates = [agentDef.name, preferredMap[agentDef.name]].filter(Boolean) as string[];

  for (const candidate of candidates) {
    if (availableSet.has(candidate)) {
      return candidate;
    }
  }

  if (availableSet.has("general")) {
    return "general";
  }

  if (availableSet.has("explore") && agentDef.name.includes("explorer")) {
    return "explore";
  }

  return available[0];
}

/**
 * Format a task delegation response that uses the native task tool.
 * 
 * This is the "prompt engineering" output - it prepares everything the orchestrator
 * needs to invoke the task tool with the correct parameters.
 */
function formatTaskDelegation(
  agentDef: AgentDefinition,
  agentId: string,
  parentId: string | undefined,
  userPrompt: string,
  composedPrompt: string,
  subagentType: string,
  availableSubagents: string[],
  teamContext: TeamAwarenessContext,
  sessionId: string | undefined,
  conflicts: ConflictInfo[] = [],
  conflictWarnings: string[] = []
): string {
  const memoryProtocol = `
## Memory Protocol (Required)

### Before Starting
1. Search memory for relevant context: memory_search({ query: "[task-related terms]" })
2. Read SPEC.md, BLUEPRINT.md, CHRONICLE.md if they exist

### During Work  
1. Use memory_note for important observations
2. Use memory_decision for architectural choices
3. Update CHRONICLE.md with progress

### After Completing
1. Save learnings to memory: memory_save({ type: "observation", ... })
2. Return structured summary to orchestrator
`;

  const enrichedPrompt = composedPrompt + "\n\n" + memoryProtocol;

  // Create a short task description from the user prompt
  const taskDescription = userPrompt.slice(0, 50).replace(/\n/g, ' ').trim() + (userPrompt.length > 50 ? '...' : '');

  const delegationPayload = {
    action: "delegate_via_task",
    agent_id: agentId,
    parent_id: parentId,
    agent: agentDef.name,
    subagent_type: subagentType,
    available_subagents: availableSubagents,
    model: agentDef.model,
    category: agentDef.mode || inferCategory(agentDef.name),
    skills: agentDef.skills,
    references: agentDef.references,
    userPrompt: userPrompt,
    composedPrompt: enrichedPrompt,
    team_context: teamContext,
    ...(sessionId ? { session_id: sessionId } : {}),
    conflicts: conflicts,
    conflict_warnings: conflictWarnings,
  };

  const warningSection = conflictWarnings.length > 0
    ? `## ⚠️ Delegation Warning\n\n${conflictWarnings.join("\n\n")}\n\n`
    : "";

  // Escape backticks in the prompt for safe embedding in template literal
  const escapedPrompt = enrichedPrompt.replace(/`/g, '\\`');

  return `${warningSection}# Prompt Engineered for ${agentDef.name}

\`goop_delegate\` has prepared this delegation. **You MUST now invoke the \`task\` tool.**

<goop_delegation>
${JSON.stringify(delegationPayload, null, 2)}
</goop_delegation>

---

## 🚀 REQUIRED: Execute This Task Invocation

Copy and execute this \`task\` tool call:

\`\`\`
task({
  subagent_type: "${subagentType}",
  description: "${taskDescription}",
  prompt: \`${escapedPrompt}\`
})
\`\`\`

---

### Why Two Steps?

1. **\`goop_delegate\`** (just completed) = Prompt Engineering
   - Loaded agent definition, skills, references
   - Injected team awareness and memory protocol
   - Prepared the complete context package

2. **\`task\`** (do this NOW) = Execution
   - Spawns the subagent with the engineered prompt
   - Returns results back to you

**Complete all MANDATORY FIRST STEP actions before proceeding to task execution. DO NOT skip bootstrap.**

**Do NOT skip the task invocation. The delegation is incomplete without it.**`;
}

/**
 * Create the goop_delegate tool
 */
export function createGoopDelegateTool(ctx: PluginContext): ToolDefinition {
  return tool({
    description: "Delegate a task to a specialized GoopSpec agent by preparing a native task tool invocation with the correct prompt, skills, and references.",
    args: {
      agent: tool.schema.string().optional(),
      prompt: tool.schema.string().optional(),
      context: tool.schema.string().optional(),
      team_context: tool.schema.string().optional(),
      list: tool.schema.boolean().optional(),
      session_id: tool.schema.string().optional(),
    },
    async execute(
      args: {
        agent?: string;
        prompt?: string;
        context?: string;
        team_context?: string;
        list?: boolean;
        session_id?: string;
      },
      _context: ToolContext
    ): Promise<string> {
      // List agents
      if (args.list || !args.agent) {
        const agents = ctx.resolver.resolveAll("agent");
        
        if (agents.length === 0) {
          return "No agents available.";
        }
        
        const lines = ["# Available Agents\n"];
        for (const agent of agents) {
          const desc = agent.frontmatter.description as string || "";
          const model = agent.frontmatter.model as string || "default";
          lines.push(`- **${agent.name}**: ${desc} (model: ${model})`);
        }
        
        lines.push("");
        lines.push("Use the native `task` tool with `subagent_type` and `prompt` to delegate work.");
        
        return lines.join("\n");
      }
      
      // Validate prompt
      if (!args.prompt) {
        return "Error: 'prompt' is required when delegating to an agent.";
      }
      
      // Load agent
      const agentResource = ctx.resolver.resolve("agent", args.agent);
      if (!agentResource) {
        const available = ctx.resolver.resolveAll("agent").map(a => a.name);
        return `Agent "${args.agent}" not found.\n\nAvailable agents: ${available.join(", ")}`;
      }
      
      // Check config for model override
      const config = loadPluginConfig(ctx.input.directory);
      const configModel = config.agents?.[agentResource.name]?.model;
      const defaultModel = config.defaultModel;
      
      // Build agent definition
      const rawAgentDef: AgentDefinition = {
        name: agentResource.frontmatter.name as string || agentResource.name,
        description: agentResource.frontmatter.description as string || "",
        // Use config model if available, then frontmatter, then configured default, then hardcoded default
        model: configModel
          ?? (agentResource.frontmatter.model as string | undefined)
          ?? defaultModel
          ?? "anthropic/claude-sonnet-4-5",
        temperature: agentResource.frontmatter.temperature as number || 0.2,
        thinkingBudget: agentResource.frontmatter.thinking_budget as number | undefined,
        mode: agentResource.frontmatter.mode as string | undefined,
        tools: (agentResource.frontmatter.tools as string[]) || [],
        skills: (agentResource.frontmatter.skills as string[]) || [],
        references: (agentResource.frontmatter.references as string[]) || [],
        prompt: agentResource.body,
      };

      const searchProvider: SearchProvider = ctx.config.mcp?.searchProvider ?? "exa";
      const agentDef = applySearchProviderSubstitution(rawAgentDef, searchProvider);
      
      const teamContext = parseTeamContext(args.team_context);
      const agentId = generateAgentId();
      const parentId = args.session_id;
      let autoTeamContext: TeamAwarenessContext | undefined;
      const contextFilePaths = extractFilePathsFromContext(args.context, args.prompt);
      const conflicts: ConflictInfo[] = [];
      const conflictWarnings: string[] = [];

      const registration: AgentRegistration = {
        id: agentId,
        type: agentDef.name,
        task: args.prompt,
        claimedFiles: [],
        parentId: parentId,
        startedAt: Date.now(),
      };

      const registrationResult = await registerAgent(registration);
      if (!registrationResult.ok) {
        logError("Failed to register delegated agent", registrationResult.error);
      }

      if (contextFilePaths.length > 0) {
        try {
          for (const filePath of contextFilePaths) {
            const conflict = await checkFileConflict(filePath, agentId);
            if (conflict.hasConflict) {
              conflicts.push(conflict);
              const warning = conflict.warningMessage || generateConflictWarning(conflict);
              if (warning) {
                conflictWarnings.push(warning);
              }
            }
          }
        } catch (error) {
          logError("Failed to check file conflicts for delegation", error);
        }
      }

      try {
        autoTeamContext = await buildAutoTeamContext(agentId);
      } catch (error) {
        logError("Failed to build team context for delegation", error);
      }

      const mergedTeamContext = mergeTeamContexts(teamContext, autoTeamContext);
      const activeSessionId = typeof ctx.sessionId === "string" && ctx.sessionId.trim().length > 0
        ? ctx.sessionId.trim()
        : undefined;
      const conflictContext = conflictWarnings.length > 0
        ? ["## File Conflict Warnings", "", ...conflictWarnings].join("\n")
        : "";
      const combinedContext = [args.context, conflictContext].filter(Boolean).join("\n\n");

      // Build composed prompt (used as system content)
      const composedPrompt = buildAgentPrompt(
        ctx,
        agentDef,
        args.prompt,
        combinedContext,
        mergedTeamContext,
        activeSessionId,
      );
      
      const client = ctx.input.client as OpenCodeClient;
      const availableSubagents = await fetchAvailableAgents(client);

      const subagentType = resolveSubagentType(agentDef, availableSubagents);

      log("Delegation prepared", {
        agent: agentDef.name,
        agentId,
        parentId,
        subagentType,
        availableSubagents,
        modelSource: configModel
          ? "config"
          : agentResource.frontmatter.model
            ? "frontmatter"
            : defaultModel
              ? "defaultModel"
              : "hardcoded",
      });

      return formatTaskDelegation(
        agentDef,
        agentId,
        parentId,
        args.prompt,
        composedPrompt,
        subagentType,
        availableSubagents,
        mergedTeamContext,
        activeSessionId,
        conflicts,
        conflictWarnings
      );
    },
  });
}
