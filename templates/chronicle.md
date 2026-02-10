# CHRONICLE: {{project_name}}

**Last Updated:** {{last_updated}}
**Current Phase:** {{current_phase}}
**Session:** {{session_id}}

---

## Journey Status

```
{{progress_bar}} {{progress_percent}}%
```

**Position:** {{position_description}}

| Metric | Value |
|--------|-------|
| Phase | {{current_phase}} |
| Interview Complete | {{interview_complete}} |
| Spec Locked | {{spec_locked}} |
| Waves Completed | {{waves_completed}}/{{waves_total}} |
| Tasks Done | {{tasks_completed}}/{{tasks_total}} |
| Time Invested | {{total_time}} |

---

## Current Wave

### Wave {{current_wave}}: {{wave_name}}

**Status:** {{wave_status}}
**Started:** {{wave_started}}
**Execution:** {{#parallel}}Parallel{{/parallel}}{{^parallel}}Sequential{{/parallel}}

**Tasks:**
{{#wave_tasks}}
- [{{status}}] Task {{wave}}.{{number}}: {{name}} {{#commit}}(`{{commit}}`){{/commit}}
{{/wave_tasks}}

**Progress:** {{wave_progress}}%

---

## Active Blockers

{{#blockers}}
### {{title}}

| Attribute | Value |
|-----------|-------|
| Severity | {{severity}} |
| Type | {{type}} |
| Blocking | Task {{blocking_task}} |
| Since | {{since}} |

**Description:** {{description}}

**Resolution:** {{resolution}}

---
{{/blockers}}

{{^blockers}}
No active blockers.
{{/blockers}}

---

## Pending Decisions

Decisions awaiting user input (Rule 4 deviations):

{{#pending_decisions}}
### {{title}}

**Context:** {{context}}

**Options:**
{{#options}}
- **{{label}}:** {{description}}
{{/options}}

**Recommendation:** {{recommendation}}

**Impact:** {{impact}}

---
{{/pending_decisions}}

{{^pending_decisions}}
No pending decisions.
{{/pending_decisions}}

---

## Recent Activity

{{#recent_activity}}
### {{timestamp}} — {{agent}}

**Action:** {{action}}

**Outcome:** {{outcome}}

{{#files_changed}}
**Files:** {{files_changed}}
{{/files_changed}}

{{#commit}}
**Commit:** `{{commit}}` — {{commit_message}}
{{/commit}}

{{#decision}}
**Decision:** {{decision}}
- Reason: {{reason}}
- Saved to memory: {{saved_to_memory}}
{{/decision}}

---
{{/recent_activity}}

---

## Decisions Made

Significant choices captured for future reference.

{{#decisions}}
### {{date}}: {{title}}

| Attribute | Value |
|-----------|-------|
| Choice | {{choice}} |
| Alternatives | {{alternatives}} |
| Impact | {{impact}} |

**Reasoning:** {{reasoning}}

**Memory ID:** {{memory_id}}

---
{{/decisions}}

{{^decisions}}
No decisions recorded yet.
{{/decisions}}

---

## Learnings

Insights gained during this journey.

{{#learnings}}
- **{{topic}}:** {{insight}}
  - Discovered: {{discovered_at}}
  - Memory: {{memory_id}}
{{/learnings}}

{{^learnings}}
No learnings captured yet.
{{/learnings}}

---

## Session History

### Current Session
- Started: {{session_start}}
- Tasks Completed: {{session_tasks_completed}}
- Commits: {{session_commits}}

### Previous Sessions
{{#previous_sessions}}
| Session | Date | Accomplishments |
|---------|------|-----------------|
| {{session_id}} | {{date}} | {{accomplishments}} |
{{/previous_sessions}}

---

## Checkpoints

Saved positions for recovery.

{{#checkpoints}}
| ID | Phase | Wave | Created | Description |
|----|-------|------|---------|-------------|
| {{id}} | {{phase}} | {{wave}} | {{created}} | {{description}} |
{{/checkpoints}}

{{^checkpoints}}
No checkpoints saved.
{{/checkpoints}}

---

## Handoff History

{{#handoffs}}
### {{timestamp}}
- Phase: {{phase}}
- Next Command: `{{next_command}}`
- Handoff File: `{{handoff_file}}`
{{/handoffs}}

{{^handoffs}}
No handoffs generated yet.
{{/handoffs}}

---

## Memory Integration

### Recent Memory Entries
{{#recent_memories}}
- **[{{type}}]** {{title}} — {{created}}
{{/recent_memories}}

### Relevant Past Context
{{#relevant_context}}
- {{context}}
{{/relevant_context}}

---

## Next Steps

### Immediate
{{#immediate_next}}
1. {{.}}
{{/immediate_next}}

### After This Wave
{{#after_wave}}
- {{.}}
{{/after_wave}}

### Suggested Command
```
{{next_command}}
```

---

## Quick Commands

```bash
# Check status
/goop-status

# Continue work
/goop-execute

# Save checkpoint
/goop-pause

# Resume from checkpoint
/goop-resume

# Search past work
/goop-recall "{{query}}"
```

---

*Chronicle auto-updated by GoopSpec after each action*
*This is your journey log — decisions persist, context flows*
*GoopSpec v0.2.6*
