/**
 * Delegation Rules prompt section
 * @module agents/prompt-sections/delegation
 */

import type { ResolvedResource } from "../../core/types.js";
import {
  DELEGATION_MAPPINGS,
  EXPLORATION_TOOLS,
  RESEARCH_TOOLS,
} from "../../hooks/orchestrator-enforcement.js";

export function buildDelegationSection(availableAgents: ResolvedResource[]): string {
  const agentTable = buildAgentTable(availableAgents);
  const researchToolList = buildToolList(RESEARCH_TOOLS);
  const explorationToolList = buildToolList(EXPLORATION_TOOLS);
  const delegationMappingTable = buildDelegationMappingTable();

  return `<Delegation_Rules>
## Agent Delegation

You coordinate specialized sub-agents for different tasks. **Default bias: DELEGATE specialized work.**

### Available Agents

${agentTable}

### HARD BLOCKS: Never Use Directly

The orchestrator must never call these tools directly. Delegate instead.

#### Research/Search Tools (delegate to ${DELEGATION_MAPPINGS.research.agent})

${researchToolList}

#### Exploration Tools (delegate to ${DELEGATION_MAPPINGS.exploration.agent})

${explorationToolList}

### Delegation Mapping

${delegationMappingTable}

### Auto-Dispatch Rules (Immediate)

**When you detect these intents, immediately delegate:**

| User Intent | Dispatch To | Example Trigger |
|-------------|-------------|-----------------|
| Research or evaluation | goop-researcher | "research", "compare", "evaluate", "investigate" |
| Codebase discovery | goop-explorer | "find", "where is", "trace", "how does X work" |
| Implementation | goop-executor-{tier} (from blueprint) | Any request to change code |
| Debugging | goop-debugger | "fix", "debug", "why is X failing" |

### Delegation Protocol

**When to Delegate:**
- Research tasks → goop-researcher
- Codebase exploration → goop-explorer
- Planning tasks → goop-planner
- Implementation tasks → goop-executor-{tier} (read tier from blueprint)
- Verification tasks → goop-verifier
- Documentation → goop-writer
- Debugging → goop-debugger

**When to Work Directly:**
- Simple clarifying questions
- Brief status checks
- Trivial one-line fixes
- Coordination decisions

### Delegation Prompt Structure

When delegating, include ALL of these sections:

\`\`\`
 task({
  subagent_type: "[subagent-type]",
  description: "[3-5 word summary]",
  prompt: \`
    ## TASK
    [Specific, atomic goal - ONE action]
    
    ## EXPECTED OUTCOME
    [Concrete deliverables with success criteria]
    
    ## CONTEXT
    - Files: [relevant file paths]
    - Patterns: [existing patterns to follow]
    - Constraints: [technical limitations]
    
    ## MUST DO
    [Exhaustive requirements - leave nothing implicit]
    
    ## MUST NOT DO
    [Forbidden actions - anticipate and block]
    
    ## VERIFICATION
    [How to confirm task completion]
  \`
})
\`\`\`

### Session Continuity

The task tool is stateless. Include any needed context in the prompt and reference previous outputs explicitly.

### Failure Recovery

If delegated task fails (3 consecutive attempts):
1. STOP further attempts
2. Collect failure context
3. Consider: Is this the right agent?
4. If stuck: Escalate to user with full context

### Correct Delegation Example

**Do not** do this (orchestrator using a research tool directly):

\`\`\`
google_search({ query: "best React state management" })
\`\`\`

**Do** this (delegate to goop-researcher):

\`\`\`
task({
  subagent_type: "goop-researcher",
  description: "Research React state management",
  prompt: "## TASK\nResearch React state management options for large applications.\n\n## EXPECTED OUTCOME\n- Compare Redux, Zustand, Jotai, Recoil\n- Provide pros/cons and a recommendation\n\n## VERIFICATION\nInclude citations or source references where possible."
})
\`\`\`
</Delegation_Rules>`;
}

function buildAgentTable(agents: ResolvedResource[]): string {
  if (agents.length === 0) {
    return `| Agent | Purpose |
|-------|---------|
| goop-planner | Creates detailed execution plans |
| goop-executor-high | Implements tasks from plans (fallback tier) |
| goop-verifier | Verifies implementation against requirements |
| goop-debugger | Investigates and fixes bugs |
| goop-researcher | Gathers technology and domain knowledge |
| goop-explorer | Maps codebase structure and patterns |
| goop-writer | Creates documentation |`;
  }

  const rows = agents.map(agent => {
    const name = agent.frontmatter.name || agent.name;
    const desc = agent.frontmatter.description || "Specialized agent";
    return `| ${name} | ${desc} |`;
  });

  return `| Agent | Purpose |
|-------|---------|
${rows.join("\n")}`;
}

function buildToolList(tools: readonly string[]): string {
  return tools.map(tool => `- \`${tool}\``).join("\n");
}

function buildDelegationMappingTable(): string {
  return `| Tool Category | Delegate To | Why |
|---------------|-------------|-----|
| Research/Search | \`${DELEGATION_MAPPINGS.research.agent}\` | ${DELEGATION_MAPPINGS.research.guidance} |
| Exploration | \`${DELEGATION_MAPPINGS.exploration.agent}\` | ${DELEGATION_MAPPINGS.exploration.guidance} |
| Code Implementation | \`goop-executor-{tier}\` | Read tier from blueprint Executor field |
| Planning | \`goop-planner\` | Planning requires focused spec-to-plan reasoning |
| Verification | \`goop-verifier\` | Verification should be independent from implementation |
| Documentation | \`goop-writer\` | Documentation should be delegated when non-trivial |
| Debugging | \`goop-debugger\` | Debugging requires focused hypothesis testing |
`;
}
