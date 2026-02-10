---
name: goop-quick
description: Fast-track a small task
phase: quick
next-step: "After verification, confirm completion with the user"
next-command: null
alternatives:
  - command: /goop-discuss
    when: "If the task is complex or requires multiple waves"
  - command: /goop-debug
    when: "If the task is debugging a specific issue"
---

# /goop-quick

**Execute small tasks fast.** Abbreviated workflow for simple changes.

## Usage

```bash
/goop-quick [task description]
```

### STOP-AND-RETURN

**Execute this tool call NOW before reading anything else:**
```
goop_state({ action: "get" })
```

**IF quick qualification is not met:** return **BLOCKED** immediately with: "Task does not qualify for quick mode. Run /goop-discuss instead." Do not process further instructions.

**Then load:** `goop_reference({ name: "quick-process" })`

## Quick Summary

**Bypass formal planning for small, well-defined tasks.** Still maintains safety guarantees.

### Tools Used

| Tool | Purpose |
|------|---------|
| `goop_status` | Check current state |
| `goop_state` | Set quick mode (NEVER edit state.json directly) |
| `memory_search` | Find relevant prior context |
| `memory_save` | Persist any discoveries |
| `goop_adl` | Log the quick fix decision |
| `goop_reference` | Load detailed process |

### Process Overview

1. **Qualify** — Verify task is truly "quick" (single concern, known location)
2. **Capture** — One-line plan, one success criterion
3. **Execute** — Implement with atomic commit
4. **Verify** — Confirm fix works, ask user to accept

### Quick Criteria

A task qualifies for quick mode if ALL of these are true:
- [ ] Single file OR tightly coupled files (max 3)
- [ ] Clear, unambiguous intent
- [ ] No architectural decisions required
- [ ] Estimated < 15 minutes of work
- [ ] No new dependencies needed

## Output

| File | Purpose |
|------|---------|
| Source files | Implementation |
| Commit | Atomic change |
| `.goopspec/ADL.md` | Quick fix logged |

## Success Criteria

- [ ] Quick criteria validated (5 checkboxes)
- [ ] Intent captured in one sentence
- [ ] Success criterion defined before execution
- [ ] Atomic commit created
- [ ] Fix verified working
- [ ] User confirmed acceptance

## Anti-Patterns

**DON'T:** Use for multi-wave work, skip verification, force complex tasks into quick mode
**DO:** Escalate to `/goop-discuss` if scope grows, verify before declaring done, document in ADL

---

*Load `goop_reference({ name: "quick-process" })` for full process details.*
