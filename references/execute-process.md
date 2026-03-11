# Execution Process

Detailed process for `/goop-execute` - wave-based implementation of the blueprint.

## Phase 1: Gate Check

**Execute BEFORE anything else:**

```
goop_status()
goop_state({ action: "get" })        # NEVER read state.json directly
# Resolve workflowId from state, then read:
Read(".goopspec/<workflowId>/BLUEPRINT.md")
```

### 1.1 Check specLocked

```
IF state.specLocked != true:
  REFUSE with:
  
  ## 🔮 GoopSpec · Gate Blocked
  
  ✗ Specification must be locked before execution.
  
  → Run: `/goop-plan` to confirm and lock, then `/goop-execute`
  
  ---
```

### 1.2 Feature branch guard

Before starting wave delegation, ensure execution is not starting from the default branch.

```bash
git branch --show-current
git remote show origin | grep 'HEAD branch' | sed 's/.*: //'
```

Set:
- `currentBranch` = output of `git branch --show-current`
- `defaultBranch` = detected HEAD branch from origin (fallback to `main` if detection is empty)

Evaluate against default-branch set:
- `main`
- `master`
- `defaultBranch`

If `currentBranch` is in that set, use `question` tool:
- header: "Git Branch Guard"
- question: "You're on `[currentBranch]`, which is a default branch. Create a feature branch before execution?"
- options:
  - "Create feature branch (Recommended)" — Create and switch to a feature branch
  - "Stay on current branch" — Continue on `[currentBranch]`

Suggested branch name:
- Derive from SPEC title in `.goopspec/<workflowId>/SPEC.md`
- Pattern: `feat/<spec-title-kebab-case>`
- Example: `# SPEC: Git Workflow Improvements` -> `feat/git-workflow-improvements`

**On "Create feature branch":**

```bash
git checkout -b feat/<spec-title-kebab-case>
```

If `currentBranch` is NOT in the default-branch set, proceed silently with no prompt.

### 1.3 Gate passed

```
## 🔮 GoopSpec · Execution

✓ Spec gate passed

⚡ Starting wave-based execution...

---
```

---

## Structured Question Policy (Execute Phase)

All short-answer interactions during execution MUST use the `question` tool. Output context (wave progress, deviation details, PR summaries) as regular messages first, then ask a concise question with 2-5 options.

**When to use structured prompts:**
- Feature branch guard decisions
- Wave completion continuation choices
- Deviation handling (Rule 4 architectural decisions)
- PR creation and target branch selection

**When to use freeform text:**
- Detailed architectural rationale when Rule 4 options need elaboration

**Examples:**

Wave completion (2 options):
```ts
question({
  header: "Wave 1 Complete",
  question: "How would you like to continue?",
  options: [
    { label: "Continue to Wave 2 (Recommended)", description: "Proceed in current session" },
    { label: "Pause and resume later", description: "Save checkpoint, start fresh" }
  ]
})
```

Architectural decision (Rule 4):
```ts
question({
  header: "Architectural Decision",
  question: "Database schema change needed. Add index on users.email?",
  options: [
    { label: "Add index (Recommended)", description: "Better query performance, minor migration" },
    { label: "Skip index", description: "Simpler migration, optimize later" }
  ]
})
```

---

## Phase 2: Load Context

```
Read(".goopspec/<workflowId>/SPEC.md")           # Must-haves
Read(".goopspec/<workflowId>/BLUEPRINT.md")      # Waves and tasks
Read(".goopspec/<workflowId>/CHRONICLE.md")      # Progress (if resuming)
Read(".goopspec/PROJECT_KNOWLEDGE_BASE.md")      # Conventions (global)

memory_search({ query: "[feature] implementation patterns" })
```

Identify:
- Current wave (from CHRONICLE or start at 1)
- Tasks to execute
- Dependencies between tasks

---

## Phase 3: Wave Execution Loop

**Display wave start:**

```
## 🔮 GoopSpec · Wave [N] of [M]: [Wave Name]

**Tasks:** [X] | **Execution:** [Parallel/Sequential]

---
```

**For each task in wave:**

### 3.1 Delegate to executor

Before delegating, resolve the active workflowId and doc prefix:
```
goop_state({ action: "get" })
# Extract: activeWorkflowId and workflowDocPrefix from the response
# workflowDocPrefix = ".goopspec/<activeWorkflowId>/" (or ".goopspec/" for "default")
```

```
task({
  subagent_type: "goop-executor-{tier}",
  description: "Execute Task [N.M]",
  prompt: `
## TASK
Wave [N], Task [M]: [Task Name]

## WORKFLOW ISOLATION (CRITICAL)
- Active Workflow ID: <activeWorkflowId>
- Workflow doc directory: <workflowDocPrefix>
- Write ALL workflow files (CHRONICLE.md, HANDOFF.md, RESEARCH.md, etc.) to <workflowDocPrefix>
- NEVER write workflow docs to .goopspec/ root (unless workflowId is "default")
- state.json, config.json, memory.db remain at .goopspec/ root always

