# Quick Mode Process

Detailed process for `/goop-quick` - fast-track execution for small, well-defined tasks.

## Phase 1: Qualify

**Execute BEFORE any implementation:**

### 1.1 Check current state

```
goop_status()
goop_state({ action: "get" })        # NEVER read state.json directly
```

### 1.2 Note quick criteria

Quick mode works best for tasks that are:

| Criterion | Guidance |
|-----------|----------|
| **Scope** | Single file OR max 3 tightly coupled files |
| **Clarity** | Intent is clear and unambiguous |
| **Complexity** | No architectural decisions required |
| **Effort** | Estimated < 15 minutes of work |
| **Dependencies** | No new packages/dependencies needed |

These are informational guidelines. Proceed with the task — the user has chosen quick mode.

### 1.3 Search for prior context

```
memory_search({ query: "[task topic] [file/component names]", limit: 3 })
```

Check for:
- Similar past fixes
- Related decisions
- Known patterns in this area

---

## Phase 2: Capture

**Display quick mode banner:**

```
## 🔮 GoopSpec · Quick Mode

**Task:** [Task description]

---
```

### 2.1 Define the plan (one sentence)

Format:
> **Plan:** [Action verb] [what] in [where].

Examples:
- "Adjust z-index in Modal.css."
- "Fix typo in navbar component."
- "Add null check in useAuth hook."

### 2.2 Define success criterion (one statement)

Format:
> **Success:** [Observable outcome].

Examples:
- "Modal appears above overlay."
- "Navbar displays 'Settings' instead of 'Settnigs'."
- "No crash when user is null."

### 2.3 Display the capture

```
## 🔮 GoopSpec · Quick Plan

**Plan:** [One sentence]

**Success:** [One criterion]

**Files:** [List of files to modify]

Proceeding to execute...

---
```

### 2.4 Log to ADL

```
goop_adl({
  action: "append",
  type: "decision",
  description: "Quick fix: [brief description]",
  entry_action: "Using quick mode for small, scoped change",
  files: ["path/to/file.ts"]
})
```

---

## Phase 3: Execute

### 3.1 Read the target files

```
Read("[target file(s)]")
```

Understand the current state before making changes.

### 3.2 Make the change

Apply the fix using `Edit` or `Write` tools.

**Rules:**
- ONE logical change per file
- Follow existing code patterns
- No scope creep - stick to the plan

### 3.3 Verify the change works

Run relevant checks:

```bash
# Type check (if TypeScript)
bun run typecheck

# Run tests (if applicable)
bun test [relevant test file]

# Or manual verification
[command to verify]
```

### 3.4 Create atomic commit

```bash
git add [files]
git commit -m "fix: [brief description]"
```

Commit message format:
- `fix:` for bug fixes
- `chore:` for maintenance
- `docs:` for documentation
- `style:` for formatting

---

## Phase 4: Verify & Accept

### 4.1 Confirm success criterion

Check that the defined success criterion is met.

**If verification fails:**
```
## 🔮 GoopSpec · Quick Fix Failed

✗ Verification failed.

**Expected:** [success criterion]
**Actual:** [what happened]

Retrying with adjusted approach...

---
```

### 4.2 Display completion

```
## 🔮 GoopSpec · Quick Fix Complete

✨ Task completed successfully

**Task:** [Description]
**Commit:** [sha]
**Files:** [list]

**Verification:** ✓ [success criterion met]

---

Type **'accept'** to confirm, or describe any issues.
```

### 4.3 Handle user response

| Response | Action |
|----------|--------|
| "accept" / "done" / "looks good" | Mark complete, thank user |
| Describes issue | Assess and address the issue |
| Silence (continues other work) | Consider task accepted |

### 4.4 Final confirmation

```
## 🔮 GoopSpec · Accepted

✓ Quick fix confirmed.

**Summary:**
- [One line summary]
- Commit: [sha]

---
```

---

## Examples

### Simple Fix

```
User: /goop-quick Fix the z-index on the modal

Orchestrator:
## 🔮 GoopSpec · Quick Mode

**Task:** Fix the z-index on the modal

---

[Checking quick criteria...]
✓ Single file (Modal.css)
✓ Clear intent (z-index issue)
✓ No architecture decisions
✓ < 15 min effort
✓ No new dependencies

## 🔮 GoopSpec · Quick Plan

**Plan:** Increase z-index value in Modal.css.

**Success:** Modal appears above overlay.

**Files:** src/components/Modal.css

Proceeding to execute...

---

[Reads file, makes change, commits]

## 🔮 GoopSpec · Quick Fix Complete

✨ Task completed successfully

**Task:** Fix the z-index on the modal
**Commit:** abc1234
**Files:** src/components/Modal.css

**Verification:** ✓ Modal now has z-index: 1000, above overlay (z-index: 100)

---

Type **'accept'** to confirm.

User: accept

## 🔮 GoopSpec · Accepted

✓ Quick fix confirmed.
```

---

*Quick Mode Process v0.2.8*
