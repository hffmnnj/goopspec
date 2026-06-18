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

## Anti-patterns

- Use quick mode for ambiguous or multi-wave work.
- Skip verification or the ADL log.
