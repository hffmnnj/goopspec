# Session Handoff

**Generated:** {{generated_timestamp}}
**Phase:** {{current_phase}}
**Session:** {{session_id}}

---

## Accomplished This Session

### Completed Tasks
{{#completed_tasks}}
- [x] {{task_id}}: {{description}} {{#commit}}(commit: `{{commit}}`){{/commit}}
{{/completed_tasks}}

### Key Outcomes
{{#key_outcomes}}
- {{.}}
{{/key_outcomes}}

### Decisions Made
{{#decisions}}
- **{{title}}**: {{choice}} — {{rationale}}
{{/decisions}}

---

## Current State

### Workflow Position
| Attribute | Value |
|-----------|-------|
| **Phase** | {{phase}} |
| **Spec Locked** | {{spec_locked}} |
| **Wave** | {{current_wave}} of {{total_waves}} |
| **Task** | {{current_task}} of {{total_tasks}} |

### Files Modified
{{#files_modified}}
- `{{path}}` — {{description}}
{{/files_modified}}

### Commits Made
{{#commits}}
- `{{sha}}` — {{message}}
{{/commits}}

---

## Next Session Instructions

### Command to Run
```
{{next_command}}
```

### Files to Read First
{{#files_to_read}}
1. `{{path}}` — {{reason}}
{{/files_to_read}}

### Context Summary

{{context_summary}}

### Immediate Next Task

**Task:** {{next_task_id}} — {{next_task_name}}

**Files:** 
{{#next_task_files}}
- `{{.}}`
{{/next_task_files}}

**Action:** {{next_task_action}}

**Verify:** `{{next_task_verify}}`

---

## Warnings & Blockers

### Active Blockers
{{#blockers}}
- **{{title}}**: {{description}}
  - Type: {{type}}
  - Resolution: {{resolution}}
{{/blockers}}

{{^blockers}}
None — clear to proceed.
{{/blockers}}

### Gotchas Discovered
{{#gotchas}}
- {{.}}
{{/gotchas}}

{{^gotchas}}
None discovered this session.
{{/gotchas}}

### Pending Decisions
{{#pending_decisions}}
- **{{title}}**: {{description}}
  - Options: {{options}}
  - Recommendation: {{recommendation}}
{{/pending_decisions}}

{{^pending_decisions}}
None — no user input needed.
{{/pending_decisions}}

---

## Memory Saved

Key learnings persisted to memory this session:

{{#memory_saved}}
- **{{title}}** ({{type}}, importance: {{importance}})
{{/memory_saved}}

---

## Resume Checklist

For the next session:

- [ ] Start new session for fresh context
- [ ] Run: `{{next_command}}`
- [ ] Read files listed above
- [ ] Continue with immediate next task

---

*Start a new session for fresh 200k context window.*
*All state is preserved in GoopSpec files.*

*Session Handoff — GoopSpec v0.2.6*
