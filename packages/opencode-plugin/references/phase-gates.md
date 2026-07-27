# Phase Gates

Mandatory checkpoints that enforce workflow discipline. No phase proceeds until its gate is satisfied.

## Gate Overview

| Gate | Location | Requirement | Enforced By |
|------|----------|-------------|-------------|
| Discovery | Before `/goop-plan` | `interview_complete == true`, `requirements` document exists in DB (`goop_read_db({ doc_type: "requirements" })` returns content) | Orchestrator |
| Spec | Before `/goop-execute` | `spec_locked == true`, `spec` document exists in DB, at least one wave row exists (via `goop_read_wave`), 100% traceability | Orchestrator |
| Execution | Before `/goop-accept` | All waves and tasks complete, verification passing, no blockers | Orchestrator |
| Acceptance | Within `/goop-accept` | Verification passed, user explicitly accepts | Orchestrator |

## Gate Semantics

When a gate fails, the orchestrator must:

1. Return a `BLOCKED` response immediately.
2. State exactly which requirement is missing.
3. Provide the correct next command.
4. Not continue processing the current command.

Example blocked response:

```markdown
## GoopSpec · Gate Blocked

Specification must be locked before execution.

→ Run: `/goop-plan`
```

## Bypass Policy

| Gate | Bypass Allowed | Conditions |
|------|----------------|------------|
| Discovery | Yes | `/goop-quick`, clear bug fixes, documentation-only changes |
| Spec | No | Never — the locked contract is fundamental |
| Execution | Partial | Nice-to-haves may be deferred with user confirmation |
| Acceptance | No | Never — explicit user acceptance is required |

All bypasses must be logged via `goop_adl`.

### Quick Mode Self-Edit Carve-Out

`/goop-quick` permits the orchestrator to make narrow self-edits without delegating, but only when all five conditions in `commands/goop-quick.md` "Self-Edit Authority" are met: single file, `.goopspec/` or config-root scope, under 5 lines, no logic implications, quick-mode-only. This does **not** weaken the Spec gate, the Acceptance gate, or the general rule that the orchestrator never implements anything beyond those five conditions. `spec_locked == true` and explicit user acceptance remain absolute and never bypassable.

## Autopilot Behavior

Lazy autopilot relaxes checkpoint/pause behavior (skips the discovery interview, in-flight questions, and the contract-gate confirmation), but the spec-lock requirement and acceptance gate remain absolute and non-negotiable in both autopilot and lazy-autopilot modes.

### What Changes

- Lazy mode skips the discovery interview and infers requirements from the prompt.
- Lazy mode uses no `question` tool calls during discovery.
- Phase transitions use `mcp_slashcommand` automatically.
- **Both `autopilot` and `lazyAutopilot` skip the plan→execute contract-gate confirmation pause** — the orchestrator locks the spec and proceeds directly to `/goop-execute` without a user confirmation step.

### What Does Not Change

- The orchestrator remains a conductor: it delegates all implementation to executors.
- The spec gate still requires `spec_locked == true`.
- The acceptance gate still requires explicit user confirmation.
- **The acceptance gate remains untouched and is never bypassable, regardless of autopilot or lazy-autopilot mode.**
- All prohibited actions (editing `src/`, running package installs, inline code fixes) remain prohibited.

### Deviation Logging

All bypasses and rule applications must be appended via `goop_adl` with the rule number, issue, action, and affected files.

### Hard Stops in Autopilot

#### Regular Autopilot

Stop and wait for user input only for:

1. Rule 4 architectural decisions.
2. Credentials or secrets.
3. Destructive, irreversible operations.

#### Lazy Autopilot

Stop and wait for user input only for:

1. Credentials or secrets.
2. Destructive, irreversible operations.

On a Rule 4 trigger, decide autonomously using best judgment (do not pause to ask the user). Log the full rationale to ADL via `goop_adl` for every such call, including the rule number, the issue, the decision made, the reasoning, and the affected files.

### Lazy Autopilot Nudge (Runtime Enforcement)

Pausing during the execute phase under lazy autopilot is disallowed except for the enumerated hard stops (credentials/secrets, destructive operations). This is now **runtime-enforced by an injected nudge**, not prose alone.

The nudge fires on the `event` hook after `session.idle` returns. It injects a prompt-async message: "LAZY AUTOPILOT ENGAGED - Do not pause unless you 100% cannot move forward without something from the user. Use your best judgement and continue."

