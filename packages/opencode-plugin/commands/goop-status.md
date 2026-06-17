---
name: goop-status
description: Show current GoopSpec workflow status and next step
agent: orchestrator
---

# /goop-status

Display the current workflow state and suggest the next command.

## Immediate action

Call the status tool directly:

```
goop_status({ verbose: true })
```

## What to show

- Active workflow and phase.
- Gate status: `interviewComplete`, `specLocked`, `allWavesComplete`.
- Current wave and total waves.
- Pending blockers or deviations.
- Suggested next command based on state.

## Suggested next commands

| State | Next command |
|-------|--------------|
| No `.goopspec` | `/goop-setup` |
| Interview incomplete | `/goop-discuss` |
| Interview done, no locked spec | `/goop-plan` |
| Spec locked | `/goop-execute` |
| Executing | `/goop-execute` |
| All waves complete | `/goop-accept` |
| Accepted | `/goop-discuss` |

## Anti-patterns

- Guess state instead of reading it.
- Suggest a command that the current gate does not allow.
