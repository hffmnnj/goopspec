# Workflow: Specify Phase

Specify defines the contract before execution.

## Objective

Produce and confirm a binding contract in `SPEC.md` with an executable `BLUEPRINT.md`.

## Required Outputs

- `SPEC.md`: must-haves, nice-to-haves, out-of-scope, traceability
- `BLUEPRINT.md`: waves and atomic tasks aligned to must-haves

## Contract Gate

Before execution, present:
- must-haves (committed delivery)
- out-of-scope (explicit exclusions)
- wave summary and task coverage

User chooses:
- `confirm` -> lock spec and proceed to execute
- `amend` -> revise contract then re-present gate
- `cancel` -> return to planning

## Amendment Rule

After lock, any scope change must go through `/goop-amend` with impact analysis and re-confirmation.

## Commands

- `/goop-specify` - run contract gate
- `/goop-amend` - request contract change
- `/goop-status` - inspect lock state

## Memory Triggers

- save lock decision at high importance
- save rationale for major exclusions

*Workflow: Specify*
