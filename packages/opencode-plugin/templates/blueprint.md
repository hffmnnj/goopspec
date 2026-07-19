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
| Estimated Effort | {{estimated_effort}} |

> **Wave & task tracking:** Wave, task, PR, status, verification, and traceability data live in the `waves` / `wave_tasks` database tables, written via `goop_write_wave` and read via `goop_read_wave`. This document covers non-wave planning content only — consult the wave tool for execution state.

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
- Return markdown response envelope per `references/response-format.md`

---

## Handoff Protocol

At wave boundaries:
1. Record wave/task completion via `goop_write_wave` (the source of truth for progress)
2. Update CHRONICLE.md with completed tasks
3. Save checkpoint with `goop_checkpoint`
4. If context is full or at a natural pause, generate HANDOFF.md
5. Suggest: "Start new session and run `/goop-execute`"

---

*Blueprint derived from SPEC.md*
*Execute with confidence — the plan is the contract*
*GoopSpec v0.2.8*
