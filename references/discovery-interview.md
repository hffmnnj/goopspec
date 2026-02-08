# Discovery Interview

Mandatory requirement capture before planning.

## Purpose

Prevent scope creep and rework by locking clear requirements before `/goop-plan`.

## Required Outputs

- `.goopspec/REQUIREMENTS.md`
- workflow state updated with `interview_complete: true`

## Six Required Questions

1. **Vision**: what are we building, for whom, and success criteria?
2. **Must-Haves**: non-negotiable deliverables with acceptance criteria.
3. **Constraints**: stack, integration, timeline, and limits.
4. **Out of Scope**: explicitly excluded work.
5. **Assumptions**: what must already be true.
6. **Risks**: key unknowns and mitigations.

## Interview Flow

1. Open-ended discovery to understand intent.
2. Structured probing through the six questions.
3. Summarize findings and confirm with user.
4. Write `REQUIREMENTS.md` and mark interview complete.

## Completion Criteria

Interview is incomplete if any of these are missing:
- specific vision
- non-empty must-haves
- non-empty out-of-scope
- at least one risk with mitigation

## Skip Conditions

Allowed only for:
- `/goop-quick` small tasks
- clear bug fixes
- docs-only changes

## Anti-Patterns

- vague answers ("auth stuff", "it should work")
- no boundaries
- no risk analysis

*Discovery Interview Protocol*
