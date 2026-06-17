# Task Decomposition

Breaking work into waves and tasks for focused, parallel execution.

## Principles

- **Vertical slices**: group by feature, not by technical layer. Each wave delivers a coherent piece of user-visible value.
- **Horizontal layers**: avoid. Do not create a "models" wave, an "API" wave, and a "UI" wave.
- **Dependency order**: schedule foundational work before dependent features.
- **Verifiable chunks**: every task must have a clear verification step.

## Wave Architecture

```
Wave 1: Foundation (sequential, infrastructure)
  ├─ Task 1.1
  └─ Task 1.2

Wave 2: Features (parallel, depends on Wave 1)
  ├─ Task 2.1
  ├─ Task 2.2
  └─ Task 2.3

Wave 3: Integration (depends on Wave 2)
  └─ Task 3.1
```

## Sizing Guidance

- 2-4 tasks per wave.
- Each task should be completable in one focused agent session.
- Complex work → multiple focused waves rather than one overloaded wave.

### Task Granularity

| Size | Example |
|------|---------|
| Too large | "Implement authentication system" |
| Just right | "Create user model with password hashing" |
| Too small | "Add email field to user model" |

Tasks should take roughly 15–60 minutes. Front-load risky tasks and leave 20% buffer for surprises.

## Traceability

Every must-have from `SPEC.md` must map to at least one task. Every task must map to a must-have or a clear enabler.

| Must-Have | Covered By |
|-----------|------------|
| MH1 | Wave 1, Tasks 1.1, 1.2 |
| MH2 | Wave 2, Task 2.1 |

## Dependency Types

| Type | Definition | Example |
|------|------------|---------|
| Hard | Task B literally cannot start until Task A completes | Create schema → Implement repository |
| Soft | Task B is easier if A completes, but not required | Set up linting → Implement feature |
| None | Tasks are completely independent | Implement auth → Implement logging |

Avoid circular dependencies and false dependency chains.

## Per-Wave Questioning

After drafting a wave, validate assumptions before finalizing.

Number of questions scales with workflow depth:

| Depth | Questions per wave |
|-------|--------------------|
| shallow | 1-2 |
| standard | 3-4 |
| deep | 5-6 |

Each question should:

- Reference specific files, modules, or technologies in the wave.
- Target unknowns, assumptions, risk boundaries, or edge cases.
- Offer concrete tradeoffs, not generic prompts.

If answers expose unknowns, dispatch `goop-researcher` and/or `goop-explorer` before finalizing the wave.

## Post-Wave Review Gate

After all waves are drafted:

1. Offer an "Approve All" shortcut.
2. If the user chooses per-wave review, iterate each wave with options:
   - Approve Wave
   - Request More Research
   - Clarify Scope
3. Only finalize the blueprint when every wave is approved.

## Depth Tiers

| Tier | Discuss | Plan | Research | Agents | Token Impact |
|------|---------|------|----------|--------|--------------|
| shallow | Minimal clarification; accept requirements as-given | Lean blueprint, fewer waves, minimal research | Single source | Sequential only | ~1x |
| standard | Balanced clarification; confirm key assumptions | Full blueprint with wave decomposition and 3-4 questions per wave | 2-3 sources | 1-2 parallel when independent | ~2x |
| deep | Thorough discovery; challenge assumptions and edge cases | Detailed blueprint with 5-6 questions per wave and parallel research | Multi-source with parallel sub-research | Multiple parallel agents | ~3-5x |

## update-wave Calling Convention

Critical: `goop_state({ action: "update-wave" })` must only be called after a wave's tasks are fully complete and verified.

- `update-wave(N, total)` means "N waves are now complete."
- When starting Wave N, call `update-wave(N-1, total)` to record the previous wave complete.
- When Wave N finishes, call `update-wave(N, total)`.
- Exception: Wave 1 has no previous wave; call `update-wave(1, total)` only after Wave 1 completes.

Calling `update-wave(total, total)` before the final wave runs triggers premature auto-progression to the accept phase.

### Parallel Execution Within a Wave

Tasks inside a wave may run in parallel when they have no file, resource, or state conflicts. After parallel execution:

1. Verify no conflicts in modified files.
2. Run the full test suite to catch integration issues.
3. Resolve merge conflicts.
4. Create a consolidated checkpoint.

Start conservatively (2 parallel agents), increase when stable.

## Anti-Patterns

- Waves grouped by technical layer instead of feature.
- Tasks without verification steps.
- Must-haves that do not map to any task.
- Updating `update-wave` before a wave is verified.

---

*Task Decomposition v1.0 — GoopSpec Reference*
