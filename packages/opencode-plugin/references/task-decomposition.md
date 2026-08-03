# Task Decomposition

Breaking work into waves and tasks for focused, parallel execution.

## Principles

- **Vertical slices**: group by feature, not technical layer. Each wave delivers coherent user-visible value.
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
- Each task should fit in one focused agent session.
- Complex work → multiple focused waves rather than one overloaded wave.

| Task Size | Example |
|-----------|---------|
| Too large | "Implement authentication system" |
| Just right | "Create user model with password hashing" |
| Too small | "Add email field to user model" |

Tasks should take roughly 15–60 minutes. Front-load risky tasks and leave ~20% buffer.

## Traceability

Every must-have from `SPEC.md` must map to at least one task. Every task must map to a must-have or clear enabler.

| Must-Have | Covered By |
|-----------|------------|
| MH1 | Wave 1, Tasks 1.1, 1.2 |
| MH2 | Wave 2, Task 2.1 |

## Dependency Types

| Type | Definition | Example |
|------|------------|---------|
| Hard | Task B cannot start until Task A completes | Create schema → Implement repository |
| Soft | Task B is easier if A completes, but not required | Set up linting → Implement feature |
| None | Tasks are completely independent | Implement auth → Implement logging |

Avoid circular dependencies and false dependency chains.

## Per-Wave Questioning

Validate assumptions before finalizing each wave. Number of questions scales with depth:

| Depth | Questions per wave |
|-------|--------------------|
| shallow | 1-2 |
| standard | 3-4 |
| deep | 5-6 |

Each question should:

- Reference specific files, modules, or technologies.
- Target unknowns, assumptions, risk boundaries, or edge cases.
- Offer concrete tradeoffs, not generic prompts.

If answers expose unknowns, dispatch `goop-researcher` and/or `goop-explorer` before finalizing.

## Post-Wave Review Gate

After all waves are drafted:

1. Offer an "Approve All" shortcut.
2. If the user chooses per-wave review, iterate each wave with options: **Approve Wave**, **Request More Research**, **Clarify Scope**.
3. Only finalize the blueprint when every wave is approved.

### Autopilot Behavior

Under `autopilot` or `lazyAutopilot`, skip the interactive per-wave review entirely: automatically select "Approve All" and finalize the blueprint without waiting for user input. Log the auto-approval to ADL via `goop_adl`. This mirrors the plan→execute contract-gate skip described in `references/phase-gates.md` §Autopilot Behavior — lazy autopilot never pauses for this gate.

## Depth Tiers

| Tier | Discuss | Plan | Research | Agents | Token Impact |
|------|---------|------|----------|--------|--------------|
| shallow | Minimal clarification; accept requirements as-given | Lean blueprint, fewer waves, minimal research | Single source | Sequential only | ~1x |
| standard | Balanced clarification; confirm key assumptions | Full blueprint with wave decomposition and 3-4 questions per wave | 2-3 sources | 1-2 parallel when independent | ~2x |
| deep | Thorough discovery; challenge assumptions and edge cases | Detailed blueprint with 5-6 questions per wave and parallel research | Multi-source with parallel sub-research | Multiple parallel agents | ~3-5x |

## update-wave Calling Convention

`goop_state({ action: "update-wave" })` records the wave currently in progress.

- `update-wave(N, total)` means "Wave N is now in progress," using 1-based numbering.
- `currentWave: 0` means no wave has started.
- Call `update-wave(N, total)` when work on Wave N begins, including `update-wave(1, total)` when Wave 1 starts.
- Wave completion comes from the `waves` and `wave_tasks` records, not from this progress indicator.

### Parallel Execution Within a Wave

Tasks inside a wave may run in parallel when they have no file, resource, or state conflicts. After parallel execution:

1. Verify no conflicts in modified files.
2. Run the changed rung per `references/test-authoring.md` §Test Execution Discipline.
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
