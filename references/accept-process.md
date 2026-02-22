# Acceptance Process

Detailed process for `/goop-accept` - verification, explicit acceptance, and automatic completion/archival.

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

## Structured Question Policy (Accept Phase)

All short-answer interactions during acceptance MUST use the `question` tool. Output context (verification reports, requirement matrices, test results) as regular messages first, then ask a concise question with 2-5 options.

**When to use structured prompts:**
- Acceptance gate decisions (accept/issues/cancel)
- PR creation choices
- Target branch selection
- Issue resolution routing

**When to use freeform text:**
- Detailed issue descriptions when reporting problems

**Examples:**

Acceptance gate (3 options):
```ts
question({
  header: "Acceptance Gate",
  question: "Verification passed. How would you like to proceed?",
  options: [
    { label: "Accept (Recommended)", description: "Finalize and archive milestone" },
    { label: "Report Issues", description: "Document problems found" },
    { label: "Return to Execution", description: "Fix issues first" }
  ]
})
```

PR creation (3 options):
```ts
question({
  header: "Pull Request",
  question: "Work is verified. Create a pull request?",
  options: [
    { label: "Create PR (Recommended)", description: "Well-formatted pull request" },
    { label: "Create draft PR", description: "Draft for further review" },
    { label: "Skip PR", description: "Continue to completion" }
  ]
})
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

Display verification summary as a regular message first:

```
## 🔮 GoopSpec · Acceptance Gate

**Verification:** PASSED
**Must-Haves:** [N/N] complete
**Tests:** [X] passing

---
```

Then use `question` tool:

```ts
question({
  header: "Acceptance Gate",
  question: "Verification passed. How would you like to proceed?",
  options: [
    { label: "Accept (Recommended)", description: "Finalize and archive milestone" },
    { label: "Report Issues", description: "Document problems found" },
    { label: "Accept with Issues", description: "Record known issues, then finalize" },
    { label: "Return to Execution", description: "Go back and fix issues" }
  ]
})
```

---

## Phase 5: Handle Response

**On "Accept":**

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
Run: /goop-milestone (or start next planned work)

## Context
Verification passed. Milestone finalized and archived.
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

**Step 1: Ask which branch to target.**

Use `question` tool:
- header: "PR Target Branch"
- question: "Which branch should this PR merge into?"
- options:
  - "main" — Merge into main branch
  - "develop" — Merge into develop branch

The user can also type a custom branch name.

Store the answer as `$TARGET_BRANCH`.

**Step 2: Check branch status:**
```bash
git branch --show-current
git log $TARGET_BRANCH..HEAD --oneline
git diff $TARGET_BRANCH...HEAD --stat
```

**Step 3: Generate PR title and description** following the git-workflow reference:

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

**Step 4: Create PR:**
```bash
gh pr create --base $TARGET_BRANCH --title "type(scope): Title" --body "..." [--draft]
```

Display PR URL to user.

6. Start completion lifecycle (merged from previous `/goop-complete`):

   - **Archival:** move active milestone artifacts (`SPEC.md`, `BLUEPRINT.md`, `CHRONICLE.md`, and related active files) to `.goopspec/archive/<milestone-slug>/`
   - **Retrospective:** generate `.goopspec/archive/<milestone-slug>/RETROSPECTIVE.md`
   - **Memory extraction:** persist milestone learnings (patterns, decisions, gotchas) via memory tools
   - **Tagging (optional):** create git tag if milestone flow requests it

7. Display completion summary and archival artifacts:

```
## 🔮 GoopSpec · Accepted and Archived

**Feature:** [Name]
**Status:** Accepted and archived
**Archive:** .goopspec/archive/[milestone-slug]/
**Retrospective:** .goopspec/archive/[milestone-slug]/RETROSPECTIVE.md
**Memory:** [N] learnings persisted

---
```

**On "Report Issues":**

Ask for issue details (freeform text is appropriate here since issues require multi-sentence detail):

```
What issues did you find? Please describe them.
```

Then:
1. Log issues in CHRONICLE.md
2. Return to execution phase
3. Suggest `/goop-execute` to fix

**On "Accept with Issues":**

1. Log that acceptance was with known issues
2. Document issues in CHRONICLE.md
3. Re-open acceptance gate and require explicit confirmation before archival

Display issues as a regular message:

```
## 🔮 GoopSpec · Accepted With Issues

**Known Issues:**
- [Issue 1]
- [Issue 2]

These will be documented in the retrospective.
```

Then use `question` tool for final confirmation:

```ts
question({
  header: "Finalize with Issues",
  question: "Confirm acceptance with the known issues above?",
  options: [
    { label: "Finalize (Recommended)", description: "Archive milestone with documented issues" },
    { label: "Cancel", description: "Return to fix issues first" }
  ]
})
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

→ [question tool: Accept / Report Issues / Accept with Issues / Return to Execution]

User: [Selects "Accept"]

Orchestrator:
## 🔮 GoopSpec · Accepted and Archived

Archive created at `.goopspec/archive/<milestone-slug>/`
```

### Verification Failed
```
User: /goop-accept

Orchestrator:
## 🔮 GoopSpec · Verification Failed

**Failures:**
| MH2 | Test failing | edge case in theme switch |

→ [question tool: Return to Execution / Accept with Issues]

User: [Selects "Return to Execution"]

Orchestrator: Run `/goop-execute` to continue.
```

---

*Acceptance Process v0.2.8*
