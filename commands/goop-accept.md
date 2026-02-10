---
name: goop-accept
description: Verify work and request acceptance
phase: accept
requires: execution_complete
next-step: "Once accepted, complete the milestone and archive"
next-command: /goop-complete
alternatives:
  - command: /goop-execute
    when: "If issues are found that need to be fixed"
  - command: /goop-amend
    when: "If spec needs modification before acceptance"
---

# /goop-accept

**Verify and accept work.** The final gate before completion.

### STOP-AND-RETURN

**Execute this tool call NOW before reading anything else:**
```
goop_state({ action: "get" })
```

**IF `allWavesComplete` is not `true`:** return **BLOCKED** immediately with: "Cannot accept. Complete all waves via /goop-execute first." Do not process further instructions.

**Then load:** `goop_reference({ name: "accept-process" })`

## Quick Summary

**Gate:** All waves complete, no unresolved blockers.

### Tools Used

| Tool | Purpose |
|------|---------|
| `goop_status` | Check execution complete status |
| `goop_spec` | Load must-haves for verification |
| `goop_reference` | Load security-checklist, verification protocols |
| `memory_search` | Find relevant prior issues |
| `memory_decision` | Record accept/reject decision with evidence |
| `goop_adl` | Log verification gaps |

### Process Overview

1. **Gate Check** — Verify all waves complete, no blockers
2. **Run Verification** — Spawn goop-verifier and goop-tester
3. **Present Report** — Requirement matrix, test results, security check
4. **Request Acceptance** — User must type "accept"
5. **Handle Response** — Update state, generate HANDOFF.md

### Acceptance Keywords

| Keyword | Action |
|---------|--------|
| `accept` | Complete milestone, proceed to /goop-complete |
| `issues` | Log issues, return to execution |
| `accept-with-issues` | Accept with documented known issues |
| `cancel` | Return to execution |

## Output

| File | Purpose |
|------|---------|
| State (via goop_state) | Updated with acceptance |
| `.goopspec/CHRONICLE.md` | Verification results |
| `.goopspec/HANDOFF.md` | Session handoff |

## Success Criteria

- [ ] Gate check performed (execution complete, no blockers)
- [ ] goop-verifier spawned with full context
- [ ] Verification report presented clearly
- [ ] User explicitly typed "accept"
- [ ] HANDOFF.md generated

## Anti-Patterns

**DON'T:** Skip execution check, accept without verification, auto-accept
**DO:** Verify every must-have has evidence, require explicit "accept" keyword

---

*Load `goop_reference({ name: "accept-process" })` for full process details.*
