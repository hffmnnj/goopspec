# Specification Lock Process

Process for `/goop-specify`.

## 1) Gate Check

Read:
- `.goopspec/SPEC.md`
- `.goopspec/BLUEPRINT.md`

Block if missing documents or incomplete traceability.

## 2) Present Contract

Show:
- must-haves and mapped tasks
- out-of-scope list
- wave/task summary
- coverage status

Ask user to choose:
- `confirm` lock and proceed
- `amend` modify contract
- `cancel` return to planning

## 3) On Confirm

1. `goop_state({ action: "lock-spec" })`
2. persist lock decision in memory
3. prepare handoff for `/goop-execute`

## 4) Amendment Protocol

For locked specs:
- capture requested change
- assess impact on blueprint
- update docs
- re-confirm lock
- append amendment history

*Specification Lock Process*
