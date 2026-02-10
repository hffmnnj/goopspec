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
| **Acceptance Gate** | Before /goop-complete | User accepts deliverable | /goop-accept |

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
    REFUSE: "Discovery interview required. Run /goop-discuss first."
  IF REQUIREMENTS.md does not exist:
    REFUSE: "No requirements found. Run /goop-discuss first."
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
    REFUSE: "Specification not locked. Run /goop-plan to confirm and lock first."
  IF SPEC.md traceability incomplete:
    REFUSE: "Traceability incomplete. Every must-have needs mapped tasks."
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
    REFUSE: "Execution incomplete. [N] tasks remaining in Wave [M]."
  IF blockers exist:
    REFUSE: "Blockers unresolved: [list]"
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
Between acceptance and completion (`/goop-accept` → `/goop-complete`)

### Purpose
User explicitly accepts the deliverable as meeting requirements.

### Requirements
| Requirement | Validation |
|-------------|------------|
| Verification report | goop-verifier produced report |
| All must-haves PASS | Requirement matrix shows all green |
| Security check | Security checklist reviewed |
| User acceptance | Explicit "accept" from user |

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
/goop-complete invoked:
  IF verification_passed != true:
    REFUSE: "Verification not passed. Review report."
  IF user_accepted != true:
    REFUSE: "User acceptance required. Type 'accept' to proceed."
  IF must-haves have FAIL status:
    REFUSE: "Must-haves incomplete: [list]"
  ELSE:
    PROCEED with completion
```

### Acceptance Process
1. Present verification report
2. Highlight any concerns
3. Request user acceptance: "Type 'accept' to complete this milestone"
4. On accept: Archive milestone, extract learnings, reset for next

---

## Gate Bypass Protocol

### When Bypass is Allowed

| Gate | Bypass Allowed | Conditions |
|------|----------------|------------|
| Discovery | Yes | /goop-quick, bug fixes, docs-only |
| Spec | No | Never - spec lock is fundamental |
| Execution | Partial | Nice-to-haves may be deferred |
| Acceptance | No | Never - user must accept |

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
/goop-complete                  [rework]
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

*Phase Gates Protocol v0.2.6*
*"Quality requires discipline."*
