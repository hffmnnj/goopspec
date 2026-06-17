---
name: goop-setup
description: Initialize or reconfigure GoopSpec for this project
agent: orchestrator
---

# /goop-setup

First-time setup and configuration wizard.

## Immediate action

Run detection first:

```
goop_setup({ action: "detect" })
```

## If no `.goopspec` directory

1. Ask for project name via `question`.
2. Ask for scope: `both` (Recommended), `project`, or `global`.
3. Ask for MCP preset: `recommended` (Recommended), `core`, or `none`.
4. Ask for memory: `local` (Recommended), `openai`, `ollama`, or disabled.
5. Ask for models: `defaults` (Recommended) or custom.
6. Apply with `goop_setup({ action: "init", ... })`.
7. Verify with `goop_setup({ action: "verify" })`.

## If `.goopspec` already exists

Use `question` to choose:

- **Verify setup (Recommended)** → `goop_setup({ action: "verify" })`
- **Modify configuration** → `goop_setup({ action: "apply", ... })`
- **Reset and start fresh** → `goop_setup({ action: "reset", scope: "project", preserveData: true, confirmed: true })`, then first-time setup
- **View status** → `goop_setup({ action: "status" })`

## Completion

After setup finishes:

> GoopSpec ready. Run `/goop-discuss` to start your first workflow.
