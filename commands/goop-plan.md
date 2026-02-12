---
name: goop-plan
description: Create specification and blueprint from discovery interview
phase: plan
requires: interview_complete
next-step: "When planning is complete and spec is confirmed, begin implementation"
next-command: /goop-execute
alternatives:
  - command: /goop-discuss
    when: "If discovery interview was not completed"
  - command: /goop-research
    when: "If there are unknowns to investigate"
  - command: /goop-pause
    when: "To save progress and continue later"
---

# /goop-plan

**Create Specification and Blueprint.** Transform discovery interview into executable plans.

### STOP-AND-RETURN

**Execute this tool call NOW before reading anything else:**
```
goop_state({ action: "get" })
```

**IF `interviewComplete` is not `true`:** return **BLOCKED** immediately with: "Cannot plan. Run /goop-discuss first." Do not process further instructions.

**Then load:** `goop_reference({ name: "plan-process" })`

## Quick Summary

**Gate:** `interviewComplete: true` required. Check via `goop_state({ action: "get" })`.

**You check the gate, then spawn the planner.** The planner creates SPEC.md and BLUEPRINT.md.

### Tools Used

| Tool | Purpose |
|------|---------|
| `goop_status` | Check current phase and gate requirements |
| `goop_state` | Check/update workflow state (NEVER edit state.json directly) |
| `goop_spec` | Validate interview complete, load existing specs |
| `memory_search` | Find prior architecture decisions |
| `goop_reference` | Load detailed process |
| `question` | Ask per-wave dynamic questions and run post-wave review gates |

### Process Overview

1. **Gate Check** — Verify `interviewComplete` and REQUIREMENTS.md exist
2. **Handle Existing** — Archive or continue if docs already exist
3. **Load Context** — Read REQUIREMENTS.md, search memory
4. **Create PROJECT_KNOWLEDGE_BASE.md** — If missing, generate from constraints
5. **Spawn goop-planner** — With full discovery context and current depth setting (`shallow`/`standard`/`deep`)
6. **Per-Wave Dynamic Questioning** — Generate contextual wave-specific questions (typically 3-6 total, scaled by depth: shallow 1-2, standard 3-4, deep 5-6) and capture user answers before finalizing each wave
7. **Post-Wave Review Gate** — After each wave draft, present review options (approve, request more research, clarify) before moving forward
8. **Contract Gate** — Present spec summary, then use `question` tool with Confirm and Lock / Amend / Cancel options. On confirm: lock spec via `goop_state({ action: 'lock-spec' })`. On decline: spec stays unlocked for iteration.
9. **Generate HANDOFF.md** — For session continuity

## Output

| File | Purpose |
|------|---------|
| `.goopspec/SPEC.md` | Specification (Draft) |
| `.goopspec/BLUEPRINT.md` | Wave-based execution plan |
| `.goopspec/CHRONICLE.md` | Progress tracking |
| `.goopspec/HANDOFF.md` | Session handoff |
| `.goopspec/PROJECT_KNOWLEDGE_BASE.md` | Stack and conventions |

## Success Criteria

- [ ] Gate check performed (interview_complete + REQUIREMENTS.md)
- [ ] PROJECT_KNOWLEDGE_BASE.md created if missing
- [ ] goop-planner spawned with full discovery context
- [ ] 100% must-have coverage achieved
- [ ] User knows next step is `/goop-execute`
- [ ] Spec confirmed and locked by user
- [ ] User declined lock, spec remains draft
- [ ] Per-wave dynamic questions are generated and answered for each planned wave
- [ ] Post-wave review gate is presented with structured options per wave
- [ ] Depth setting (`shallow`/`standard`/`deep`) changes planning detail and question volume

## Anti-Patterns

**DON'T:** Skip gate check, conduct interview here, create docs without traceability
**DO:** Enforce gate strictly, spawn planner with complete context, verify 100% traceability

---

*Load `goop_reference({ name: "plan-process" })` for full process details.*
