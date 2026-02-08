# Handoff Protocol

Use handoffs to preserve continuity and reset context at natural boundaries.

## When to Handoff

Mandatory:
- Phase completion
- Wave completion
- Checkpoint/user decision points
- Context-heavy sessions

Optional:
- Natural pause
- Complex task boundary

## HANDOFF.md Required Sections

```markdown
# Session Handoff
**Generated:** [timestamp]
**Phase:** [phase]

## Accomplished This Session
- Completed tasks
- Key outcomes
- Decisions with rationale

## Current State
- Phase / wave / task
- Files modified
- Commits

## Next Session Instructions
- Command to run
- Files to read first
- 2-4 sentence context summary
- Immediate next task (files + verify command)

## Warnings & Blockers
- Active blockers
- Gotchas
- Pending decisions
```

## Handoff Quality Rules

- Include exact next action.
- Do not dump full file contents.
- Keep context summary concise and actionable.
- Update `CHRONICLE.md` before/with handoff generation.

## XML Handoff Alignment

- `handoff.ready`: true when task boundary is complete.
- `handoff.next_action`: exact continuation instruction.
- `handoff.files_to_read`: required context docs.
- `handoff.suggest_new_session`: true at wave/phase boundaries or heavy context points.

## Anti-Patterns

- "Run /goop-execute" with no context.
- Long implementation dumps in handoff notes.
- Missing blockers or missing resume point.

*Handoff Protocol*
