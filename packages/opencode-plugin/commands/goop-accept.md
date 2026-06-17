---
name: goop-accept
description: Verify work, confirm acceptance, and archive the milestone
agent: orchestrator
phase: accept
requires: execution_complete
next-step: "After acceptance, archive and start the next milestone with /goop-discuss"
next-command: /goop-discuss
alternatives:
  - command: /goop-execute
    when: "If verification finds issues to fix"
---

# /goop-accept

Run the verification-to-archive lifecycle. The milestone is not complete until the user explicitly accepts.

## Gate check

Call `goop_state({ action: "get" })`. If `allWavesComplete` is not `true` or blockers exist, return `BLOCKED` with:

> Run `/goop-execute` first.

## Load references

```
goop_reference({ name: "phase-gates" })
goop_reference({ name: "security-checklist" })
```

## Steps

1. Read `SPEC.md` and `BLUEPRINT.md`.
2. Spawn `goop-verifier` to check must-have coverage, artifacts, key links, and quality.
3. Spawn `goop-tester` for test and build verification.
4. Present a verification matrix. Require explicit user acceptance.
5. On acceptance:
   - Copy workflow docs to `.goopspec/archive/<workflowId>-<timestamp>/`.
   - Verify the copy before deleting originals.
   - Generate `RETROSPECTIVE.md` and extract learnings to memory.
   - Optionally tag git.
   - Update `AGENTS.md` with verified learnings where appropriate.
6. On rejection or issues, return to `/goop-execute` or `/goop-amend`.

## Anti-patterns

- Accept without verification.
- Archive before confirming the copy.
- Delete original workflow docs without logging each file.
