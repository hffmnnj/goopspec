# GoopSpec Plugin Architecture

Reference for tools, hooks, and phase-aware behavior.

## Design Principles

- Memory-first: search before acting, save after.
- State-aware: enforce phase and gates.
- Orchestrator delegates implementation.
- System transform injects targeted context.

## Workflow Phases

`idle -> plan -> research -> specify -> execute -> accept -> archive`

## Key Paths

- `.goopspec/`: state and planning docs
- `src/tools/`: MCP tools
- `src/hooks/`: lifecycle hooks
- `src/features/`: state, memory, enforcement, routing

## Tool Groups

### Workflow

- `goop_status`: phase, gates, progress
- `goop_state`: safe workflow state operations
- `goop_spec`: read/validate SPEC + BLUEPRINT
- `goop_checkpoint`: pause/resume continuity
- `goop_adl`: decision/deviation logging

### Delegation and Resources

- `goop_delegate`: prepare agent task payloads
- `goop_skill`: load skills
- `goop_reference`: load references/templates
- `slashcommand`: execute `/goop-*`

### Memory

- `memory_search`, `memory_save`, `memory_note`, `memory_decision`, `memory_forget`, `session_search`

## Hook Responsibilities

- `tool.execute.after`: phase transitions, auto-progression, memory capture.
- `permission.ask`: enforces orchestrator vs executor write boundary.
- `experimental.chat.system.transform`: injects enforcement + memory context.
- `event`: session lifecycle and continuity checks.

## Core Feature Modules

- `state-manager`: workflow persistence
- `memory`: semantic memory + retrieval
- `enforcement`: gate/rule enforcement
- `routing`: task-to-agent mapping
- `parallel-research`: concurrent research orchestration
- `archive`: milestone archival and learnings extraction

## Standard Patterns

### Memory-first

1. `memory_search`
2. execute task
3. `memory_save`/`memory_decision`

### State-aware

1. `goop_status` or `goop_state({ action: "get" })`
2. verify phase/gate
3. proceed or block

### Delegation lifecycle

1. `goop_delegate`
2. subagent executes
3. XML response parsed
4. state + chronicle updated

## Quick Role Mapping

- Orchestrator: coordination and delegation
- Executor: code implementation
- Verifier: requirement validation
- Researcher/Explorer: external + codebase discovery

## Session Start/End

- Start: state + memory + SPEC/BLUEPRINT.
- End: persist learnings + save checkpoint when needed.

*Plugin Architecture Reference*
