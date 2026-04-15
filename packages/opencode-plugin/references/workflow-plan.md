# Workflow: Plan

Transforms discovery output into executable contract artifacts.

## Inputs

- `.goopspec/REQUIREMENTS.md`
- workflow state (`interview_complete`)

## Outputs

- `.goopspec/SPEC.md`
- `.goopspec/BLUEPRINT.md`
- `.goopspec/CHRONICLE.md`

## Rules

- every must-have maps to at least one task
- blueprint tasks include verification steps
- unknowns should trigger targeted research

## Exit Condition

Planning complete and ready for `/goop-specify`.

*Workflow: Plan*
