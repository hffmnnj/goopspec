---
name: goop-discuss
description: Capture user vision through the six-category discovery interview
agent: orchestrator
argument-hint: "[workflow-id]"
phase: discuss
requires: none
next-step: "When discovery is complete, run /goop-plan"
next-command: /goop-plan
alternatives:
  - command: /goop-quick
    when: "For a small, single-file fix that needs no interview"
---

# /goop-discuss

Start the discovery interview. Capture vision, must-haves, constraints, out-of-scope items, assumptions, and risks before planning.

> **This command ALWAYS starts a brand-new workflow.** Never reuse or append to the current or last active workflow. Every `/goop-discuss` invocation creates a fresh workflowId, a new git branch, and ultimately a new PR.

## Immediate action

Load the interview protocol first:

```
goop_reference({ name: "discovery-interview" })
```

> **Do not load any documents (via `goop_boot`, `goop_read_db`, or any other tool) at the start of this command — no spec, blueprint, chronicle, or requirements from any workflow. This is a state-only boot; a brand-new discovery has no use for prior planning content.** The reference load above is fine — only document loads are forbidden.

## Steps

1. **Create and activate a new workflow in a single call** — do not reuse the active one, and do not split this into a separate `create-workflow` + `set-active-workflow` pair. Infer a kebab-case `workflowId` from the user's prompt (or use the supplied `workflow-id` argument), then:
   - `goop_state({ action: "create-workflow", workflowId: "<new-id>", activate: true })`
   - Trust a successful response and move to step 2 immediately. Do not regenerate the ID or repeat this call — see `references/core-protocol.md` §Trust Successful Tool Results for why repeating an already-succeeded state call is a bug, not a safety measure.
2. **Checkout a new git branch** named after the workflowId before any file writes:
   - `git checkout -b <workflowId>`
   - All implementation work for this workflow happens on this branch. Agents must never switch branches mid-workflow or work across multiple branches simultaneously.
3. Ask all seven discovery categories (vision, must-haves, constraints, out-of-scope, assumptions, risks, and atomic PR preference) directly. Use the `question` tool for structured answers; mark exactly one option `(Recommended)`.
4. Probe until each category has specifics. Empty must-haves, out-of-scope, or risks are invalid.
5. Summarize and confirm with the user.
6. Write REQUIREMENTS.md via `goop_write_db({ doc_type: "requirements", content: "..." })` and call `goop_state({ action: "complete-interview" })`. The tool renders the markdown sidecar automatically.
   > REQUIREMENTS.md must include a `## Atomic PR Strategy` section.
7. Remind the user that with Atomic PRs, one PR is opened per wave during `/goop-execute`, and `/goop-accept` will offer to merge the full stack in order.
8. Suggest `/goop-plan`. Note: `/goop-plan` now begins with a **research-first gate** — the orchestrator auto-dispatches `goop-researcher` (and optionally `goop-explorer`) before delegating to the planner. Trivial workflows (≤ 2 files, no domain unknowns) may skip the research pass, with the decision logged to ADL.

## Lazy autopilot

If `workflow.lazyAutopilot == true`, infer all six categories from the user's prompt, skip the `question` tool, then:

1. Create and activate a **new** workflowId in a single call (never reuse the active workflow): `goop_state({ action: "create-workflow", workflowId: "<new-id>", activate: true })`.
2. Checkout a new git branch: `git checkout -b <workflowId>`.
3. Write REQUIREMENTS.md via `goop_write_db({ doc_type: "requirements", content: "..." })`.
   - Infer atomic PR preference as `Yes` (one PR per wave) unless the user's prompt explicitly opts out. Include `## Atomic PR Strategy: Yes — one PR per wave` in the inferred REQUIREMENTS.md.
4. Immediately call:

```
mcp_slashcommand({ command: "/goop-plan" })
```

## PR lifecycle

- All commits for this workflow land on per-wave branches stacked on each other.
- With Atomic PRs = Yes, a PR is opened for each wave during `/goop-execute` (Wave N → Wave N-1; Wave 1 → main) — not all at `/goop-accept`.
- `/goop-accept` presents the full PR stack summary and offers to merge the PRs in order. Never merge before acceptance is confirmed.

## Anti-patterns

- Reusing or appending to the current active workflow instead of creating a new one.
- Repeating `create-workflow`/`set-active-workflow` calls, or regenerating the workflowId, after a call already returned success. Verify with `goop_status` or `goop_state({ action: "get" })` if genuinely uncertain — never blindly retry a successful mutation.
- Starting work on `main` or the previous workflow's branch.
- Start writing files before the workflow is bound and the branch is checked out.
- Loading any document (via `goop_boot`, `goop_read_db`, or any other tool) at discovery start — stale planning content from any workflow is irrelevant to a fresh discovery.
- Write REQUIREMENTS.md without a `## Atomic PR Strategy` section.
