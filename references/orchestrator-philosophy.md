# Orchestrator Philosophy

The GoopSpec orchestrator follows a strict "Conductor, Not Player" philosophy. The orchestrator coordinates work but never performs specialized tasks directly.

## Core Principle

> The orchestrator is a CONDUCTOR - it coordinates but never plays the instruments.

This principle exists because:
1. **Context Preservation**: The orchestrator's context is precious and should be reserved for coordination
2. **Specialization**: Subagents have specialized capabilities and fresh context for their tasks
3. **Consistency**: Enforced delegation ensures predictable, reliable behavior

---

## Enforcement Rules

### Hard Blocks (Permission Denied)

The following tools are **blocked** for the orchestrator. Attempting to use them will be denied with guidance to delegate.

#### Research/Search Tools

These tools are blocked because research requires specialized context and tools:

| Tool | Delegate To | Rationale |
|------|-------------|-----------|
| `exa_web_search_exa` | goop-researcher | Web search pollutes orchestrator context |
| `exa_company_research_exa` | goop-researcher | Company research is specialized |
| `exa_get_code_context_exa` | goop-researcher | External code context lookup |
| `mcp_google_search` | goop-researcher | General web search |
| `google_search` | goop-researcher | General web search |
| `context7_resolve-library-id` | goop-researcher | Library documentation lookup |
| `context7_query-docs` | goop-researcher | Library documentation queries |
| `mcp_context7_resolve-library-id` | goop-researcher | Library documentation lookup |
| `mcp_context7_query-docs` | goop-researcher | Library documentation queries |
| `webfetch` | goop-researcher | URL content fetching |
| `mcp_webfetch` | goop-researcher | URL content fetching |

#### Code Modification Tools

These tools are blocked for code files in implementation directories:

| Tool | Delegate To | Rationale |
|------|-------------|-----------|
| `edit` | goop-executor-{tier} | Code changes need fresh context |
| `mcp_edit` | goop-executor-{tier} | Code changes need fresh context |
| `write` | goop-executor-{tier} | New file creation is implementation |
| `mcp_write` | goop-executor-{tier} | New file creation is implementation |

**Note**: These tools are allowed for planning files (.goopspec/, markdown, config).

### Soft Nudges (Non-Blocking)

The following tools trigger a suggestion to delegate but are not blocked:

#### Exploration Tools

| Tool | Delegate To | When Nudged |
|------|-------------|-------------|
| `mcp_grep` | goop-explorer | After 3+ uses in 1 minute |
| `mcp_glob` | goop-explorer | After 3+ uses in 1 minute |
| `grep` | goop-explorer | After 3+ uses in 1 minute |
| `glob` | goop-explorer | After 3+ uses in 1 minute |

The orchestrator may use these for quick lookups, but extensive exploration should be delegated.

---

## Delegation Mapping

| Task Type | Agent | When to Use |
|-----------|-------|-------------|
| Research | `goop-researcher` | Any information gathering, comparison, evaluation |
| Exploration | `goop-explorer` | Codebase navigation, finding files/functions |
| Implementation | `goop-executor-{tier}` | Any code changes, new features |
| Debugging | `goop-debugger` | Bug investigation, root cause analysis |
| Testing | `goop-tester` | Writing and running tests |
| Documentation | `goop-writer` | README, API docs, guides |

---

## Intent Detection

The orchestrator automatically detects certain intents and suggests delegation:

### Research Intent Patterns

- "research", "compare", "evaluate", "investigate"
- "find out about", "what is the best", "which library"
- "how does X compare", "pros and cons", "recommend"

### Exploration Intent Patterns

- "find where", "where is", "how does X work"
- "trace", "locate", "what calls", "who uses"
- "show me the code/implementation"

---

## Correct Delegation Examples

### Research Task

**Wrong:**
```
mcp_google_search({ query: "best React testing libraries 2024" })
```

**Right:**
```
task({
  subagent_type: "goop-researcher",
  description: "Research React testing libraries",
  prompt: `
    Research the best React testing libraries for 2024.
    
    Compare: Jest, Vitest, React Testing Library, Playwright
    
    Criteria: performance, DX, community support, maintenance
    
    Return: Recommendation with pros/cons matrix.
  `
})
```

### Exploration Task

**Wrong:**
```
// Multiple grep/glob calls to find something
mcp_grep({ pattern: "handleAuth" })
mcp_glob({ pattern: "**/*auth*.ts" })
mcp_grep({ pattern: "useAuth" })
```

**Right:**
```
task({
  subagent_type: "goop-explorer",
  description: "Map authentication system",
  prompt: `
    Find all authentication-related code in this codebase.
    
    Look for:
    - Auth handlers and middleware
    - Auth hooks and utilities
    - Auth configuration
    
    Return: File paths with brief description of each component.
  `
})
```

### Implementation Task

**Wrong:**
```
mcp_edit({
  filePath: "src/components/Button.tsx",
  oldString: "...",
  newString: "..."
})
```

**Right:**
```
task({
  subagent_type: "goop-executor-high",
  description: "Update Button component",
  prompt: `
    Modify: src/components/Button.tsx
    
    Changes:
    - Add variant prop (primary, secondary, outline)
    - Update styles for each variant
    - Add TypeScript types
    
    Follow existing component patterns in the codebase.
  `
})
```

---

## ADL Logging

All blocked operations are logged to the Automated Decision Log (ADL) with:
- Timestamp
- Tool that was blocked
- Suggested delegation target
- Rule number (Rule 4: architectural decision)

This creates an audit trail of enforcement actions.

---

## Configuration

Enforcement can be configured in the plugin context:

| Setting | Default | Description |
|---------|---------|-------------|
| `codeBlockingEnabled` | `true` | Block code file modifications |
| `researchBlockingEnabled` | `true` | Block research tools |
| `explorationNudgesEnabled` | `true` | Show exploration nudges |
| `delegationEnforcementEnabled` | `true` | Enforce delegation follow-through |

---

*Philosophy derived from GoopSpec v0.2.8*
*"The conductor leads the orchestra but doesn't play the instruments."*
