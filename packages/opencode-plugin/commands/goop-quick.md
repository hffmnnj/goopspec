---
name: goop-quick
description: Fast-track a small, well-defined task
agent: orchestrator
phase: quick
next-step: "Confirm completion with the user"
---

# /goop-quick

Run a small task without a full discovery/spec contract. Use only when the task is truly small and safe.

## Load references

```
goop_reference({ name: "phase-gates" })
goop_reference({ name: "core-protocol" })
```

## Qualify

Quick mode is appropriate when the task is:

- A single file, or at most 3 tightly coupled files.
- Clear, unambiguous intent.
- No architectural decisions.
- Estimated under 30 minutes.
- No new dependencies.

If it does not qualify, switch to `/goop-discuss`.

## Steps

1. Capture one-line intent and one success criterion.
2. Log the bypass decision to `ADL.md` via `goop_adl`.
3. Delegate to the appropriate executor tier.
4. Create an atomic commit.
5. Verify the fix.
6. Ask the user to confirm completion.

## Self-Edit Authority

In `/goop-quick` mode only, the orchestrator may make trivial edits itself without delegating to a subagent — but **only** when ALL five conditions hold:

1. **Single file only** — not 2–3 files (stricter than Quick mode's general qualify criteria).
2. **File lives in `.goopspec/` or the project-config root** (e.g. `.goopspec/config.json`) — never `src/`, `lib/`, `app/`, `packages/*/src/`, `agents/`, `commands/`, `skills/`.
3. **Under 5 lines changed** (added + removed combined).
4. **No logic/behavior implications** — a typo fix, a config value bump, a comment, markdown formatting only.
5. **Already inside `/goop-quick` mode** — this is not a substitute for delegation during standard `/goop-execute`.

If any condition is not met, the orchestrator must delegate to the appropriate executor tier (step 3 below) — no exceptions.

## Anti-patterns

- Do NOT use quick mode for ambiguous, architectural, or multi-wave work.
- Skip verification or the ADL log.
