---
name: goop-help
description: List GoopSpec commands, workflow phases, and agents
agent: orchestrator
---

# /goop-help

Show available commands and workflow overview.

## Available commands

| Command | Purpose |
|---------|---------|
| `/goop-discuss [workflow-id]` | Start the discovery interview |
| `/goop-plan` | Create locked spec and blueprint |
| `/goop-execute` | Execute blueprint waves |
| `/goop-accept` | Verify, accept, and archive |
| `/goop-quick [task]` | Fast-track a small task |
| `/goop-amend [change]` | Propose changes to a locked spec |
| `/goop-status` | Show current workflow status |
| `/goop-setup` | Setup and configuration wizard |
| `/goop-help` | Show this help |

## Five-phase workflow

See `references/core-protocol.md` §Five-Phase Workflow for the full phase table and gate semantics.

## Agents

The orchestrator delegates to 13 specialized agents:

- `goop-orchestrator` — workflow conductor.
- `goop-planner` — spec and blueprint authoring.
- `goop-executor-low` — mechanical/pattern-following edits; escalate if hidden complexity.
- `goop-executor-medium` — standard implementation work; default when a task isn't clearly mechanical or complex/critical.
- `goop-executor-high` — architecture-sensitive or security-critical work; use when genuinely warranted.
- `goop-executor-frontend-low` — UI mechanical tasks; escalate if hidden complexity.
- `goop-executor-frontend-medium` — standard UI component work; default when UI work isn't clearly mechanical or design/architectural.
- `goop-executor-frontend-high` — deep design or UI-architecture work; use when genuinely warranted.
- `goop-researcher` — domain and technology research.
- `goop-explorer` — codebase mapping.
- `goop-verifier` — spec compliance and security audit.
- `goop-tester` — tests and QA.
- `goop-debugger` — scientific debugging.
- `goop-writer` — documentation.

## Auto-routed intents

Saying "research X" or "debug Y" does not require a dedicated command. The orchestrator routes these to `goop-researcher` or `goop-debugger` automatically.

## Next step

Run `/goop-discuss` to begin, or `/goop-status` to see where you are.
