---
name: goop-accept
description: Verify work, confirm acceptance, and archive milestone
phase: accept
requires: execution_complete
next-step: "Once explicitly accepted, finalize and archive automatically"
next-command: /goop-milestone
alternatives:
  - command: /goop-execute
    when: "If issues are found that need to be fixed"
  - command: /goop-amend
    when: "If spec needs modification before acceptance"
---

# /goop-accept

**Verify, accept, and complete work.** Runs the full verify-to-archive lifecycle.

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
5. **Handle Response** — Process acceptance keywords, record decision
6. **Finalize Milestone** — Archive artifacts, generate retrospective, extract learnings, optional git tag

Completion behavior in Step 6 preserves the prior `/goop-complete` lifecycle, now executed only after explicit acceptance.

### Acceptance Keywords

| Keyword | Action |
|---------|--------|
| `accept` | Confirm acceptance and immediately run completion/archival |
| `issues` | Log issues, return to execution |
| `accept-with-issues` | Record known issues, then require explicit `accept` before archival |
| `cancel` | Return to execution |

## Output

| File | Purpose |
|------|---------|
| State (via goop_state) | Updated with acceptance |
| `.goopspec/CHRONICLE.md` | Verification results |
| `.goopspec/archive/<milestone-slug>/` | Archived active milestone artifacts |
| `.goopspec/archive/<milestone-slug>/RETROSPECTIVE.md` | Generated retrospective |
| `.goopspec/HANDOFF.md` | Session handoff |

## Success Criteria

- [ ] Gate check performed (execution complete, no blockers)
- [ ] goop-verifier spawned with full context
- [ ] Verification report presented clearly
- [ ] User explicitly typed "accept"
- [ ] Archival only starts after explicit "accept"
- [ ] Completion artifacts generated (archive + retrospective + memory extraction)
- [ ] HANDOFF.md generated

## Anti-Patterns

**DON'T:** Skip execution check, accept without verification, auto-accept
**DO:** Verify every must-have has evidence, require explicit "accept" keyword

---

*Load `goop_reference({ name: "accept-process" })` for full process details.*
