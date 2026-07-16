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

Before delegating to `goop-planner`, run a research pass to ground the plan in facts. Skip only for provably trivial work.

### Default behavior

Dispatch `goop-researcher` to explore the problem domain and relevant codebase surfaces. For complex, multi-domain, or architectural work, dispatch `goop-explorer` in parallel with the researcher. **Planner delegation is blocked until research returns `STATUS: complete`.**

After research completes, assemble the planner payload:

```
goop_search_notes({ query: "[workflow topic]", limit: 10 })
```

Filter to notes with importance ≥ 6. Format them into a `## Research Summary` block (list of findings with `fn_` IDs) and include it in the `goop-planner` delegation prompt.

### Skip heuristic (trivial workflows)

Skip pre-plan research when **ALL** of the following are true:

- The requirements describe a change to ≤ 2 files with no domain or technology unknowns.
- No new libraries, patterns, or architectural decisions are involved.
- `REQUIREMENTS.md` has ≤ 10 bullet points total.

**When in doubt, run research.** Log every skip decision via `goop_adl` with the heuristic trigger and justification.

### Fallback

If the researcher returns `STATUS: blocked`, warn the user and allow them to explicitly proceed without research. Log the exception to ADL before continuing.

### Sequencing

```
discovery gate → research (or skip + ADL log) → assemble Research Summary → planner delegation → contract gate → spec lock
```

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
- The blueprint has 2–4 tasks per wave and clear verification steps.
- If atomic PRs enabled (REQUIREMENTS.md `## Atomic PR Strategy` is `Yes`): every wave in BLUEPRINT.md must have `**PR:** <title>` and `**Branch:** <name>` fields.

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
| `blueprint` | `goop_write_db({ doc_type: "blueprint", content: "..." })` | Wave/task plan |
| `chronicle` | `goop_write_db({ doc_type: "chronicle", content: "..." })` | Progress log |
| `PROJECT_KNOWLEDGE_BASE.md` | `Write(...)` | Shared conventions (global, not workflow-scoped) |

## Anti-patterns

- Plan without a completed interview.
- Lock a spec that does not cover every must-have.
- Announce `/goop-execute` without calling `mcp_slashcommand`.
- Produce a BLUEPRINT.md without `**PR:**` and `**Branch:**` wave fields when atomic PRs are enabled.
- Delegate to the planner before the research gate resolves (unless the skip heuristic fired and the decision was logged to ADL).
