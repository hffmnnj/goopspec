---
name: goop-quick
description: Fast-track a small task
phase: quick
next-step: "After verification, confirm completion with the user"
next-command: null
---

# /goop-quick

**Execute small tasks fast.** Abbreviated workflow for simple changes.

## Usage

```bash
/goop-quick [task description]
```

### Load Process

**Execute this tool call NOW before reading anything else:**
```
goop_state({ action: "get" })
```

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

Quick mode works best for tasks that are:
- Single file OR tightly coupled files (max 3)
- Clear, unambiguous intent
- No architectural decisions required
- Estimated < 15 minutes of work
- No new dependencies needed

## Output

| File | Purpose |
|------|---------|
| Source files | Implementation |
| Commit | Atomic change |
| `.goopspec/ADL.md` | Quick fix logged |

## Success Criteria

- [ ] Intent captured in one sentence
- [ ] Success criterion defined before execution
- [ ] Atomic commit created
- [ ] Fix verified working
- [ ] User confirmed acceptance

## Anti-Patterns

**DON'T:** Skip verification, skip the ADL log entry
**DO:** Verify before declaring done, document in ADL, keep changes focused

---

*Load `goop_reference({ name: "quick-process" })` for full process details.*
