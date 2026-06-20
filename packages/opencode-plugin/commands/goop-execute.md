---
name: goop-execute
description: Run wave-based implementation through delegated executor agents
agent: orchestrator
phase: execute
requires: spec_locked
next-step: "When all waves are verified, run /goop-accept"
next-command: /goop-accept
alternatives:
  - command: /goop-amend
    when: "If the spec needs to change mid-execution"
---

# /goop-execute

Implement the blueprint one wave at a time. The orchestrator delegates all implementation to executor agents.

## Gate check

Call `goop_state({ action: "get" })`. If `specLocked` is not `true` or the `blueprint` document does not exist — check via `goop_read_db({ doc_type: "blueprint" })` returning content (not a 'not found' message) — return `BLOCKED` with:

> Run `/goop-plan` first.

## Load references

```
goop_reference({ name: "dispatch-patterns" })
goop_reference({ name: "core-protocol" })
```

## Steps

1. Read `goop_read_db({ doc_types: ["spec", "blueprint", "chronicle"] })` and `PROJECT_KNOWLEDGE_BASE.md`.
2. For each wave:
   - Delegate tasks to the right executor tier via `task()`:
     - `goop-executor-low` for mechanical edits.
     - `goop-executor-medium` for business logic.
     - `goop-executor-high` for complex or architectural work.
     - `goop-executor-frontend` for UI/UX work.
   - Use sequential dispatch for shared files; parallel dispatch for independent tasks.
   - Require every task to return `STATUS`, `SUMMARY`, `ARTIFACTS`, `VERIFICATION`, `NEXT`.
3. Apply the four-rule deviation system from `phase-gates`. Log every deviation to `ADL.md` via `goop_adl`.
4. Verify the wave before calling `goop_state({ action: "update-wave", currentWave: N, totalWaves: M })`.
5. If Atomic PRs = Yes: immediately open a PR for the verified wave against the previous branch (Wave N → Wave N-1; Wave 1 → main) via `gh pr create` or `goop_create_pr`. Do not wait for it to merge. Then create the Wave N+1 branch from the current wave's branch and continue. Show the PR URL in the checkpoint.
6. Save a checkpoint at wave boundaries.

## Completion

When all waves are complete, immediately call:

```
mcp_slashcommand({ command: "/goop-accept" })
```

## Anti-patterns

- Skip the spec lock gate.
- Let the orchestrator write implementation files.
- Update `update-wave` before verifying the wave.
- Announce `/goop-accept` without calling `mcp_slashcommand`.
- Wait for a wave's PR to merge before starting the next wave — stack instead.
