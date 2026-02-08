# Acceptance Process

Process for `/goop-accept`.

## 1) Gate Check

Run first:

```text
goop_status()
Read(".goopspec/CHRONICLE.md")
Read(".goopspec/SPEC.md")
Read(".goopspec/BLUEPRINT.md")
```

Block if execution is incomplete or unresolved blockers remain.

## 2) Verification

Delegate:
- `goop-verifier`: requirement matrix + security checks
- `goop-tester`: tests + typecheck

Minimum checks:
- all must-haves pass
- tests/typecheck pass
- no critical security gaps

## 3) Present Report

Show:
- must-have matrix (pass/fail + evidence)
- test results
- security summary
- overall verdict

If failed: route back to `/goop-execute` or `/goop-amend`.

## 4) Acceptance Gate

On pass, request explicit user decision:
- `accept`
- `issues`
- `cancel`

## 5) On Accept

1. `goop_state({ action: "confirm-acceptance" })`
2. Persist acceptance with `memory_save`
3. Prepare handoff to `/goop-complete`
4. Optionally offer PR creation (`gh pr create`)

PR output must use universal language (no internal workflow terms).

*Acceptance Process*
