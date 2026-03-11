# Subagent Protocol

All GoopSpec subagents follow a standardized protocol for memory usage, planning file access, and communication with the orchestrator.

## ⚠️ MANDATORY FIRST STEP

**DO NOT proceed past this section until all steps are complete.**

1. `goop_state({ action: "get" })` - Load workflow state
2. `Read(".goopspec/<workflowId>/SPEC.md")` - Read specification <!-- workflowId is the active workflow identifier, e.g., "feat-auth" -->
3. `Read(".goopspec/<workflowId>/BLUEPRINT.md")` - Read execution plan
4. `memory_search({ query: "[task context]", limit: 5 })` - Search relevant memory
5. `Read(".goopspec/PROJECT_KNOWLEDGE_BASE.md")` - If present

Load references: `goop_reference({ name: "executor-core" })`

**Then acknowledge:** current phase, spec lock status, active task.

**STOP and return `BLOCKED` if any required step fails. DO NOT CONTINUE past this section.**

## Core Principles

```
+================================================================+
|  SUBAGENTS ARE MEMORY-FIRST.                                    |
|  Search before starting. Save during work. Persist after.       |
|  Decisions and learnings flow through memory.                   |
+================================================================+

+================================================================+
|  SUBAGENTS USE XML RESPONSE ENVELOPES.                          |
|  Every response ends with a <goop_report> XML block.            |
|  See references/xml-response-schema.md for full format.         |
+================================================================+

+================================================================+
|  SUBAGENTS LOAD PROJECT CONTEXT.                                |
|  Read PROJECT_KNOWLEDGE_BASE.md for conventions.                |
|  Align work with spec must-haves.                               |
+================================================================+
```

## The Memory-First Protocol

### Before Starting Work

Every subagent MUST:

```typescript
// 1. Read project state
goop_state({ action: "get" })

// 2. Read project knowledge base
Read(".goopspec/PROJECT_KNOWLEDGE_BASE.md")  // If exists

// 3. Search for relevant past decisions
memory_search({ 
  query: "[task-specific query]",
  concepts: ["relevant", "concepts"],
  types: ["decision", "observation"]
})

// 4. Read the specification
Read(".goopspec/<workflowId>/SPEC.md")

// 5. Read current state
Read(".goopspec/<workflowId>/CHRONICLE.md")

// 6. Read the task details
Read(".goopspec/<workflowId>/BLUEPRINT.md")
```

### During Work

Every subagent SHOULD:

```typescript
// Update progress
Edit(".goopspec/<workflowId>/CHRONICLE.md", {
  update: "Task 2.1: [status]"
})

// Note important observations
memory_note({ 
  note: "Discovered pattern: [description]" 
})

// Record any decisions made
memory_decision({
  decision: "Used approach X over Y",
  reasoning: "[rationale]",
  alternatives: ["Y", "Z"]
})
```

### After Completing Work

Every subagent MUST:

For full commit conventions and examples, see `references/git-workflow.md`.

```typescript
// 1. Commit all task changes before reporting completion
//    Format: type(scope): description
//    See references/git-workflow.md for full rules
git add [changed files]
git commit -m "type(scope): description"

// 2. Update chronicle with outcome
Edit(".goopspec/<workflowId>/CHRONICLE.md", {
  update: "Task 2.1: COMPLETE (commit: abc123)"
})

// 3. Persist learnings
memory_save({
  type: "observation",
  title: "[task] completed",
  content: "[summary of approach and outcome]",
  concepts: ["patterns-used", "technologies"],
  importance: 0.6
})

// 4. Return clear summary to orchestrator
//    Include commit SHA in both the summary fields and XML artifacts.commits
return {
  status: "complete",
  summary: "[what was done]",
  files_modified: ["path/to/file.ts"],
  commit: "abc123",
  notes: ["any important observations"]
}
```

## Planning File Access

### SPEC.md (Read-Only for Subagents)

