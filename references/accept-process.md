# Acceptance Process

Detailed process for `/goop-accept` - verification and acceptance of completed work.

## Phase 1: Gate Check

**Execute BEFORE anything else:**

```
goop_status()
Read(".goopspec/CHRONICLE.md")
Read(".goopspec/SPEC.md")
Read(".goopspec/BLUEPRINT.md")
```

### 1.1 Check execution complete

```
IF CHRONICLE shows incomplete waves:
  REFUSE with:
  
  ## 🔮 GoopSpec · Gate Blocked
  
  ✗ Execution incomplete.
  
  **Remaining:**
  - Wave [N]: [X] tasks pending
  
  → Run: `/goop-execute`
  
  ---
```

### 1.2 Check for blockers

```
IF unresolved blockers exist:
  REFUSE with:
  
  ## 🔮 GoopSpec · Blockers Unresolved
  
  ✗ Cannot accept with active blockers:
  
  - [Blocker 1]
  - [Blocker 2]
  
  Resolve blockers, then retry.
  
  ---
```

### 1.3 Gate passed

```
## 🔮 GoopSpec · Acceptance

✓ Execution gate passed

⏳ Running verification...

---
```

---

## Phase 2: Run Verification

**Spawn goop-verifier:**

```
task({
  subagent_type: "goop-verifier",
  description: "Verify against specification",
  prompt: `
## TASK
Verify implementation against SPEC.md

## REQUIREMENTS
[Full SPEC.md content]

## BLUEPRINT
[Full BLUEPRINT.md content - for traceability]

## CHRONICLE
[Progress log - what was built]

## INSTRUCTIONS
1. Verify every must-have has:
   - Implementation (code exists)
   - Tests (coverage)
   - Acceptance criteria met

2. Build requirement matrix:
   | Must-Have | Status | Evidence |
   
3. Run security checklist

4. Check for regressions

5. Return XML with VERIFICATION PASSED/FAILED
  `
})
```

**Spawn goop-tester (parallel):**

```
task({
  subagent_type: "goop-tester",
  description: "Run test suite",
  prompt: `
## TASK
Run complete test suite and report results

## INSTRUCTIONS
1. Run: bun test
2. Run: bun run typecheck
3. Report coverage
4. Flag any failures
5. Return XML with test results
  `
})
```

---

## Phase 3: Present Verification Report

**Parse XML responses and present:**

```
## 🔮 GoopSpec · Verification Report

### Requirement Matrix

| Must-Have | Status | Evidence |
|-----------|--------|----------|
| MH1: [Title] | PASS | Tests: 5/5, Commit: abc123 |
| MH2: [Title] | PASS | Tests: 3/3, Commit: def456 |
| MH3: [Title] | PASS | Manual: UI verified |

### Test Results

| Suite | Passed | Failed | Coverage |
|-------|--------|--------|----------|
| Unit | 42 | 0 | 87% |
| Integration | 8 | 0 | 92% |

### Security Check

| Check | Status |
|-------|--------|
| No hardcoded secrets | PASS |
| Input validation | PASS |
| Auth on protected routes | PASS |

### Overall: [PASSED/FAILED]

---
```

**If FAILED:**

```
## 🔮 GoopSpec · Verification Failed

**Failures:**

| Must-Have | Issue | Resolution |
|-----------|-------|------------|
| MH2 | Test failing | Fix auth edge case |
| MH3 | Missing feature | Implement retry logic |

**Options:**
1. Fix issues → /goop-execute to continue
2. Amend spec → /goop-amend to change requirements
3. Accept anyway → Type "accept-with-issues"

---
```

---

## Phase 4: Request Acceptance

**If PASSED:**

```
## 🔮 GoopSpec · Acceptance Gate

**Verification:** PASSED
**Must-Haves:** [N/N] complete
**Tests:** [X] passing

---

Type **"accept"** to complete this milestone.
Type **"issues"** to report problems.
Type **"cancel"** to return to execution.

---
```

---

## Phase 5: Handle Response

**On "accept":**

