# Status Display Process

Process for `/goop-status`.

## Data Sources

- `goop_state`: phase, locks, wave/task position
- planning docs: `REQUIREMENTS.md`, `SPEC.md`, `BLUEPRINT.md`, `CHRONICLE.md`
- optional handoff + checkpoint context

## Required Output Sections

- Project state (phase, interview/spec lock, wave/task)
- Gate status (discovery/spec/execution/acceptance)
- Progress (completed/in-progress/remaining)
- Active blockers and pending decisions
- Suggested next command

## Gate Logic

- Discovery pass: interview complete + requirements present
- Spec pass: spec exists + locked
- Execution pass: implementation complete
- Acceptance pass: verification and user acceptance complete

## Suggestions Matrix

- no interview -> `/goop-discuss`
- interview complete/no spec -> `/goop-plan`
- spec unlocked -> `/goop-specify`
- executing -> `/goop-execute`
- execution complete -> `/goop-accept`
- accepted -> `/goop-complete`

## Verbose Mode

Optionally include task history, deviations, checkpoints, and memory stats.

*Status Process*
