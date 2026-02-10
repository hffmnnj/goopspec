# BLUEPRINT: {{project_name}}

**Spec Version:** {{spec_version}}
**Created:** {{created_date}}
**Last Updated:** {{updated_date}}
**Mode:** {{mode}}

---

## Overview

**Goal:** {{goal}}

**Approach:** {{approach}}

| Metric | Value |
|--------|-------|
| Waves | {{wave_count}} |
| Total Tasks | {{task_count}} |
| Parallel Execution | {{parallel_percentage}}% |
| Estimated Effort | {{estimated_effort}} |

---

## Spec Mapping

Every must-have from SPEC.md is covered:

| Must-Have | Tasks | Coverage |
|-----------|-------|----------|
{{#spec_mapping}}
| MH{{number}}: {{title}} | {{tasks}} | {{coverage}} |
{{/spec_mapping}}

**Total Coverage:** {{total_coverage}}%

---

## Wave Architecture

```
{{#waves}}
Wave {{number}}: {{name}} {{#parallel}}[PARALLEL]{{/parallel}}{{^parallel}}[SEQUENTIAL]{{/parallel}}
{{#tasks}}  ├── Task {{wave}}.{{number}}: {{name}}
{{/tasks}}{{#depends_on}}  └── depends on Wave {{.}}
{{/depends_on}}
{{/waves}}
```

---

{{#waves}}
## Wave {{number}}: {{name}}

**Goal:** {{goal}}

**Execution:** {{#parallel}}Parallel — tasks can run concurrently{{/parallel}}{{^parallel}}Sequential — tasks must run in order{{/parallel}}

{{#depends_on}}**Depends On:** Wave {{.}} must complete first{{/depends_on}}

### Verification Matrix

| Check | Command | Expected |
|-------|---------|----------|
{{#verification_matrix}}
| {{check}} | `{{command}}` | {{expected}} |
{{/verification_matrix}}

---

{{#tasks}}
### Task {{wave}}.{{number}}: {{name}}

| Attribute | Value |
|-----------|-------|
| **Intent** | {{intent}} |
| **Executor** | {{executor}} |
| **Parallel** | {{#parallel}}Yes{{/parallel}}{{^parallel}}No{{/parallel}} |
{{#depends_on}}| **Depends On** | Task {{depends_on}} |{{/depends_on}}
{{#blocks}}| **Blocks** | Task {{blocks}} |{{/blocks}}
| **Spec Coverage** | {{spec_coverage}} |

**Deliverables:**
{{#deliverables}}
- [ ] {{.}}
{{/deliverables}}

**Files:**
{{#files}}
- `{{path}}` — {{action}}
{{/files}}

**Verification:**
```bash
{{verification_command}}
```

**Acceptance:**
{{acceptance}}

---

{{/tasks}}
{{/waves}}

## Verification Checklist

Before marking blueprint complete:

{{#verification_checklist}}
- [ ] {{.}}
{{/verification_checklist}}

---

## Risk Assessment

{{#risks}}
### Risk: {{title}}

| Attribute | Value |
|-----------|-------|
| Likelihood | {{likelihood}} |
| Impact | {{impact}} |
| Affected Tasks | {{affected_tasks}} |

**Mitigation:** {{mitigation}}

**Contingency:** {{contingency}}

---
{{/risks}}

{{^risks}}
No significant risks identified.
{{/risks}}

---

## Deviation Protocol

If issues are encountered during execution:

| Rule | Trigger | Action |
|------|---------|--------|
| **Rule 1** | Bug found in existing code | Auto-fix, document in CHRONICLE |
| **Rule 2** | Missing critical functionality | Auto-add, document in CHRONICLE |
| **Rule 3** | Blocking issue (deps, imports) | Auto-fix, document in CHRONICLE |
| **Rule 4** | Architectural decision needed | **STOP**, ask user, log to memory |

---

## Execution Notes

### For Orchestrator
- Delegate ALL code tasks to executor agents
- Track progress in CHRONICLE.md
- Save checkpoint at wave boundaries
- Generate HANDOFF.md when suggesting new session
- Confirm with user at CONTRACT GATES

### For Subagents
- Read SPEC.md for requirements
- Check CHRONICLE.md for context
- Load PROJECT_KNOWLEDGE_BASE.md for conventions
- Use memory_search before decisions
- Persist learnings with memory_save
- Return XML response envelope

### Parallel Execution Rules
- Tasks within a parallel wave can run concurrently
- Wait for all tasks in wave before proceeding to next wave
- If any task blocks, continue others and handle blocker separately

---

## Handoff Protocol

At wave boundaries:
1. Update CHRONICLE.md with completed tasks
2. Save checkpoint with goop_checkpoint
3. If context full or natural pause, generate HANDOFF.md
4. Suggest: "Start new session and run `/goop-execute`"

---

*Blueprint derived from SPEC.md*
*Execute with confidence — the plan is the contract*
*GoopSpec v0.2.6*