#### Suppression Guards (Nine Discriminated Reasons)

The nudge is suppressed when any of these conditions are true:

| # | Guard | Reason |
|---|-------|--------|
| G1 | `lazyAutopilot` is not `true` | Lazy autopilot disabled |
| G2 | Phase is not `execute` | Wrong phase |
| G3 | A compaction is queued or in-flight | Pending compaction |
| G4 | `acceptanceConfirmed` is not `true` | Awaiting acceptance |
| G5 | An open high-severity or critical blocker exists | High-severity blocker |
| G6 | The last assistant text matches credentials/secrets or destructive patterns | Hard-stop question |
| G7 | The last message role is not `assistant` | Mid-work (user is typing) |
| G8 | Rate limit or cooldown active | Rate-limited |
| G9 | Config kill switch is `false` | Kill-switch off |

#### Rate Limit and Abandonment

- **Cap**: defaults to 5 consecutive nudges without progress.
- **Cooldown**: defaults to 30,000ms between nudges.
- **Progress fingerprint**: `<phase>|<currentWave>|<task-status-digest>` where the digest is a comma-separated list of `task_index:status` for every task in the current wave (or `none` if no wave row exists). The consecutive counter resets only when this fingerprint changes.
- **Abandonment**: when the cap is reached with no progress change, the nudge stops and surfaces a user-visible message: "Autonomous continuation stopped: the session received multiple lazy-autopilot nudges without making progress. The loop was broken deliberately to avoid repeated interruptions; continue manually when you are ready."
- **Config kill switch**: set `lazyAutopilotNudge.enabled: false` in `goopspec.json` to disable the nudge entirely.

#### V1-Only Limitation

The lazy autopilot nudge is **V1-only**. V2 does not expose the `event` hook that the nudge dispatcher depends on (see `src/core/hooks-v2.ts` — `"event"` is in the skipped hooks array). Under V2, the nudge is inert and logs the limitation once at startup. The compaction survival hook is also V1-only for the same reason.

### Phase Transition Rule

Never announce a transition in text without actually calling the tool. Announcing intent is a hard failure because the next phase never starts.

| Transition | Required Tool Call |
|------------|-------------------|
| discuss → plan | `mcp_slashcommand({ command: "/goop-plan" })` |
| plan → execute | `mcp_slashcommand({ command: "/goop-execute" })` |
| execute → accept | `mcp_slashcommand({ command: "/goop-accept" })` |

## Four-Rule Deviation System

When an executor encounters a problem, apply these rules:

| Rule | Trigger | Action |
|------|---------|--------|
| **Rule 1: Bugs** | Logic, type, runtime, or security bugs | Auto-fix, document in ADL |
| **Rule 2: Missing Critical Safeguards** | Missing validation, error handling, auth checks, rate limiting | Auto-add, document in ADL |
| **Rule 3: Blocking Technical Issues** | Broken imports, missing deps, config errors | Auto-unblock, document in ADL |
| **Rule 4: Architectural Changes** | Schema changes, framework swaps, breaking APIs, new infrastructure | Stop and ask the user |

If unsure which rule applies, default to Rule 4. Log the uncertainty and request clarification to `ADL.md`.

Log every deviation with:

- rule number
- issue description
- action taken
- affected files

## Boundary System

Boundaries are three-tier guardrails enforced by hooks and configuration.

| Tier | Behavior | Examples |
|------|----------|----------|
| **Always** | Automatic, no confirmation | run tests before commit (satisfied by the scoped rung per `references/tdd.md`), atomic commits |
| **Ask First** | Requires user confirmation | schema changes, new dependencies, auth changes |
| **Never** | Prohibited | commit secrets, ignore failures, delete production data |

Configuration lives in `.goopspec/config.json`:

```json
{
  "boundaries": {
    "always": ["run_tests_before_commit"],
    "ask_first": ["schema_changes"],
    "never": ["commit_secrets"]
  }
}
```

Start strict and relax intentionally. Log justified exceptions to `ADL.md`.

## Anti-Patterns

- Continuing past a blocked gate.
- Bypassing the spec or acceptance gate silently.
- Announcing autopilot transitions instead of calling the tool.
- Treating lazy mode as "no rules."

---

*Phase Gates v1.0 — GoopSpec Reference*
