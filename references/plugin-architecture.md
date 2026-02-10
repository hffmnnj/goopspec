# GoopSpec Plugin Architecture

This reference documents the plugin's tools, hooks, and features. Load this to understand how the plugin supports your work.

---

## Design Philosophy

- **Memory-First**: Search before acting, save after completing
- **State-Aware**: Check phase and gates before executing
- **Phase Enforcement**: Actions are validated against workflow state
- **Context Injection**: Relevant memory injected into every LLM call

## Workflow Phases

```
idle → plan → research → specify → execute → accept → archive
```

## Key Directories

| Directory | Purpose |
|-----------|---------|
| `.goopspec/` | Project state, specs, blueprints, chronicles |
| `src/tools/` | MCP tool implementations |
| `src/hooks/` | Event handlers for lifecycle |
| `src/features/` | Feature modules (state, memory, enforcement) |

---

## Available Tools

### Workflow/State Tools

| Tool | Purpose | Key Parameters |
|------|---------|----------------|
| `goop_status` | Shows workflow state, phase, progress, pending tasks | `verbose` (boolean) |
| `goop_setup` | Configures plugin, initializes projects | `action` (detect/init/plan/apply/verify/reset/models/status), `scope`, `projectName` |
| `goop_adl` | Manages Automated Decision Log entries | `action` (read/append), `type` (decision/deviation/observation), `description`, `entry_action`, `rule`, `files` |
| `goop_checkpoint` | Manages execution checkpoints for pause/resume | `action` (save/load/list), `id`, `context` (JSON) |
| `goop_spec` | Reads/validates SPEC.md and PLAN.md files | `action` (read/list/validate), `phase`, `file` (spec/plan/both) |

### Agent/Resource Tools

| Tool | Purpose | Key Parameters |
|------|---------|----------------|
| `goop_delegate` | Prepares task for specialized agent with context injection | `agent`, `prompt`, `context`, `list` (boolean), `session_id` |
| `goop_skill` | Loads step-by-step skill guidance | `name`, `list` (boolean) |
| `goop_reference` | Loads protocols, checklists, templates | `name`, `type` (reference/template/all), `section`, `list` (boolean) |
| `slashcommand` | Executes GoopSpec slash commands | `command` (string, e.g., "/goop-plan help") |

### Memory Tools

| Tool | Purpose | Key Parameters |
|------|---------|----------------|
| `memory_save` | Saves structured info to persistent memory | `title` (required), `content` (required), `type` (observation/decision/note/todo), `facts`, `concepts`, `importance` (1-10), `sourceFiles` |
| `memory_search` | Hybrid semantic+keyword search across memories | `query` (required), `limit` (1-20), `types`, `concepts`, `minImportance` |
| `memory_note` | Quick observation capture (simplified save) | `note` (required), `concepts` |
| `memory_decision` | Records architectural decisions with structure | `decision` (required), `reasoning` (required), `alternatives`, `impact` (low/medium/high), `concepts` |
| `memory_forget` | Deletes memories by ID or query | `id`, `query`, `confirm` (required for query-based) |
| `session_search` | Searches past session history logs | `query`, `recent` (boolean), `limit`, `types` (tool_call/phase_change/etc), `startDate`, `endDate` |

---

## Hook System

| Hook | Trigger | Effect |
|------|---------|--------|
| `chat.message` | User sends message | Updates `workflow.lastActivity`, captures significant prompts to memory |
| `tool.execute.before` | Before tool runs | Caches arguments for post-execution analysis, tracks file states |
| `tool.execute.after` | After tool completes | **Phase transitions**, memory capture, orchestrator enforcement, auto-progression, code quality warnings |
| `event` | Session lifecycle (created/idle/deleted) | Continuation enforcer, session summaries, idle detection |
| `permission.ask` | File permission request | **Blocks orchestrator from writing code** - denies file modifications in protected dirs |
| `experimental.chat.system.transform` | Before LLM call | **Injects phase rules and relevant memories into system prompt** |

### Critical Behaviors

- **`tool.execute.after`**: Auto-progresses phases when conditions met (e.g., execute → accept when all waves complete)
- **`permission.ask`**: Enforces the "Orchestrator vs Executor" boundary - orchestrator CANNOT write implementation files
- **`system.transform`**: Injects `<goopspec_context>` block with current state, phase rules, and relevant memories

---

## Feature Modules