## PROJECT CONTEXT
[From PROJECT_KNOWLEDGE_BASE.md]

## SPEC REQUIREMENTS
[Relevant must-have from .goopspec/<activeWorkflowId>/SPEC.md]

## TASK DETAILS
[From .goopspec/<activeWorkflowId>/BLUEPRINT.md]

Intent: [intent]
Deliverables: [list]
Files: [paths]
Verification: [command]
Acceptance: [criteria]

## INSTRUCTIONS
1. Implement following existing patterns
2. Commit atomically
3. Return XML response envelope
4. Include spec coverage in response
  `
})
```

### 3.2 Parse XML response

- Extract status (COMPLETE/PARTIAL/BLOCKED)
- Extract artifacts (files, commits)
- Extract handoff instructions

### 3.3 Update CHRONICLE.md

Write to `.goopspec/<activeWorkflowId>/CHRONICLE.md` (resolved from active workflow):

```markdown
### Task [N.M]: [Name]
- Status: [Complete/Partial/Blocked]
- Commit: [sha]
- Files: [list]
- Time: [timestamp]
```

### 3.4 Handle status

| Status | Action |
|--------|--------|
| COMPLETE | Continue to next task |
| PARTIAL | Resume with partial context |
| BLOCKED | Check deviation rules |

---

## Phase 4: Deviation Handling

**Apply deviation rules:**

| Rule | Trigger | Action |
|------|---------|--------|
| Rule 1 | Bug found | Auto-fix, document |
| Rule 2 | Missing critical | Auto-add, document |
| Rule 3 | Blocking issue | Auto-fix, document |
| Rule 4 | Architectural | **STOP**, ask user |

**On Rule 4:**

Display context, then use `question` tool:

```
## 🔮 GoopSpec · Decision Required

⚠️ **Type:** Architectural Decision

**Context:** [From executor response]

**Recommendation:** [If any]
```

```ts
question({
  questions: [{
    header: "Architectural Decision",
    question: "[Concise description of the decision needed]",
    options: [
      { label: "[Option A] (Recommended)", description: "[Impact of option A]" },
      { label: "[Option B]", description: "[Impact of option B]" }
    ],
    multiple: false
  }]
})
```

Resume execution with the selected option.

---

## Phase 5: Wave Completion

**At end of each wave:**

### ⚠️ update-wave Calling Convention

**CRITICAL:** `goop_state({ action: "update-wave" })` MUST only be called AFTER a wave's tasks have fully completed and been verified. Calling it before a wave runs triggers premature auto-progression to the accept phase.

**Rule:** `update-wave(N, total)` means "N waves are now complete." Call it only after wave N's tasks are done and verified.

**Correct two-step convention:**
```
# === Starting Wave 3 of 5 ===
# Step 1: Record Wave 2 complete BEFORE starting Wave 3 tasks
goop_state({ action: "update-wave", currentWave: 2, totalWaves: 5 })

[Execute all Wave 3 tasks...]
[Verify Wave 3...]

# Step 2: Wave 3 tasks done — record Wave 3 complete
goop_state({ action: "update-wave", currentWave: 3, totalWaves: 5 })
goop_checkpoint({ action: "save", id: "wave-3-complete" })
```

**Rule:** When *starting* Wave N, call `update-wave(N-1, totalWaves)` to record the previous wave complete. When Wave N *finishes*, call `update-wave(N, totalWaves)` to record Wave N complete. Exception: Wave 1 has no previous wave — skip the start-of-wave call and only call `update-wave(1, totalWaves)` after Wave 1 completes.

**Anti-pattern (causes premature accept):**
```
# About to start Wave 5 of 5 — WRONG, this fires auto-progression immediately
goop_state({ action: "update-wave", currentWave: 5, totalWaves: 5 })
# ❌ Auto-progression triggers here → accept phase starts before Wave 5 runs!
[Wave 5 tasks never execute]
```

**Why this matters:** The auto-progression hook checks `currentWave >= totalWaves` after every tool call. If you call `update-wave(5, 5)` to "announce" you're starting Wave 5, the hook sees all waves as complete and transitions to the accept phase immediately — before any Wave 5 tasks run.

### 5.1 Run wave verification
```
Spawn goop-verifier for wave-level checks
```

### 5.2 Update CHRONICLE.md
```markdown
## Wave [N]: COMPLETE
- Tasks: [X/X]
- Commits: [list]
- Verification: PASSED
- Time: [timestamp]
```

### 5.3 Record wave completion and save checkpoint
```
# Wave N verified — NOW mark it complete (see update-wave convention above)
goop_state({ action: "update-wave", currentWave: N, totalWaves: M })

goop_checkpoint({ 
  action: "save",
  id: "wave-N-complete",
  context: { wave: N, phase: "execute" }
})
```

### 5.4 Generate HANDOFF.md
```markdown
# Session Handoff

**Phase:** execute
**Wave:** [N] of [M] complete

## Accomplished
- [x] Task N.1: [description]
- [x] Task N.2: [description]

## Next Session
Run: /goop-execute

## Context
Wave [N] complete. Starting Wave [N+1] next.
```

