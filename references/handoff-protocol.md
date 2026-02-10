# Handoff Protocol

The Handoff Protocol ensures clean context transitions between sessions. Following the GSD pattern, each phase ends with full documentation enabling a fresh agent to continue with a clean 200k context window.

## Core Principle

```
+================================================================+
|  CONTEXT IS PRECIOUS. FRESH CONTEXT = QUALITY WORK.             |
|  At natural boundaries, generate HANDOFF.md and suggest         |
|  starting a new session for clean context.                      |
+================================================================+
```

## When to Generate Handoff

### Mandatory Handoff Points
1. **Phase completion** - After plan, specify, execute, accept
2. **Wave completion** - After each wave in execution
3. **Checkpoint reached** - User decision needed
4. **Context getting full** - Long session with many files read

### Optional Handoff Points
1. **Natural pause** - User stepping away
2. **Complex task boundary** - Before major implementation
3. **Research complete** - Before acting on findings

## HANDOFF.md Structure

```markdown
# Session Handoff

**Generated:** [timestamp]
**Phase:** [current phase]
**Session:** [session_id if available]

---

## Accomplished This Session

### Completed
- [x] [Task/milestone 1]
- [x] [Task/milestone 2]
- [x] [Task/milestone 3]

### Key Outcomes
- [Significant outcome 1]
- [Significant outcome 2]

### Decisions Made
- **[Decision 1]**: [Choice made] - [Rationale]
- **[Decision 2]**: [Choice made] - [Rationale]

---

## Current State

### Workflow Position
- **Phase:** [plan|specify|execute|accept]
- **Spec Locked:** [yes|no]
- **Wave:** [N of M] (if executing)
- **Task:** [X of Y] (if executing)

### Files Modified
- `path/to/file1.ts` - [what changed]
- `path/to/file2.ts` - [what changed]

### Commits Made
- `abc1234` - type(scope): message
- `def5678` - type(scope): message

---

## Next Session Instructions

### Command to Run
```
/goop-[command]
```

### Files to Read First
1. `.goopspec/SPEC.md` - Requirements contract
2. `.goopspec/BLUEPRINT.md` - Execution plan
3. `.goopspec/CHRONICLE.md` - Progress log
4. [Additional relevant files]

### Context Summary
[2-4 sentences of essential context the next session needs to know.
Focus on decisions made, patterns established, and gotchas discovered.]

### Immediate Next Task
**Task:** [Exact task description]
**Files:** `path/to/files`
**Action:** [What needs to be done]
**Verify:** [How to verify completion]

---

## Warnings & Blockers

### Active Blockers
[None | List of blockers with context]

### Gotchas Discovered
- [Pattern or issue to be aware of]
- [Dependency or integration concern]

### Pending Decisions
[None | Decisions that need user input]

---

*Start a new session for fresh context.*
*Run the command above to continue.*
```

## Handoff Generation Rules

### What to Include
- All tasks completed this session
- Key decisions with rationale
- Exact workflow position
- Files modified with descriptions
- Critical context for continuation
- Explicit next steps

### What NOT to Include
- Full file contents (just paths)
- Detailed implementation code
- Speculation about future work
- Information already in SPEC/BLUEPRINT/CHRONICLE

### Context Summary Guidelines
The context summary should be:
- **Concise**: 2-4 sentences max
- **Actionable**: Focus on what matters for next task
- **Specific**: Mention actual file names, patterns, decisions
- **Fresh**: Don't repeat what's in planning files

**Good example**:
> "Auth service implemented in src/auth/ using jose for JWT. Decided to use 24h expiry with refresh tokens stored in httpOnly cookies. Note: existing session.ts has a conflict with our middleware - need to refactor the order in next session."

**Bad example**:
> "Made good progress on auth. Some things were implemented. There might be some issues to look at."

## Integration with Other Files

### CHRONICLE.md Update
Before generating HANDOFF.md:
```markdown
## Session [date]

### Completed
- Task 2.1: [description] (commit: abc123)
- Task 2.2: [description] (commit: def456)

### State
- Wave 2: 2/4 tasks complete
- Next: Task 2.3

### Handoff Generated
See: .goopspec/HANDOFF.md
```

### STATE.md Update
Human-readable state mirror:
```markdown
# Current State

**Phase:** execute
**Wave:** 2 of 3
**Task:** 3 of 4
**Last Updated:** [timestamp]

## Quick Resume
Run `/goop-execute` to continue Wave 2.
```

### Memory Persistence
Before handoff:
```typescript
memory_save({
  type: "observation",
  title: "Session handoff: [feature]",
  content: "[key context for future sessions]",
  concepts: ["handoff", "feature-name", "phase"],
  importance: 0.7
})
```

## Agent Responsibilities

### Orchestrator
- Detect handoff points
- Generate HANDOFF.md
- Update CHRONICLE.md
- Suggest new session to user

### Subagents
- Return `suggest_new_session: true` in XML when:
  - Complex task completed
  - Significant context accumulated
  - Natural pause point reached
- Include handoff-ready summary in response

## User Communication

### At Handoff Point
```markdown
## Session Checkpoint

I've completed [summary of work] and saved the state.

**Current position:** Phase [X], Wave [N], Task [M]

### To Continue
1. Start a **new session** for fresh context
2. Run: `/goop-execute`

The new session will have:
- Full 200k context window
- All state from HANDOFF.md
- Clear next steps

### Files Saved
- `.goopspec/HANDOFF.md` - Session handoff
- `.goopspec/CHRONICLE.md` - Progress log
- `.goopspec/STATE.md` - Current state

Ready to continue in new session!
```

### Quick Resume (Same Session)
If user wants to continue without new session:
```markdown
Continuing in current session.

**Note:** Context is at [X]% - quality may degrade with complex tasks.
Consider starting fresh if encountering issues.

Proceeding with Task [N]...
```

## Anti-Patterns

### Bad: No Context in Handoff
```markdown
## Next Session
Run /goop-execute
```
**Problem**: Next session has no context about what happened.

### Bad: Too Much Detail
```markdown
## Context Summary
[500 lines of implementation details]
```
**Problem**: Defeats the purpose of clean handoff.

### Bad: Missing Next Steps
```markdown
## Completed
- Task 1
- Task 2
```
**Problem**: Next session doesn't know what to do.

### Good: Clean and Actionable
```markdown
## Next Session Instructions

### Command to Run
/goop-execute

### Context Summary
Completed auth service with JWT. Using jose library, 24h expiry. 
Middleware in src/auth/middleware.ts protects routes. 
Next: Add refresh token logic to extend sessions.

### Immediate Next Task
**Task:** W2.T3 - Implement refresh tokens
**Files:** src/auth/refresh.ts, src/auth/service.ts
**Action:** Add refresh endpoint and token rotation
**Verify:** bun test src/auth/
```

---

*Handoff Protocol v0.2.6*
*"Fresh context, quality work."*