The specification is the contract. Subagents:
- MUST read to understand requirements
- MUST NOT modify (only orchestrator can)
- MUST reference when making decisions

```markdown
# SPEC.md - What to Build

## Must Haves
- Requirement 1 (guides implementation)
- Requirement 2 (guides implementation)

## Out of Scope
- Item 1 (guides what NOT to do)
```

### BLUEPRINT.md (Read-Only for Subagents)

The execution plan. Subagents:
- MUST read to understand their task
- MUST NOT modify (only orchestrator/planner can)
- USE to understand context and dependencies

```markdown
# BLUEPRINT.md - How to Build

## Wave 2
### Task 2.1: [This is your task]
**Files:** src/auth/login.ts
**Action:** Implement login handler
**Verify:** npm test
**Done:** User can log in
```

### CHRONICLE.md (Read-Write for Subagents)

The journey log. Subagents:
- MUST read for current state
- SHOULD update with progress
- MUST update on completion

```markdown
# CHRONICLE.md - What's Happening

## Current State
- Wave: 2
- Task: 2.1 [IN PROGRESS by executor]

## Progress
- [x] Task 1.1 (commit: abc)
- [ ] Task 2.1 [WORKING]
```

### RESEARCH.md (Write for Research Agents)

Research findings. Research agents:
- WRITE findings during Research phase
- Other agents READ for context

```markdown
# RESEARCH.md - What We Learned

## Technology Options
- Option A: [pros, cons]
- Option B: [pros, cons]

## Recommendations
[Approach to take]
```

## Communication with Orchestrator

### XML Response Envelope (MANDATORY)

All subagent responses MUST end with an XML envelope. See `references/xml-response-schema.md` for the full specification.

**Basic structure:**

```xml
<goop_report version="0.2.8">
  <status>COMPLETE|PARTIAL|BLOCKED|CHECKPOINT</status>
  <agent>goop-[type]</agent>
  <task_name>Task description</task_name>
  
  <state>
    <phase>plan|specify|execute|accept</phase>
    <spec_locked>true|false</spec_locked>
  </state>
  
  <summary>1-2 sentence summary</summary>
  
  <artifacts>
    <files>
      <file path="path/to/file" action="created|modified">reason</file>
    </files>
    <commits>
      <commit sha="abc123">type(scope): message</commit>
    </commits>
  </artifacts>
  
  <memory>
    <saved type="decision" importance="0.7">Memory title</saved>
  </memory>
  
  <handoff>
    <ready>true|false</ready>
    <next_action agent="goop-[type]">Next task description</next_action>
    <suggest_new_session>true|false</suggest_new_session>
    <next_command>/goop-[command]</next_command>
  </handoff>
</goop_report>
```

### Status Meanings

| Status | Meaning | Orchestrator Action |
|--------|---------|---------------------|
| `COMPLETE` | Task fully done | Move to next task |
| `PARTIAL` | Some progress, more needed | Continue same task |
| `BLOCKED` | Cannot proceed | Assess blocker, may need user |
| `CHECKPOINT` | Natural stopping point | Generate handoff, suggest new session |

### Raising Issues

When subagents encounter problems:

```typescript
// Blockable issues (Rule 1-3: auto-fix)
memory_note({ note: "Fixed: [issue] using [approach]" })
// Continue working

// Architectural issues (Rule 4: ask)
// STOP and return BLOCKED. Do not continue until resolved.
return {
  status: "blocked",
  summary: "Encountered architectural decision",
  blockers: ["Need to decide: REST vs GraphQL for new endpoint"],
  notes: ["Options: A) REST (consistent with existing), B) GraphQL (more flexible)"]
}
```

## Agent-Specific Protocols

### goop-executor-{tier}

Primary implementation agent.

