# Phase Gates

Mandatory quality gates controlling workflow progression.

## Gate Summary

| Gate | Transition | Required Condition | On Failure |
|---|---|---|---|
| Discovery | discuss -> plan | `interview_complete=true` and `REQUIREMENTS.md` exists | run `/goop-discuss` |
| Spec | plan -> execute | `spec_locked=true`, `SPEC.md` + `BLUEPRINT.md` valid, traceability complete | run `/goop-specify` |
| Execution | execute -> accept | all must-have tasks complete, no unresolved blockers, verification green | continue `/goop-execute` |
| Acceptance | accept -> complete | verification pass + explicit user acceptance | run `/goop-accept` |

## Discovery Gate

- Must capture: vision, must-haves, constraints, out-of-scope, assumptions, risks.
- Allowed bypass: `/goop-quick`, clear bug fixes, docs-only updates.
- Bypasses must be logged with `goop_adl`.

## Spec Gate

- Requires explicit user confirmation to lock contract.
- Once locked, changes require `/goop-amend`.
- Spec lock is never bypassed.

## Execution Gate

- Must-haves are non-negotiable.
- Nice-to-haves can be deferred only with explicit note in `CHRONICLE.md`.
- Blockers must be resolved or explicitly handled before acceptance.

## Acceptance Gate

- Requires requirement matrix + security review evidence.
- User must explicitly accept deliverable.
- Acceptance gate is never bypassed.

## Failure Handling

- Gate failure should return: failed condition, required recovery command, and next action.

*Phase Gates Protocol*
