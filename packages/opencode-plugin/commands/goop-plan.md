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

Turn the requirements document into a locked contract (`SPEC.md`) and an executable wave plan (`BLUEPRINT.md`).

## Gate check

Call `goop_state({ action: "get" })`. If `interviewComplete` is not `true` or the `requirements` document does not exist — check via `goop_read_db({ doc_type: "requirements" })` returning content (not a 'not found' message) — return `BLOCKED` with:

> Run `/goop-discuss` first.

## Research-first gate

Research-first gate: see `agents/goop-orchestrator.md` §Research-First Gate (Plan Phase) for the full procedure — dispatch rules, skip heuristic, fallback, mid-wave research, and sequencing. The orchestrator owns this gate; this command invokes it.

## Load references

```
goop_reference({ name: "core-protocol" })
goop_reference({ name: "task-decomposition" })
goop_reference({ name: "phase-gates" })
goop_reference({ name: "pr-creation" })
```

## Steps

1. Read requirements via `goop_read_db({ doc_types: ["requirements"] })`, search memory, and create `PROJECT_KNOWLEDGE_BASE.md` if missing.
2. Complete the Research-first gate above (or record the skip decision in ADL). Then spawn `goop-planner` with the discovery context, current depth, workflow isolation context, and the assembled `## Research Summary` block.
3. Review the draft `SPEC.md` and `BLUEPRINT.md`.

## Validation-contract gate

Before wave decomposition is finalized, validate:

- Every must-have maps to one or more tasks.
- Every task maps to a must-have or an explicit enabler.
- Out-of-scope, assumptions, and risks are captured.
- The wave/task plan has 2–4 tasks per wave and clear verification steps (verified via `goop_read_wave`).
- If atomic PRs enabled (REQUIREMENTS.md `## Atomic PR Strategy` is `Yes`): every wave written via `goop_write_wave` must have `pr_branch` and `pr_url` populated.

If validation fails, send the planner back to fix gaps.

## Lock the spec

Present a contract gate via the `question` tool:

- **Confirm and lock (Recommended)** → `goop_state({ action: "lock-spec" })`, then suggest `/goop-execute`.
- **Amend** → Edit the draft and re-run the gate.
- **Cancel** → Keep the spec unlocked.

## Autopilot

If `workflow.autopilot == true` or `workflow.lazyAutopilot == true`, skip the contract gate confirmation, lock the spec, then immediately call:

```
mcp_slashcommand({ command: "/goop-execute" })
```

## Output

| Document | Tool | Purpose |
|----------|------|---------|
| `spec` | `goop_write_db({ doc_type: "spec", content: "..." })` | Locked contract |
| `blueprint` | `goop_write_db({ doc_type: "blueprint", content: "..." })` | Non-wave planning context (overview, risks, deviation protocol, execution notes, handoff protocol) |
| `chronicle` | `goop_write_db({ doc_type: "chronicle", content: "..." })` | Progress log |
| `PROJECT_KNOWLEDGE_BASE.md` | `Write(...)` | Shared conventions (global, not workflow-scoped) |

## Anti-patterns

- Plan without a completed interview.
- Lock a spec that does not cover every must-have.
- Announce `/goop-execute` without calling `mcp_slashcommand`.
- Produce waves via `goop_write_wave` without `pr_branch`/`pr_url` when atomic PRs are enabled.
- Delegate to the planner before the research gate resolves (unless the skip heuristic fired and the decision was logged to ADL).
