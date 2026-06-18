---
name: goop-amend
description: Propose changes to a locked specification
agent: orchestrator
phase: plan/execute
requires: spec_locked
next-step: "Return to /goop-execute to implement amended scope"
next-command: /goop-execute
---

# /goop-amend

Change a locked spec responsibly. A locked contract cannot be edited silently.

## Gate check

Call `goop_state({ action: "get" })`. If `specLocked` is not `true`, return `BLOCKED` with:

> Run `/goop-plan` first.

## Load references

```
goop_reference({ name: "phase-gates" })
goop_reference({ name: "core-protocol" })
```

## Steps

1. Load the current spec via `goop_spec`.
2. Analyze impact: scope added/removed, risk, timeline, affected waves.
3. Present options via `question`:
   - **Confirm amendment (Recommended)** → update `SPEC.md` and `BLUEPRINT.md`.
   - **Defer** → add to a future milestone/task.
   - **Cancel** → abort.
4. On confirm:
   - Append an amendment entry to `SPEC.md`.
   - Adjust tasks in `BLUEPRINT.md`.
   - Log to `ADL.md` via `goop_adl`.
   - Record rationale with `memory_decision`.
5. If the change adds work, return to `/goop-execute`.

## Anti-patterns

- Edit a locked spec without going through this process.
- Skip the ADL log or impact analysis.
