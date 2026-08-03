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

No other checkpoint is a valid reason to stop and wait in lazy autopilot — this includes wave-to-wave transitions, the per-wave blueprint review gate (see `task-decomposition.md` §Post-Wave Review Gate), checkpoint saves, and routine deviation handling. Only the two hard stops above (credentials/secrets; destructive/irreversible operations) and the acceptance gate's explicit merge-offer reply qualify.

### Lazy Autopilot Nudge (Runtime Enforcement)

Pausing during the execute phase under lazy autopilot is disallowed except for the enumerated hard stops (credentials/secrets, destructive operations). This is now **runtime-enforced by an injected nudge**, not prose alone.

The nudge fires on the `event` hook after `session.idle` returns. It injects a prompt-async message: "LAZY AUTOPILOT ENGAGED - Do not pause unless you 100% cannot move forward without something from the user. Use your best judgement and continue."

#### Suppression Guards (Eleven Discriminated Reasons)

The nudge is suppressed when any of these conditions are true. All guards evaluate before any SDK call. Guards added in the goopspec-state-integrity workflow are marked with †.

| # | Guard | Reason | Kind |
|---|-------|--------|------|
| G1 | `lazyAutopilot` is not `true` | Lazy autopilot disabled | `lazy-autopilot-disabled` |
| G2 | Phase is not `execute` | Wrong phase | `wrong-phase` |
| G2a† | Session metadata unavailable or session is a subagent | Session not nudge-eligible | `session-not-nudge-eligible` (sub-reasons: `metadata-unavailable`, `subagent`) |
| G2b† | Session directory does not match the plugin project directory | Project scope unverified | `project-scope-unverified` (sub-reasons: `directory-mismatch`, `sdk-directory-unavailable`) |
| G3 | A compaction is queued or in-flight | Pending compaction | `pending-compaction` |
| G4 | `acceptanceConfirmed` is not `true` | Awaiting acceptance | (retained for production-call fidelity; G2 owns phase eligibility) |
| G5 | An open high-severity or critical blocker exists | High-severity blocker | `high-severity-blocker` |
| G6 | The last assistant text matches credentials/secrets or destructive patterns | Hard-stop question | `hard-stop-question` |
| G7 | The last message role is not `assistant` | Mid-work (user is typing) | `mid-work` |
| G8 | Rate limit or cooldown active, or consecutive dispatch failures exceeded | Rate-limited or dispatch-failure cap | `rate-limited` or `dispatch-failure-cap` |
| G9 | Config kill switch is `false` | Kill-switch off | `kill-switch-off` |

**Fail-closed design:** Both G2a and G2b fail closed — indeterminate metadata or an unavailable plugin directory suppresses the nudge rather than treating it as eligible. A missed nudge costs nothing; a wrong-target nudge is the bug. Directories are canonicalised via `realpathSync.native` with `resolve` fallback, because raw string comparison would falsely suppress across symlinks or trailing slashes.

**Dispatch-failure cap (G8):** When `promptAsync` fails consecutively (default: 3), the nudge is suppressed with reason `dispatch-failure-cap` rather than retrying indefinitely. This is tracked in the same session-scoped rate-limiter state, not a competing counter.

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

### `currentWave` Semantics

`currentWave` means **the wave currently in progress**, 1-based; `0` means no wave has started. It does **NOT** mean "N waves are complete". That misreading caused premature auto-progression to the accept phase (the exact defect the goopspec-state-integrity workflow was built to fix).

- `update-wave(N, total)` records "Wave N is now in progress", not "N waves are done".
- Wave completion is determined from the `waves` and `wave_tasks` records, not from this counter.
- Auto-progression reads final-wave status and task completion counts, not counter equality.

### Manual-Override Latch

A forced phase transition (`goop_state({ action: "transition", force: true })`) sets a persisted `manualOverride` latch on the workflow. While set, auto-progression early-returns and does not advance the phase. This prevents a forced correction from being silently reverted on the next tool call.

- **Set by:** any forced phase transition.
- **Cleared by:** `goop_state({ action: "clear-manual-override" })` or a workflow reset.
- **Expected behaviour:** a workflow that refuses to auto-advance after a forced correction is behaving correctly — the latch is holding. Clear it explicitly when you are ready for normal auto-progression to resume.

### Fail-Closed Guard Blast Radius

When a task introduces a guard that fails closed on newly-required data, the blast radius covers **every existing test mock** that never supplied that data. Scoped test runs cannot see this by construction — it is only caught by a full-suite run.

This actually happened in the goopspec-state-integrity workflow (Wave 4): a fail-closed session-metadata guard broke two tests outside the scoped directory whose mocks predated the metadata requirement. The fix was adding the missing mock data (a test fix, not a product fix — fail-closed is the specified behaviour).

**Mitigation:** when dispatching a task that introduces a fail-closed guard on newly-required data, state the blast radius up front. The wave-boundary full-suite gate is the only reliable catch.

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

## Blocker Hygiene

Blockers are opened by agents calling `goop_blocker` — there is no auto-blocker mechanism. Because the tool is the only entry point, the boundary is where misuse is caught.

### Don't open blockers against completed waves

Opening a blocker against a wave whose status is already `done` or `completed` is **usually a mistake** — the wave is finished and the orchestrator has moved on. The `goop_blocker` tool detects this and returns a `WARNING:` prefix in its result, but **still opens the blocker**.

The warning is non-blocking by design: a late-discovered regression or an acceptance-phase issue that traces back to earlier work is a legitimate reason to open a blocker against a completed wave. Hard rejection would silently destroy that signal.

**When you see the warning:**

1. **Verify your intent.** Is this a genuine late-discovered regression against the completed wave, or did you pass the wrong `wave_id`?
2. **If it was a mistake**, resolve the blocker (`goop_blocker({ action: "resolve", id, resolution: "opened against wrong wave" })`) and open a new one against the correct in-progress wave, or omit `wave_id` for a workflow-level blocker.
3. **If it is legitimate**, proceed — the blocker is already open. Log the context to `ADL.md` so the regression is traceable.

### Target the right wave

- Pass `wave_id` as the **wave number** (the human-facing number, e.g. `3` for wave 3), not the internal row id.
- Omit `wave_id` for workflow-level blockers that aren't tied to a specific wave.
- The warning only fires when the wave **exists and is complete**. A non-existent wave number produces no warning (the blocker is opened as-is).

## Boundary System

Boundaries are three-tier guardrails enforced by hooks and configuration.

| Tier | Behavior | Examples |
|------|----------|----------|
| **Always** | Automatic, no confirmation | run tests before commit (satisfied by the scoped rung per `references/test-authoring.md` ## Test Execution Discipline), atomic commits |
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
