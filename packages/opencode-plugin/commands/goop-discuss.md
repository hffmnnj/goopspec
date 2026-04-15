---
name: goop-discuss
description: Capture user vision through discovery interview before planning
argument-hint: "[session-name]"
phase: discuss
next-step: "When discovery is complete, create the blueprint"
next-command: /goop-plan
alternatives:
  - command: /goop-research
    when: "If there are unknowns to investigate first"
  - command: /goop-quick
    when: "For small, single-file tasks that don't need planning"
---

# /goop-discuss

**Start the Discovery Interview.** Capture vision, requirements, constraints, and risks before planning.

### STOP-AND-RETURN

**STOP. Execute this tool call NOW before reading anything else:**
```
goop_reference({ name: "discuss-process" })
```

**Then follow the process from that reference.** Do not process user messages until you have loaded and understood the protocol.

## Quick Summary

**You conduct the interview directly.** Do NOT spawn agents for conversation.

If the command includes a session name (example: `/goop-discuss feat-auth`), create and bind that session before starting the interview:
- Call `createSession(projectDir, "feat-auth")`
- Call `setSession(ctx, "feat-auth")`
- Continue the interview within the bound session scope

**Exception:** After the vision question, you offer opt-in creative brainstorming with The Visionary (`goop-creative`). This is the only agent delegation during the interview.

### The Six Questions

Use the `question` tool with category-specific options for each discovery question. Always include a "Type your own answer" option. Adapt labels to the user's project context.

1. **Vision** — What are you building? What problem? Who for?
   - Options: "New feature for an existing app (Recommended)", "Bug fix or improvement", "New standalone project", "Refactor or migration", custom
2. **Must-Haves** — Non-negotiable requirements and acceptance criteria
   - Options: "Add a new must-have requirement (Recommended)", "Review what we have so far", "That covers the must-haves", custom
   - Loop until the user selects "That covers the must-haves"
3. **Constraints** — Stack, frameworks, performance, timeline
   - Options: "Stack or framework requirements (Recommended)", "Performance or scalability targets", "Timeline or resource limits", "Must integrate with existing code", "No specific constraints", custom
4. **Out of Scope** — What we're NOT building
   - Options: "Features deferred to a future phase (Recommended)", "Alternative approaches we're not pursuing", "Edge cases we'll handle later", "Infrastructure or deployment changes", custom
5. **Assumptions** — What we're relying on being true
   - Options: "Existing infrastructure or services are available (Recommended)", "Certain code or APIs already work", "External dependencies are stable", "Team or user behavior follows a known pattern", custom
6. **Risks** — What could go wrong? Mitigations?
   - Options: "Technical complexity or unknowns (Recommended)", "Dependency on external systems or teams", "Breaking changes to existing behavior", "Timeline or scope pressure", custom

### Tools Used

| Tool | Purpose |
|------|---------|
| `goop_status` | Check current phase |
| `goop_state` | Update workflow state (NEVER edit state.json directly) |
| `question` | Structured confirmations with explicit outcomes (depth, approval, options) |
| `task` | Delegate to creative agent (opt-in, using native task tool) |
| `createSession` | Create a session when `/goop-discuss <name>` is used |
| `setSession` | Bind the created session to plugin context |
| `memory_search` | Find prior context |
| `memory_save` | Persist interview results |
| `goop_reference` | Load detailed process |

## Workflow Creation (CRITICAL — must happen before any file writes)

During `/goop-discuss`, workflow isolation is established immediately after the vision question. This is **not optional** — without it, every concurrent session writes to the same `default` slot and files collide.

**Sequence (section 2.1.1 of discuss-process):**
1. Infer `workflowId` from vision text (kebab-case slug, e.g., `feat-auth`, `payment-rebuild`)
   - If in a git worktree: use branch-derived ID from section 1.12
   - Otherwise: derive from the feature/topic the user described
2. Call `goop_state({ action: "create-workflow", workflowId: "<inferred-id>" })` — registers the slot in state.json
3. Call `goop_state({ action: "set-active-workflow", workflowId: "<inferred-id>" })` — binds this session to it
4. Confirm binding with `goop_state({ action: "get" })` — active workflowId must appear in response
5. All subsequent file writes target `.goopspec/<inferred-id>/`

**Both `create-workflow` AND `set-active-workflow` must be called.** Creating without binding leaves the session writing to `default`.

## Output

- `.goopspec/<workflowId>/REQUIREMENTS.md` — Discovery interview output
- State updated with `interviewComplete: true` and active `workflowId`

## Success Criteria

- [ ] Existing project documents archived (if present)
- [ ] Git branch INTENT offered (yes/no only — no name asked at this stage)
- [ ] Branch name INFERRED from vision description after user describes what they're building
- [ ] Inferred branch name CONFIRMED before creation (or created silently in Lazy Autopilot mode)
- [ ] Research depth selected (Light/Standard/Deep) before interview begins
- [ ] Depth persisted via `goop_state({ action: "set-depth", depth: "[shallow|standard|deep]" })`
- [ ] Autopilot opt-in offered after depth selection, before the vision question; three options presented: Manual, Autopilot, and Lazy Autopilot
- [ ] Autopilot choice persisted via `goop_state({ action: "set-autopilot", autopilot: true|false })`
- [ ] In Lazy Autopilot mode: branch created silently with inferred name (no confirmation prompt)
- [ ] Lazy Autopilot option offered; if selected, all six questions skipped and REQUIREMENTS.md generated directly from initial prompt
- [ ] When Lazy Autopilot selected, state persisted with autopilot: true AND lazyAutopilot: true
- [ ] Creative agent opt-in offered after vision question (accepted or declined)
- [ ] All six questions answered with specifics
- [ ] At least 1 must-have, 1 out-of-scope, 1 risk defined
- [ ] Discovery summary confirmed via structured `question` tool with explicit outcomes
- [ ] REQUIREMENTS.md created
- [ ] State updated via `goop_state({ action: "complete-interview" })`
- [ ] All question tool calls include (Recommended) on exactly one option

## Autopilot Phase Transition

**If `workflow.autopilot` is `true`** (standard or lazy): after writing REQUIREMENTS.md and calling `goop_state({ action: "complete-interview" })`, the next step is to call:

```
mcp_slashcommand({ command: "/goop-plan" })
```

**Hard rule:** Do NOT write a message like *"Autopilot is enabled — proceeding directly to /goop-plan"* and then stop. That is the failure mode. Announcing intent in text without calling the tool means `/goop-plan` never runs. The transition only happens when `mcp_slashcommand` is actually executed.

## Anti-Patterns

**DON'T:** Accept vague answers, skip risks, rush, auto-trigger creative agent
**DON'T:** Ask any questions when Lazy Autopilot mode is active
**DON'T:** Pause for confirmations, branch name confirmation, or creative opt-in in Lazy Autopilot mode
**DON'T:** Present question options without marking one as (Recommended)
**DON'T:** Announce phase transitions in text without calling `mcp_slashcommand` — this is a hard failure
**DO:** Probe for specifics, challenge "no risks", conduct interview yourself, offer creative input as opt-in choice

---

*Load `goop_reference({ name: "discuss-process" })` for full process details.*
