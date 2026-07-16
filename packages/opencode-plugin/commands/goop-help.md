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

```
discuss -> plan -> execute -> accept -> confirm
```

- **discuss** — capture intent and constraints.
- **plan** — lock the contract and decompose into waves.
- **execute** — implement through delegated agents.
- **accept** — verify and gain explicit approval.
- **confirm** — archive and extract learnings.

## Agents

The orchestrator delegates to 13 specialized agents:

- `goop-orchestrator` — workflow conductor.
- `goop-planner` — spec and blueprint authoring.
- `goop-executor-low` — mechanical edits and scaffolding.
- `goop-executor-medium` — business logic.
- `goop-executor-high` — complex and architectural work.
- `goop-executor-frontend-low` — UI mechanical tasks.
- `goop-executor-frontend-medium` — UI moderate component work.
- `goop-executor-frontend-high` — design-sensitive UI work.
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
