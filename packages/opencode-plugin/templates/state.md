# Current State

**Last Updated:** {{last_updated}}
**Session:** {{session_id}}

---

## Workflow Position

| Attribute | Value |
|-----------|-------|
| **Phase** | {{phase}} |
| **Interview Complete** | {{interview_complete}} |
| **Spec Locked** | {{spec_locked}} |
| **Wave** | {{current_wave}} of {{total_waves}} |
| **Task** | {{current_task}} of {{total_tasks}} |

---

## Quick Resume

### Command to Run
```
{{next_command}}
```

### What's Next
{{next_task_description}}

### Files to Read
{{#files_to_read}}
1. `{{.}}`
{{/files_to_read}}

---

## Progress Summary

### Completed
{{#completed_items}}
- [x] {{.}}
{{/completed_items}}

### In Progress
{{#in_progress_items}}
- [ ] {{.}} ← **Current**
{{/in_progress_items}}

### Remaining
{{#remaining_items}}
- [ ] {{.}}
{{/remaining_items}}

---

## Active Blockers

{{#blockers}}
### {{title}}
- **Type:** {{type}}
- **Impact:** {{impact}}
- **Resolution:** {{resolution}}
{{/blockers}}

{{^blockers}}
No active blockers.
{{/blockers}}

---

## Pending Decisions

{{#pending_decisions}}
### {{title}}
- **Context:** {{context}}
- **Options:** {{options}}
- **Recommendation:** {{recommendation}}
{{/pending_decisions}}

{{^pending_decisions}}
No pending decisions.
{{/pending_decisions}}

---

## Recent Activity

| Time | Action | Agent |
|------|--------|-------|
{{#recent_activity}}
| {{time}} | {{action}} | {{agent}} |
{{/recent_activity}}

---

## Session Context

{{session_context}}

---

*Human-readable state mirror - GoopSpec v0.2.8*
*See also: state.json for machine-readable state*
