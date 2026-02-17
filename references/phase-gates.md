# Phase Gates

Phase Gates are mandatory checkpoints that ensure quality and prevent premature progression through the GoopSpec workflow.

## Core Principle

```
+================================================================+
|  GATES ENFORCE QUALITY. NO SHORTCUTS.                           |
|  Each phase must satisfy its gate before proceeding.            |
|  Gates prevent scope creep, rework, and missed requirements.    |
+================================================================+
```

## Gate Overview

| Gate | Location | Purpose | Enforced By |
|------|----------|---------|-------------|
| **Discovery Gate** | Before /goop-plan | Ensure requirements understood | Orchestrator |
| **Spec Gate** | Before /goop-execute | Lock contract with user | /goop-plan (end-of-flow contract gate) |
| **Execution Gate** | Before /goop-accept | Verify all tasks complete | Orchestrator |
| **Acceptance Gate** | Within /goop-accept before archival | User accepts deliverable and triggers finalization | /goop-accept |
| **Merge Confirmation Gate** | Within /goop-pr-review before merge | User confirms merge after review | /goop-pr-review |

---

## Gate 1: Discovery Gate

### Location
Between discussion and planning (`/goop-discuss` → `/goop-plan`)

### Purpose
Ensure the six discovery questions are answered before any planning begins.

### Requirements
| Requirement | Validation |
|-------------|------------|
| Vision defined | Non-empty, > 2 sentences |
| Must-haves listed | At least 1 item |
| Constraints documented | Non-empty |
| Out of scope defined | At least 1 item |
| Assumptions listed | Non-empty |
| Risks identified | At least 1 with mitigation |

### State Check
```json
{
  "interview_complete": true
}
```

### File Check
```
.goopspec/REQUIREMENTS.md exists
```

### Enforcement
```
/goop-plan invoked:
  IF state.interview_complete != true:
    STOP: Return BLOCKED response immediately
    REFUSE: "Discovery interview required. Run /goop-discuss first."
    DO NOT CONTINUE processing
  IF REQUIREMENTS.md does not exist:
    STOP: Return BLOCKED response immediately
    REFUSE: "No requirements found. Run /goop-discuss first."
    DO NOT CONTINUE processing
  ELSE:
    PROCEED with planning
```

### Bypass Conditions
- `/goop-quick` for small tasks (single file, < 30 min)
- Bug fixes with clear reproduction
- Documentation-only changes

---

## Gate 2: Spec Gate

### Location
Between planning and execution (`/goop-plan` → `/goop-execute`)

### Purpose
Lock the specification contract with explicit user confirmation.

### Requirements
| Requirement | Validation |
|-------------|------------|
| SPEC.md exists | File present |
| Must-haves defined | At least 1 item |
| Out of scope defined | At least 1 item |
| BLUEPRINT.md exists | File present |
| Traceability mapping | Every must-have maps to task(s) |
| User confirmation | Explicit "confirm" or equivalent |

### State Check
```json
{
  "spec_locked": true,
  "locked_at": "[timestamp]",
  "locked_by": "[user]"
}
```

### Enforcement
```
/goop-execute invoked:
  IF state.spec_locked != true:
    STOP: Return BLOCKED response immediately
    REFUSE: "Specification not locked. Run /goop-plan to confirm and lock first."
    DO NOT CONTINUE processing
  IF SPEC.md traceability incomplete:
    STOP: Return BLOCKED response immediately
    REFUSE: "Traceability incomplete. Every must-have needs mapped tasks."
    DO NOT CONTINUE processing
  ELSE:
    PROCEED with execution
```

### Lock Process
1. Display SPEC.md must-haves and out-of-scope
2. Display BLUEPRINT.md wave summary
3. Show traceability matrix
4. Request user confirmation: "Type 'confirm' to lock specification"
5. On confirm: Set `spec_locked: true`, log to memory, proceed

### Amendment After Lock
Once locked, changes require `/goop-amend`:
1. Document requested change
2. Assess impact on BLUEPRINT.md
3. Get user approval for change
4. Update SPEC.md with amendment history
5. Update BLUEPRINT.md if needed
6. Continue execution

