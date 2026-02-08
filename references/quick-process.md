# Quick Mode Process

Process for `/goop-quick` small scoped tasks.

## 1) Qualification (all must pass)

- scope: <=3 tightly related files
- intent: clear and unambiguous
- complexity: no architecture decisions
- effort: short implementation window
- dependencies: no new packages

If any fail, deny quick mode and route to `/goop-discuss`.

## 2) Capture

Define:
- one-sentence plan
- one observable success criterion
- file list

Log quick-mode decision in ADL.

## 3) Execute

- read target files
- implement minimal change
- verify (`bun run typecheck`, targeted tests/manual check)
- create atomic commit

## 4) Confirm

- validate success criterion
- request user acceptance
- if failed or scope grows, escalate to full workflow

## Escalate Immediately If

- >3 files needed
- architecture/dependency decisions appear
- two failed attempts
- user expands scope

*Quick Mode Process*