| Feature | Location | Purpose |
|---------|----------|---------|
| **State Manager** | `src/features/state-manager/` | Central workflow persistence - phases, waves, ADL, checkpoints |
| **Memory System** | `src/features/memory/` | Persistent semantic memory with SQLite + vector storage |
| **Enforcement** | `src/features/enforcement/` | Phase-based action validation, file write blocking, required docs |
| **Parallel Research** | `src/features/parallel-research/` | Concurrent multi-agent research orchestration |
| **Mode Detection** | `src/features/mode-detection/` | Analyzes prompts to suggest quick/standard/comprehensive mode |
| **Routing** | `src/features/routing/` | Maps task descriptions to appropriate agent categories |
| **Archive** | `src/features/archive/` | Milestone archival, learnings extraction, retrospectives |
| **Workflow Memory** | `src/features/workflow-memory/` | Phase-specific memory retrieval optimization |
| **Setup** | `src/features/setup/` | Environment detection, config management, MCP setup |

---

## Integration Patterns

### Memory-First Pattern

Always search memory before starting work, save learnings after:

```
1. memory_search({ query: "[current task]", limit: 5 })  # Check what we know
2. ... do work ...
3. memory_save/memory_decision/memory_note({ ... })      # Persist learnings
```

### State-Aware Pattern

Check state before taking actions:

```
1. goop_status()                    # Know current phase, gates, progress
2. Read(".goopspec/state.json")     # Direct state access if needed
3. Check phase allows intended action
```

### Phase Enforcement

Hooks automatically enforce what's allowed in each phase:

| Phase | Allowed Actions |
|-------|-----------------|
| `idle` | Any action allowed |
| `plan` | Can create plans, cannot execute |
| `specify` | Can lock spec, cannot execute |
| `execute` | Can write code, must align to spec |
| `accept` | Verification only, no new features |

### Delegation Lifecycle

How orchestrator delegates to specialized agents:

```
1. goop_delegate({ agent: "goop-executor-{tier}", prompt: "...", context: "..." })
2. Returns <goop_delegation> with prepared payload
3. Orchestrator uses task() tool with the delegation
4. Subagent executes, returns XML envelope response
5. Orchestrator parses response, updates state/chronicle
```

---

## Tool Quick Reference by Role

| Agent | Primary Tools | When to Use |
|-------|---------------|-------------|
| **Orchestrator** | `goop_status`, `goop_checkpoint`, `slashcommand`, `goop_delegate` | Coordination, delegation, phase management |
| **Executor** | `goop_spec`, `goop_adl`, `memory_save`, `memory_note` | Implementation, deviation logging, discovery capture |
| **Planner** | `goop_spec`, `goop_reference`, `memory_decision` | Architecture decisions, template loading |
| **Researcher** | `memory_save`, `memory_search`, `goop_skill`, `session_search` | Research persistence, prior work discovery |
| **Verifier** | `goop_spec`, `goop_reference`, `memory_save`, `goop_adl` | Spec validation, security checklist, gap logging |
| **Explorer** | `memory_save`, `memory_note`, `session_search` | Pattern cataloging, codebase insights |
| **Debugger** | `goop_checkpoint`, `memory_search`, `memory_decision` | State snapshots, prior bugs, fix decisions |
| **Designer** | `memory_search`, `memory_save`, `goop_skill` | Design patterns, component specs |
| **Tester** | `memory_search`, `memory_save`, `goop_skill` | Test patterns, coverage findings |
| **Writer** | `memory_search`, `memory_save`, `goop_reference` | Doc conventions, templates |
| **Librarian** | `memory_search`, `memory_save`, `session_search` | Prior findings, synthesized results |
| **Memory Distiller** | `session_search`, `memory_save` | Raw events → structured memories |

---

## Common Tool Patterns

### Starting a Session

```
goop_status()                                    # Current state
memory_search({ query: "[task]", limit: 5 })     # Prior context
Read(".goopspec/SPEC.md")                        # Requirements
Read(".goopspec/BLUEPRINT.md")                   # Plan
```

### Ending a Session

```
memory_save({ title: "...", content: "...", type: "observation" })
goop_checkpoint({ action: "save", id: "session-end" })
```

### Recording a Decision

```
memory_decision({
  decision: "Use Vitest for testing",
  reasoning: "Better Bun integration, faster execution",
  alternatives: ["Jest", "Mocha"],
  impact: "high"
})
```

### Logging a Deviation

```
goop_adl({
  action: "append",
  type: "deviation",
  description: "Changed API structure from spec",
  entry_action: "Modified endpoint to accept array instead of object",
  files: ["src/api/handler.ts"]
})
```

---

## Version

Plugin Architecture Reference v0.2.6