---

## Gate 3: Execution Gate

### Location
Between execution and acceptance (`/goop-execute` → `/goop-accept`)

### Purpose
Verify all planned tasks are complete before verification.

### Requirements
| Requirement | Validation |
|-------------|------------|
| All waves complete | CHRONICLE.md shows all waves done |
| All tasks complete | No pending tasks in BLUEPRINT.md |
| Verification passing | Tests pass, typecheck clean |
| No blockers | No unresolved BLOCKED status |

### State Check
```json
{
  "phase": "execute",
  "waves_complete": true,
  "all_tasks_done": true
}
```

### File Check
```
CHRONICLE.md shows:
- All waves marked complete
- All tasks checked off
- Final verification results
```

### Enforcement
```
/goop-accept invoked:
  IF CHRONICLE.md shows incomplete waves:
    STOP: Return BLOCKED response immediately
    REFUSE: "Execution incomplete. [N] tasks remaining in Wave [M]."
    DO NOT CONTINUE processing
  IF blockers exist:
    STOP: Return BLOCKED response immediately
    REFUSE: "Blockers unresolved: [list]"
    DO NOT CONTINUE processing
  ELSE:
    PROCEED with acceptance
```

### Partial Completion Handling
If some tasks are optional (nice-to-haves):
1. Must-haves MUST all be complete
2. Nice-to-haves MAY be deferred
3. Deferred items logged in CHRONICLE.md
4. User confirms proceeding without nice-to-haves

---

## Gate 4: Acceptance Gate

### Location
Within `/goop-accept` after verification and before archival/finalization

### Purpose
User explicitly accepts the deliverable as meeting requirements.

### Requirements
| Requirement | Validation |
|-------------|------------|
| Verification report | goop-verifier produced report |
| All must-haves PASS | Requirement matrix shows all green |
| Security check | Security checklist reviewed |
| User acceptance | Explicit "accept" from user |
| Acceptance keywords | `accept`, `issues`, `accept-with-issues`, `cancel` remain supported |

### State Check
```json
{
  "phase": "accept",
  "verification_passed": true,
  "user_accepted": true,
  "accepted_at": "[timestamp]"
}
```

### Verification Report
goop-verifier produces:
```markdown
## Verification Report

### Must-Have Matrix

| Requirement | Status | Evidence |
|-------------|--------|----------|
| [MH1] | PASS | [test/file/commit] |
| [MH2] | PASS | [test/file/commit] |

### Test Results
- Unit: 42/42 passing
- Integration: 8/8 passing
- E2E: 3/3 passing

### Security Review
- [x] No hardcoded secrets
- [x] Input validation present
- [x] Auth checks on protected routes

### Recommendation
ACCEPT / REJECT with [reasons]
```

### Enforcement
```
/goop-accept finalization step:
  IF verification_passed != true:
    STOP: Return BLOCKED response immediately
    REFUSE: "Verification not passed. Review report."
    DO NOT CONTINUE processing
  IF user_accepted != true:
    STOP: Return BLOCKED response immediately
    REFUSE: "User acceptance required. Type 'accept' to proceed."
    DO NOT CONTINUE processing
  IF must-haves have FAIL status:
    STOP: Return BLOCKED response immediately
    REFUSE: "Must-haves incomplete: [list]"
    DO NOT CONTINUE processing
  ELSE:
    PROCEED with completion
```

### Acceptance Process
1. Present verification report
2. Highlight any concerns
3. Request user acceptance: "Type 'accept' to complete and archive this milestone"
4. On accept: Archive milestone, extract learnings, reset for next

---

## Gate 5: Merge Confirmation Gate

### Location
Within `/goop-pr-review` after review analysis and optional fixes, before merge execution

### Purpose
Ensure user explicitly confirms merge operation after reviewing all findings and selecting merge strategy.

### Requirements
| Requirement | Validation |
|-------------|------------|
| Review complete | Quality, security, spec (if present), and summary analysis finished |
| Merge strategy selected | User chose `merge` or `squash` |
| Final summary displayed | Unresolved findings and merge impact shown |
| Explicit confirmation | User typed "yes" or equivalent affirmative |

