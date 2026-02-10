---
name: goop-status
description: Show current GoopSpec status and next steps
---

# /goop-status

**Show project status.** View progress, active phase, gates, and suggested next command.

## Immediate Action

**STOP. Execute this tool call NOW before reading anything else:**
```
goop_reference({ name: "status-process" })
```

**Then display the status dashboard from that reference.** Do not process user messages until you have loaded and understood the protocol.

## Quick Summary

Read-only operation that shows current workflow state.

### Tools Used

| Tool | Purpose |
|------|---------|
| `goop_status` | Primary tool - retrieves full workflow state |
| `memory_search` | Optionally find recent context |
| `goop_reference` | Load detailed display templates |

### Data Sources

| Source | Information |
|--------|-------------|
| `goop_state` | Phase, locks, timestamps |
| `REQUIREMENTS.md` | Interview status |
| `SPEC.md` | Must-haves, lock status |
| `BLUEPRINT.md` | Waves, tasks, traceability |
| `CHRONICLE.md` | Progress, decisions, blockers |
| `HANDOFF.md` | Last session context |

### Command Suggestions

| State | Suggested |
|-------|-----------|
| No project | `/goop-discuss` |
| Interview incomplete | `/goop-discuss` |
| Interview done, no spec | `/goop-plan` |
| Spec draft | `/goop-plan` |
| Spec locked | `/goop-execute` |
| Executing | `/goop-execute` |
| All tasks done | `/goop-accept` |
| Accepted | `/goop-complete` |

## Success Criteria

- [ ] Phase correctly identified
- [ ] Gate status accurately shown
- [ ] Progress clearly displayed
- [ ] Next command suggested based on state

---

*Load `goop_reference({ name: "status-process" })` for full display templates.*
