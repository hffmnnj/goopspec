# Executor Core Protocol

Shared execution protocol for all executor tiers (`goop-executor-low`, `goop-executor-medium`, `goop-executor-high`, `goop-executor-frontend`).

This document defines executor-specific rules that are common across tiers. It complements shared references and avoids duplicating their full content.

## Scope

Use this reference for all code implementation tasks delegated to executor agents.

This reference does not define:
- Tier-specific scope boundaries
- Tier-specific emphasis or heuristics
- Model-specific guidance

## ⚠️ MANDATORY FIRST STEP

**DO NOT proceed past this section until all steps are complete.**

Before any implementation:

1. Load project state with `goop_state({ action: "get" })`
2. Read:
   - `.goopspec/SPEC.md`
   - `.goopspec/BLUEPRINT.md`
   - `.goopspec/PROJECT_KNOWLEDGE_BASE.md` (if present)
3. Validate spec lock:
   - If `specLocked` is `false`, STOP and return `CHECKPOINT`.
   - DO NOT CONTINUE when spec is unlocked.
4. Search memory:
   - `memory_search({ query: "[task description]", limit: 5 })`
5. Load core references:
   - `references/subagent-protocol.md`
   - `references/deviation-rules.md`
   - `references/response-format.md`
   - `references/xml-response-schema.md`
   - `references/handoff-protocol.md`
   - `references/context-injection.md`
6. Acknowledge state before coding:
   - current phase
   - spec lock status
   - current task
   - key must-haves
   - project conventions

**STOP and return `BLOCKED` if any required bootstrap step fails. DO NOT CONTINUE past this section.**

## Plugin Context Awareness

### Primary Tools

| Tool | Purpose |
|------|---------|
| `goop_state` | Read/validate workflow state and spec lock |
| `goop_spec` | Read and validate spec artifacts |
| `goop_adl` | Log deviations from the planned implementation |
| `memory_search` | Retrieve relevant prior decisions and patterns |
| `memory_note` | Capture significant observations during execution |
| `memory_save` / `memory_decision` | Persist outcomes and rationale after execution |

### Hook Awareness

- `tool.execute.after`: captures file-write outcomes for memory/context
- `system.transform`: injects project conventions and state context

### Memory Flow

`memory_search` -> implement -> `memory_save`

## Core Philosophy

- Quality first: produce production-grade, review-ready code
- Follow existing project conventions and patterns
- Keep code self-documenting; avoid obvious comments
- Test and verify before reporting completion

## Spec Alignment (Non-Negotiable)

Every change must map to a spec must-have. If a requested change cannot be mapped, STOP and return `CHECKPOINT`. DO NOT CONTINUE with implementation.

Include a mapping in executor reports:

```markdown
### Spec Alignment
| Change | SPEC Must-Have | Why it maps |
|--------|----------------|-------------|
| [Change] | MH-XX | [Reason] |
```

## Atomic Commit Protocol

- Commit at least once per completed task
- Keep each commit to one logical change
- Use universal language (no internal phase/wave/task references)
- Follow `type(scope): description`

Canonical commit guidance: `references/git-workflow.md`.

## Memory-First Checks

Use this executor-specific sequence alongside `references/subagent-protocol.md`:

- **Before:** search memory, load spec/blueprint/context, inspect existing patterns
- **During:** log observations (`memory_note`), record decisions (`memory_decision`), update progress artifacts when required
- **After:** persist outcomes (`memory_save`), include verification evidence and commit SHA in report

## Code Quality Standards

### Do

- Follow naming and structural patterns already used in the codebase
- Handle errors and input validation at boundaries
- Keep code testable and type-safe
- Remove debug-only artifacts before commit

### Do Not

- Introduce `any` without hard justification
- Add comments that restate obvious behavior
- Skip verification or rely on assumptions
- Ignore existing conventions

## Task Execution Pattern

Follow this sequence for each executor task:

1. **Understand**: task intent, acceptance criteria, target files
2. **Explore**: relevant patterns/utilities in the codebase
3. **Implement**: minimal, correct, convention-aligned changes
4. **Verify**: run task verification and quality gates
5. **Commit**: create atomic commit(s) with proper message format
6. **Report**: provide structured output with artifacts and next action

## Deviation Handling and ADL Logging

Apply rule set from `references/deviation-rules.md`:

- Rules 1-3: auto-fix (bugs, critical missing safeguards, blockers)
- Rule 4: stop and request decision (architectural changes)

When deviating, append an ADL entry via `goop_adl` with:
- rule number
- issue description
- action taken
- affected files

## Commit Message Format

Use this structure (details in `references/git-workflow.md`):

```text
type(scope): concise but descriptive title

[2-4 sentence rationale: why this change is needed]

Changes:
- Specific change with context
- Specific change with impact
```

Allowed types: `feat`, `fix`, `test`, `refactor`, `docs`, `chore`, `perf`.

## Verification Matrix (Required)

Every executor response includes a verification matrix with real command evidence.

```markdown
### Verification Matrix
| Command | Pass/Fail | Evidence |
|---------|-----------|----------|
| bun test | Pass/Fail | [observed output] |
| bun run typecheck | Pass/Fail | [observed output] |
| Manual | Pass/Fail | [manual check result] |
```

If a check is not run, mark `Fail` and explain why.

## XML Response Requirements

Responses must end with a `<goop_report>` XML envelope and include:
- status
- state
- summary
- artifacts (files and commits)
- verification checks
- handoff next action

Canonical schema and field rules:
- `references/xml-response-schema.md`
- `references/response-format.md`

## Handoff Requirements

Executor reports must always include explicit next steps in XML handoff:
- `ready` status
- `next_action` with responsible agent
- required files to read
- blockers (or `None`)
- `suggest_new_session` when appropriate
- next command

For PARTIAL responses, include exact `file:line` resume points.

Canonical handoff guidance: `references/handoff-protocol.md`.

## Anti-Patterns

Never:
- Start implementation without loading state/spec/task context
- Continue when spec lock is false (STOP and return `CHECKPOINT`)
- Implement changes that cannot map to a must-have
- Return vague completion reports without evidence
- Omit commit SHA or verification outcomes
- Use internal terminology in commit messages

## Related References

- `references/subagent-protocol.md`
- `references/deviation-rules.md`
- `references/git-workflow.md`
- `references/xml-response-schema.md`
- `references/response-format.md`
- `references/handoff-protocol.md`
- `references/context-injection.md`

---

*Executor Core Protocol v0.2.7*
