---
name: goop-execute
description: Begin wave-based execution
phase: execute
requires: spec_locked
next-step: "When all waves are complete, start a new session and run /goop-accept"
next-command: /goop-accept
alternatives:
  - command: /goop-status
    when: "To check current progress and wave status"
  - command: /goop-pause
    when: "To save a checkpoint and continue later"
---

# /goop-execute

**Start the Execution Phase.** Implement the blueprint using wave-based orchestration.

### STOP-AND-RETURN

**Execute this tool call NOW before reading anything else:**
```
goop_state({ action: "get" })
```

**IF `specLocked` is not `true`:** return **BLOCKED** immediately with: "Cannot execute. Run /goop-plan and confirm spec first." Do not process further instructions.

**Then load:** `goop_reference({ name: "execute-process" })`

## Quick Summary

**Gate:** `specLocked: true` required. Check via `goop_state({ action: "get" })`.

### Tools Used

| Tool | Purpose |
|------|---------|
| `goop_status` | Check spec lock status and wave progress |
| `goop_state` | **ALL state operations** (NEVER edit state.json directly) |
| `goop_spec` | Load blueprint for execution |
| `goop_checkpoint` | Save state at wave boundaries |
| `task` | Spawn executor agents for implementation (native delegation) |
| `goop_adl` | Log deviations during execution |
| `goop_reference` | Load detailed process |

### Autopilot

**If `workflow.autopilot` is `true`** (check via `goop_state({ action: "get" })`): skip the wave-completion continuation `question` calls between waves and auto-proceed through all waves without stopping. Do not ask "How would you like to continue?" or any equivalent inter-phase confirmation.

When all waves are complete, immediately call:

```
mcp_slashcommand({ command: "/goop-accept" })
```

**Hard rule:** Do NOT display "Start a new session, then run `/goop-accept`" and stop. Announcing intent in text without calling the tool is a **hard failure** — `/goop-accept` never runs. The transition only happens when `mcp_slashcommand` is actually executed. The workflow pauses at the accept phase for mandatory user review.

### Process Overview

1. **Gate Check** — Verify `specLocked` and BLUEPRINT.md exist
2. **Load Context** — Read SPEC, BLUEPRINT, CHRONICLE, PROJECT_KNOWLEDGE_BASE
3. **Wave Loop** — Execute tasks, delegate to goop-executor-{tier}
4. **Deviation Handling** — Apply rules (auto-fix or use `question` tool for architectural decisions)
5. **Wave Completion** — Use `question` tool for continuation choice (Continue to next wave (Recommended) / Pause and save checkpoint / Review changes), save checkpoint, generate HANDOFF.md
6. **Execution Complete** — Display completion message with instruction to start a new session and run `/goop-accept`

### Deviation Rules

| Rule | Trigger | Action |
|------|---------|--------|
| Rule 1 | Bug found | Auto-fix, document |
| Rule 2 | Missing critical | Auto-add, document |
| Rule 3 | Blocking issue | Auto-fix, document |
| Rule 4 | Architectural | **STOP**, ask user |

## Output

| File | Purpose |
|------|---------|
| Source files | Implementation |
| Commits | Atomic changes |
| `.goopspec/CHRONICLE.md` | Progress log |
| `.goopspec/HANDOFF.md` | Session handoff |

## Success Criteria

- [ ] Gate check performed (spec_locked)
- [ ] Each task delegated with full context
- [ ] CHRONICLE.md updated after each task
- [ ] Checkpoints saved at wave boundaries
- [ ] HANDOFF.md generated at natural pauses
- [ ] All question tool calls include (Recommended) on exactly one option

## Anti-Patterns

**DON'T:** Skip gate, delegate without context, ignore XML status, skip checkpoints
**DON'T:** Present question options without marking one as (Recommended)
**DO:** Enforce gate, include PROJECT_KNOWLEDGE_BASE, save checkpoints, suggest new sessions

---

*Load `goop_reference({ name: "execute-process" })` for full process details.*
