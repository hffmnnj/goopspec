---
name: goop-plan
description: Create the locked specification and wave blueprint
agent: orchestrator
phase: plan
requires: interview_complete
next-step: "When the contract gate is satisfied, run /goop-execute"
next-command: /goop-execute
alternatives:
  - command: /goop-discuss
    when: "If the discovery interview has not been completed"
---

# /goop-plan

Turn `REQUIREMENTS.md` into a locked contract (`SPEC.md`) and an executable wave plan (`BLUEPRINT.md`).

## Gate check

Call `goop_state({ action: "get" })`. If `interviewComplete` is not `true` or `REQUIREMENTS.md` is missing, return `BLOCKED` with:

> Run `/goop-discuss` first.

## Load references

```
goop_reference({ name: "core-protocol" })
goop_reference({ name: "task-decomposition" })
goop_reference({ name: "phase-gates" })
```

## Steps

1. Read `REQUIREMENTS.md`, search memory, and create `PROJECT_KNOWLEDGE_BASE.md` if missing.
2. Spawn `goop-planner` with the discovery context, current depth (`shallow`/`standard`/`deep`), and workflow isolation context.
3. Review the draft `SPEC.md` and `BLUEPRINT.md`.

## Validation-contract gate

Before wave decomposition is finalized, validate:

- Every must-have maps to one or more tasks.
- Every task maps to a must-have or an explicit enabler.
- Out-of-scope, assumptions, and risks are captured.
- The blueprint has 2–4 tasks per wave and clear verification steps.

If validation fails, send the planner back to fix gaps.

## Lock the spec

Present a contract gate via the `question` tool:

- **Confirm and lock (Recommended)** → `goop_state({ action: "lock-spec" })`, then suggest `/goop-execute`.
- **Amend** → Edit the draft and re-run the gate.
- **Cancel** → Keep the spec unlocked.

## Autopilot

If `workflow.autopilot == true`, skip the contract gate confirmation, lock the spec, then immediately call:

```
mcp_slashcommand({ command: "/goop-execute" })
```

## Output

| File | Purpose |
|------|---------|
| `.goopspec/<workflowId>/SPEC.md` | Locked contract |
| `.goopspec/<workflowId>/BLUEPRINT.md` | Wave/task plan |
| `.goopspec/<workflowId>/CHRONICLE.md` | Progress log |
| `.goopspec/PROJECT_KNOWLEDGE_BASE.md` | Shared conventions |

## Anti-patterns

- Plan without a completed interview.
- Lock a spec that does not cover every must-have.
- Announce `/goop-execute` without calling `mcp_slashcommand`.