```
BEFORE:
- Read SPEC.md for requirements
- Read BLUEPRINT.md for task details
- Check existing patterns in target files

DURING:
- Follow existing code conventions
- Write clean, tested code
- Commit atomically per task

AFTER:
- Update CHRONICLE.md
- Persist pattern observations
- Return commit hash
```

### goop-researcher

Deep domain exploration.

```
BEFORE:
- Search memory for past research
- Understand what information is needed

DURING:
- Explore multiple sources
- Compare alternatives
- Document tradeoffs

AFTER:
- Write to RESEARCH.md
- Persist key findings to memory
- Return research summary
```

### goop-explorer

Fast codebase mapping.

```
BEFORE:
- Understand what patterns/files to find
- Search memory for known areas

DURING:
- Map relevant code quickly
- Extract patterns and conventions
- Note integration points

AFTER:
- Update RESEARCH.md (codebase section)
- Persist patterns to memory
- Return map summary
```

### goop-verifier

Specification compliance checking.

```
BEFORE:
- Read SPEC.md (must-haves)
- Read CHRONICLE.md (what was done)

DURING:
- Verify each requirement
- Run automated checks
- Check security considerations

AFTER:
- Generate verification report
- Persist verification status
- Return pass/fail with evidence
```

### goop-debugger

Bug investigation using scientific method.

```
BEFORE:
- Understand bug report
- Search memory for similar issues
- Read relevant code

DURING:
- Form hypothesis
- Design experiment
- Test and iterate

AFTER:
- Document root cause
- Persist learning to memory
- Return fix or investigation report
```

## Memory Usage Patterns

### What to Save

| Type | When | Example |
|------|------|---------|
| `observation` | Discovering patterns | "Codebase uses repository pattern" |
| `decision` | Making choices | "Used jose over jsonwebtoken" |
| `note` | Quick captures | "Auth tests are flaky on CI" |

### Importance Levels

| Level | When | Effect |
|-------|------|--------|
| 0.9+ | Critical decisions | Always surfaced in searches |
| 0.7-0.8 | Important learnings | Surfaced for related queries |
| 0.5-0.6 | General observations | Background context |
| < 0.5 | Minor notes | Rarely surfaced |

### Concept Tagging

Tag memories with concepts for semantic search:

```typescript
memory_save({
  title: "Auth implementation approach",
  concepts: ["authentication", "jwt", "security", "session"],
  // ...
})
```

## Anti-Patterns

### Don't: Ignore Memory

```
❌ Start working immediately without searching
❌ Forget to persist learnings
❌ Repeat research already done
```

### Don't: Skip Planning Files

```
❌ Guess requirements instead of reading SPEC.md
❌ Work on wrong task (didn't read BLUEPRINT.md)
❌ Duplicate work (didn't check CHRONICLE.md)
```

### Don't: Return Vague Responses

```
❌ "Done" (no details)
❌ "It works now" (no verification)
❌ "Made some changes" (no specifics)
```

### Do: Follow the Protocol

```
✓ Search memory → Read files → Do work → Update files → Save memory → Return structured response
```

## Summary Checklist

Every subagent execution:

- [ ] Run `goop_state({ action: "get" })` for current phase
- [ ] Read PROJECT_KNOWLEDGE_BASE.md for conventions
- [ ] Searched memory for relevant context
- [ ] Read SPEC.md for requirements
- [ ] Read CHRONICLE.md for current state
- [ ] Read BLUEPRINT.md for task details
- [ ] Aligned work with spec must-haves
- [ ] Updated CHRONICLE.md with progress
- [ ] Persisted learnings to memory
- [ ] Returned XML response envelope with:
  - [ ] Status (COMPLETE/PARTIAL/BLOCKED/CHECKPOINT)
  - [ ] Summary of work
  - [ ] Files modified with artifacts section
  - [ ] Commit hash (if applicable)
  - [ ] Memory persisted section
  - [ ] Handoff with next_action and suggest_new_session

---

*Subagent Protocol v0.2.8*