1. Update state:
```
goop_state({ action: "confirm-acceptance" })
```

2. Save to memory:
```
memory_save({
  type: "decision",
  title: "Accepted: [Feature]",
  content: "User accepted [feature] with [N] must-haves verified",
  importance: 0.8
})
```

3. Generate HANDOFF.md:
```markdown
# Session Handoff

**Phase:** accept

## Accomplished
- All must-haves verified
- Tests passing
- User accepted

## Next Session
Run: /goop-complete

## Context
Verification passed. Ready to archive.
```

4. Display completion and offer PR creation:

```
## 🔮 GoopSpec · Accepted

**Feature:** [Name]
**Status:** Accepted
**Verified:** [timestamp]

---
```

5. Offer to create Pull Request:

Use `question` tool:
- header: "Pull Request"
- question: "Work is complete and verified. Would you like to create a pull request?"
- options:
  - "Create PR (Recommended)" — Create a well-formatted pull request
  - "Skip PR" — Continue to milestone completion
  - "Create draft PR" — Create as draft for further review

**On "Create PR" or "Create draft PR":**

Detect default base branch:
```bash
DEFAULT_BASE_BRANCH=$(git remote show origin | grep 'HEAD branch' | sed 's/.*: //')
if [ -z "$DEFAULT_BASE_BRANCH" ]; then DEFAULT_BASE_BRANCH="main"; fi
```

Ask user which base branch to target:
- Use `question` tool: "Which base branch should this PR target?"
- Default answer: `$DEFAULT_BASE_BRANCH`
- Save response as `<selected-branch>`

Check branch status:
```bash
git branch --show-current
git log <selected-branch>..HEAD --oneline
git diff <selected-branch>...HEAD --stat
```

Generate PR title and description following the git-workflow reference:

**PR Title:** `type(scope): Descriptive summary of the change`

**PR Description:**
```markdown
## Summary

[2-4 sentences explaining WHAT and WHY based on the feature.]

## Changes

[Bullet list from commits and CHRONICLE.md]

## Testing

[From verification report - tests passed, coverage, manual checks]

## Notes

[Any breaking changes, migration steps, or follow-up work]
```

**CRITICAL:** PR title and description must be universal - no GoopSpec terminology.

Create PR:
```bash
gh pr create --base <selected-branch> --title "type(scope): Title" --body "..." [--draft]
```

Display PR URL to user.

6. Display next steps:
```
---

### Next Step

**Complete the milestone** — Archive and extract learnings

→ `/goop-complete`

Start a new session for clean archive.

---
```

**On "issues":**

```
What issues did you find?

[Use question tool or text input]
```

Then:
1. Log issues in CHRONICLE.md
2. Return to execution phase
3. Suggest `/goop-execute` to fix

**On "accept-with-issues":**

1. Log that acceptance was with known issues
2. Document issues in CHRONICLE.md
3. Proceed to acceptance

```
## 🔮 GoopSpec · Accepted With Issues

**Known Issues:**
- [Issue 1]
- [Issue 2]

These will be documented in the retrospective.

→ Next: `/goop-complete`
```

---

## Examples

### Successful Acceptance
```
User: /goop-accept

Orchestrator:
## 🔮 GoopSpec · Verification Report

| Must-Have | Status | Evidence |
|-----------|--------|----------|
| MH1: Toggle UI | PASS | Tests: 3/3 |
| MH2: Theme switch | PASS | Tests: 5/5 |
| MH3: Persist pref | PASS | Tests: 2/2 |

### Overall: PASSED

Type "accept" to complete.

User: accept

Orchestrator:
## 🔮 GoopSpec · Accepted

→ Next: `/goop-complete`
```

### Verification Failed
```
User: /goop-accept

Orchestrator:
## 🔮 GoopSpec · Verification Failed

**Failures:**
| MH2 | Test failing | edge case in theme switch |

**Options:**
1. Fix issues → /goop-execute
2. Accept anyway → "accept-with-issues"

User: Let's fix it

Orchestrator: Run `/goop-execute` to continue.
```

---

*Acceptance Process v0.2.1*
