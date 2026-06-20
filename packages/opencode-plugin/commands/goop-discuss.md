---
name: goop-discuss
description: Capture user vision through the six-category discovery interview
agent: orchestrator
argument-hint: "[workflow-id]"
phase: discuss
next-step: "When discovery is complete, run /goop-plan"
next-command: /goop-plan
alternatives:
  - command: /goop-quick
    when: "For a small, single-file fix that needs no interview"
---

# /goop-discuss

Start the discovery interview. Capture vision, must-haves, constraints, out-of-scope items, assumptions, and risks before planning.

## Immediate action

Load the interview protocol first:

```
goop_reference({ name: "discovery-interview" })
```

## Steps

1. Check current state with `goop_state({ action: "get" })`.
2. If a `workflow-id` is provided, create and bind it via `goop_state`:
   - `goop_state({ action: "create-workflow", workflowId: "<id>" })`
   - `goop_state({ action: "set-active-workflow", workflowId: "<id>" })`
3. Ask all seven discovery categories (vision, must-haves, constraints, out-of-scope, assumptions, risks, and atomic PR preference) directly. Use the `question` tool for structured answers; mark exactly one option `(Recommended)`.
4. After the vision answer, infer a kebab-case `workflowId` if one was not supplied, then create and bind it before any file writes.
5. Probe until each category has specifics. Empty must-haves, out-of-scope, or risks are invalid.
6. Summarize and confirm with the user.
7. Write REQUIREMENTS.md via `goop_write_db({ doc_type: "requirements", content: "..." })` and call `goop_state({ action: "complete-interview" })`. The tool renders the markdown sidecar automatically.
   > REQUIREMENTS.md must include a `## Atomic PR Strategy` section.
8. Suggest `/goop-plan`.

## Lazy autopilot

If `workflow.lazyAutopilot == true`, infer all six categories from the user's prompt, skip the `question` tool, write REQUIREMENTS.md via `goop_write_db({ doc_type: "requirements", content: "..." })`, then immediately call:

- Infer atomic PR preference as `Yes` (one PR per wave) unless the user's prompt explicitly opts out. Include `## Atomic PR Strategy: Yes — one PR per wave` in the inferred REQUIREMENTS.md.

```
mcp_slashcommand({ command: "/goop-plan" })
```

## Anti-patterns

- Skip the six categories.
- Start writing files before the workflow is bound.
- Announce a transition without calling `mcp_slashcommand`.
- Write REQUIREMENTS.md without a `## Atomic PR Strategy` section.