### Enforcement
```
/goop-pr-review merge step:
  IF review not complete:
    STOP: Return BLOCKED response immediately
    REFUSE: "Review analysis incomplete. Cannot proceed to merge."
    DO NOT CONTINUE processing
  IF merge strategy not selected:
    STOP: Return BLOCKED response immediately
    REFUSE: "Merge strategy required. Select 'merge' or 'squash'."
    DO NOT CONTINUE processing
  IF user confirmation != true:
    STOP: Return BLOCKED response immediately
    REFUSE: "Explicit merge confirmation required. Type 'yes' to proceed."
    DO NOT CONTINUE processing
  ELSE:
    PROCEED with gh pr merge
```

### Merge Process
1. Complete review analysis (quality, security, spec, summary)
2. Offer and apply user-selected fixes (optional)
3. Re-verify after fixes (if fixes applied)
4. Prompt for merge strategy: "merge" or "squash"
5. Display final summary including any unresolved findings
6. Request explicit confirmation: "Type 'yes' to merge this PR"
7. On confirm: Execute `gh pr merge --[strategy]`
8. Handle merge outcome (success/conflict/permission failure)

### No Bypass
This gate **cannot be bypassed**. Merge always requires explicit user confirmation, even when:
- All checks pass
- No unresolved findings
- Automated fixes succeeded
- User has merge permissions

### Failure Handling
```
Message: "Merge confirmation required."
Action: Review final summary and confirm
Recovery: Type 'yes' to proceed or 'no' to cancel
```

---

## Gate Bypass Protocol

### When Bypass is Allowed

| Gate | Bypass Allowed | Conditions |
|------|----------------|------------|
| Discovery | Yes | /goop-quick, bug fixes, docs-only |
| Spec | No | Never - spec lock is fundamental |
| Execution | Partial | Nice-to-haves may be deferred |
| Acceptance | No | Never - user must accept |
| Merge Confirmation | No | Never - explicit confirmation required |

### Bypass Logging

All bypasses MUST be logged:
```typescript
goop_adl({
  action: "append",
  type: "deviation",
  description: "Discovery gate bypassed for quick task",
  rule: 0,  // No rule applies
  entry_action: "Proceeded with /goop-quick without interview"
})
```

---

## Gate State Machine

```
[idle]
   │
   ▼
/goop-discuss
   │
   ▼
[interview] ──── DISCOVERY GATE ────┐
   │                                │
   │ (interview_complete)           │ (bypass: /goop-quick)
   ▼                                ▼
/goop-plan                      [quick-execute]
   │                                │
   ▼                                ▼
[plan] ────── SPEC GATE ───────────[done]
   │
   │ (spec_locked + user confirm in /goop-plan)
   ▼
/goop-execute
   │
   ▼
[execute] ─── EXECUTION GATE ──────┐
   │                               │
   │ (all tasks complete)          │ (blockers)
   ▼                               ▼
/goop-accept                    [blocked]
   │
   ▼
[accept] ──── ACCEPTANCE GATE ─────┐
   │                               │
   │ (user accepts)                │ (verification fails)
   ▼                               ▼
/goop-accept finalization       [rework]
   │
   ▼
[done] → archive → [idle]
```

---

## Gate Failure Handling

### Discovery Gate Failure
```
Message: "Discovery interview incomplete."
Action: Run /goop-discuss to complete interview
Recovery: Answer remaining questions
```

### Spec Gate Failure
```
Message: "Specification not ready for lock."
Action: Review SPEC.md and BLUEPRINT.md
Recovery: Complete traceability, get user confirm
```

### Execution Gate Failure
```
Message: "Execution incomplete."
Action: Review CHRONICLE.md for remaining tasks
Recovery: Complete tasks or defer nice-to-haves
```

### Acceptance Gate Failure
```
Message: "Verification failed."
Action: Review verification report
Recovery: Fix failing requirements, re-verify
```

---

*Phase Gates Protocol v0.2.8*
*"Quality requires discipline."*
