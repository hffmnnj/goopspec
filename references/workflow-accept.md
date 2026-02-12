# Workflow: Accept

Verifies implementation against the locked contract, captures explicit acceptance, and completes archival automatically.

## Requirements

- requirement matrix with evidence
- tests and typecheck status
- security checklist status
- explicit user confirmation (`accept`) before archival

## Outcomes

- accepted: run archival and completion lifecycle in `/goop-accept`
- accepted artifacts: archive directory, retrospective, extracted learnings, optional git tag
- rejected/issues: return to `/goop-execute` or `/goop-amend`

*Workflow: Accept*