### 5.5 Offer continuation options

Display wave summary, then use `question` tool:

```
## 🔮 GoopSpec · Wave [N] Complete

✨ Wave finished successfully

| Metric | Status |
|--------|--------|
| Tasks | ✓ [X/X] complete |
| Commits | [Y] |
| Verification | ✓ PASSED |
```

```ts
question({
  questions: [{
    header: "Wave [N] Complete",
    question: "How would you like to continue?",
    options: [
      { label: "Continue to Wave [N+1] (Recommended)", description: "Proceed in the current session" },
      { label: "Pause and resume later", description: "Save checkpoint, start fresh next time" }
    ],
    multiple: false
  }]
})
```

**On "Continue to Wave [N+1]":** Proceed to next wave in current session.

**On "Pause and resume later":** Save checkpoint via `/goop-pause`, generate HANDOFF.md, suggest starting a new session and running `/goop-execute`.

### 5.6 Session-Length Guidance (non-blocking)

Show this guidance only after the current wave is fully complete (after 5.1-5.5). Never interrupt mid-wave.

**Trigger condition:**
```
IF currentWave >= 2:
  show session-length recommendation
```

**Recommendation text:**
```
You've completed [N] waves in this session. For optimal context quality, consider:
1. Save checkpoint: `/goop-pause`
2. Start a fresh session
3. Resume with `/goop-resume` or `/goop-execute`

This is a recommendation, not a requirement. Execution can continue in this session.
```

This guidance is advisory only and must not block execution.

---

## Phase 6: Execution Complete

**When all waves done:**

```
## 🔮 GoopSpec · Execution Complete

✨ All waves finished successfully

| Metric | Status |
|--------|--------|
| Waves | ✓ [M/M] complete |
| Tasks | ✓ [P/P] complete |
| Commits | [Q] |

All must-haves implemented and verified.
```

### 6.1 Offer Pull Request Creation

Use `question` tool:
- header: "Pull Request"
- question: "Execution complete. Would you like to create a pull request now?"
- options:
  - "Create PR" — Create a well-formatted pull request
  - "Create draft PR" — Create as draft, finalize after acceptance
  - "Skip for now (Recommended)" — Create PR after verification in /goop-accept

**On "Create PR" or "Create draft PR":**

Follow the PR creation process from git-workflow reference:

1. **Ask which branch to target.**

Use `question` tool:
- header: "PR Target Branch"
- question: "Which branch should this PR merge into?"
- options:
  - "main" — Merge into main branch
  - "develop" — Merge into develop branch

The user can also type a custom branch name.

Store the answer as `$TARGET_BRANCH`.

2. Check branch status:
```bash
git branch --show-current
git log $TARGET_BRANCH..HEAD --oneline
git diff $TARGET_BRANCH...HEAD --stat
```

3. Generate PR title and description:
- **Title:** `type(scope): Descriptive summary` (no GoopSpec terminology)
- **Body:** Summary, Changes, Testing (from CHRONICLE.md), Notes

4. Create PR:
```bash
gh pr create --base $TARGET_BRANCH --title "type(scope): Title" --body "..." [--draft]
```

5. Display PR URL

### 6.2 Display next steps

```
### ✅ Execution Complete

All waves finished. The implementation is ready for acceptance review.

**🚨 Start a new session, then run `/goop-accept`**

Why a new session? Execution sessions accumulate significant context from planning and wave-by-wave delegation. Starting fresh gives the acceptance phase a clean, accurate view of the finished work.

---
```

**Autopilot continuation:** If `workflow.autopilot === true`, immediately call:

```
mcp_slashcommand({ command: "/goop-accept" })
```

**DO NOT** display "Start a new session, then run `/goop-accept`" and stop in autopilot mode. Announcing intent in text without calling the tool is a **hard failure** — the accept phase never starts. The transition only happens when `mcp_slashcommand` is actually executed. The accept phase will pause for mandatory user review regardless of autopilot state.

---

## Examples

### Starting Execution
```
User: /goop-execute

Orchestrator:
## 🔮 GoopSpec · Execution

✓ Spec gate passed

## 🔮 GoopSpec · Wave 1 of 3: Foundation

[Delegating Task 1.1...]

goop-executor-high: Task 1.1 COMPLETE (commit: abc123)

[Delegating Task 1.2...]

goop-executor-medium: Task 1.2 COMPLETE (commit: def456)

## 🔮 GoopSpec · Wave 1 Complete

→ [question tool: Continue to Wave 2 / Pause and resume later]
```

### Checkpoint Reached
```
goop-executor-high: BLOCKED - Rule 4 deviation

## 🔮 GoopSpec · Decision Required

**Context:** Database schema change needed

→ [question tool: Add index / Skip index]

User: Add index

Orchestrator: Resuming with selected option...
```

---

*Execution Process v0.2.8*
