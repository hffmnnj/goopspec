# Core Protocol

The GoopSpec workflow: five phases, DB-as-state, and memory-first execution.

## Five-Phase Workflow

```
discuss -> plan -> execute -> accept -> confirm
```

| Phase | Purpose | Key Output |
|-------|---------|------------|
| **discuss** | Capture intent and constraints | `REQUIREMENTS.md` |
| **plan** | Turn requirements into a locked contract | `SPEC.md`, `BLUEPRINT.md`, `CHRONICLE.md` |
| **execute** | Implement the blueprint in waves | Updated `CHRONICLE.md`, commits |
| **accept** | Verify against the contract and finalize | Verification report, archive |
| **confirm** | Archive milestone and extract learnings | `RETROSPECTIVE.md`, memory |

Each phase has a gate; a phase cannot start until the previous gate is satisfied. See `phase-gates.md`.

## DB-as-State

Project state lives in GoopSpecDB (`.goopspec/goopspec.db`). Markdown files under `.goopspec/<workflowId>/` are rendered sidecars — the DB is the source of truth.

| File | Scope | Purpose | Storage |
|------|-------|---------|---------|
| `REQUIREMENTS.md` | workflow | Vision, must-haves, constraints, out of scope, assumptions, risks | `documents` table; rendered sidecar |
| `SPEC.md` | workflow | Locked contract with must-haves, nice-to-haves, out of scope, traceability | `documents` table; rendered sidecar |
| `BLUEPRINT.md` | workflow | Wave/task plan with verification and spec coverage | `documents` table; rendered sidecar |
| `CHRONICLE.md` | workflow | Progress log, decisions, deviations, blockers | `documents` table; rendered sidecar |
| `ADL.md` | workflow | Automated Decision Log | `documents` table; rendered sidecar |
| `HANDOFF.md` | workflow | Session handoff context | `documents` table; rendered sidecar |
| `PROJECT_KNOWLEDGE_BASE.md` | global | Stack, conventions, decisions, patterns, gotchas | `.goopspec/PROJECT_KNOWLEDGE_BASE.md` |
| `state.json` | global | **Replaced by GoopSpecDB `workflows` table** | `.goopspec/goopspec.db` |
| `memory.db` | global | Episodic/semantic memory | `.goopspec/memory.db` |
| `goopspec.db` | global | Unified state DB | `.goopspec/goopspec.db` |
| `config.json` | global | User configuration | `.goopspec/config.json` |

For workflow path resolution:

- Resolve `workflowId` from `goop_state({ action: "get" })` before reading or writing workflow docs.
- Read workflow docs via `goop_read_db({ doc_type: "..." })`.
- Write workflow docs via `goop_write_db({ doc_type: "...", content: "..." })`; the tool renders the sidecar automatically.
- `config.json` and `memory.db` are always global files.

## DB Tool Surface

- Documents: `goop_read_db`, `goop_write_db`, `goop_append_chronicle`, `goop_read_section`, `goop_write_section`, `goop_search_docs`.
- Waves and tracking: `goop_write_wave`, `goop_query_decisions`, `goop_blocker`.
- Project views: `goop_timeline`, `goop_dashboard`.
- Field Notes: `goop_save_note`, `goop_search_notes`.

## Memory-First Protocol

Every agent follows the same loop:

1. **Before:** `memory_search`, read state, read `PROJECT_KNOWLEDGE_BASE.md`, read `spec` and `blueprint` via `goop_read_db`.
2. **During:** record observations with `memory_save` (type `observation`), decisions with `memory_save` (type `decision`), progress via `goop_write_db({ doc_type: "chronicle" })`.
3. **After:** persist learnings with `memory_save`, update chronicle, return a structured response.

Useful memory types:

| Type | Use | Importance |
|------|-----|------------|
| `observation` | Patterns, gotchas, verified facts | 0.5-0.7 |
| `decision` | Architectural or scope choices | 0.7-0.9 |
| `note` | Quick captures, reminders | 0.3-0.6 |
| `todo` | Actionable follow-up items | 0.4-0.6 |

Tag memories with relevant `concepts` so later searches surface them.

### Memory Hygiene

| Priority | Importance | What to Save |
|----------|------------|--------------|
| High | 8-10 | User preferences, project decisions, architecture patterns, technology choices |
| Medium | 5-7 | Codebase patterns, bug fixes, feature details, configuration |
| Low | 3-4 | Routine observations, temporary context |

**Never store:** secrets, private keys, personal information, content inside `<private>` tags, large code blocks (store file paths instead).

**Search strategy:** search before starting work, save after learning something, search when asked about history. Be specific with titles, extract atomic facts, use consistent concepts, include source files.

## Tool-Call Batching

For maximum efficiency, whenever you need multiple independent operations, invoke all relevant tools simultaneously in a single message rather than sequentially. For example, when reading 3 documents, issue 3 read calls in parallel.

**Narrative or sequential ordering in a plan is NOT the same as a data dependency.** If tool call B does not consume tool call A's output, batch them together in the same message — even if B logically follows A in your plan. Only call tools sequentially when a later call genuinely needs an earlier call's result.

### Worked Example

**BEFORE (wrong — two separate messages/turns):**

```
Message 1: goop_state({ action: "create-workflow", workflowId: "my-workflow" })
Message 2: goop_state({ action: "set-active-workflow", workflowId: "my-workflow" })
```

and

```
Message 1: goop_state({ action: "get" })
Message 2: goop_state({ action: "set-autopilot", autopilot: true, lazy: true })
```

(In both cases, the second call's inputs did not depend on the first call's output — they should have been batched.)

**AFTER (correct):**

```
Single message: goop_state({ action: "create-workflow", workflowId: "my-workflow", activate: true })
```

(Note: once the `activate` flag lands, this becomes a single call instead of two — the best fix is often to eliminate the second call entirely via a tool-design improvement, not just batch it.)

```
Single message, two parallel tool calls:
  - goop_state({ action: "get" })
  - goop_search_notes({ query: "..." })
(called together in the same turn since neither depends on the other's output)
```

## Agent Boot Sequence

**Recommended path:** [`goop_boot`](tool-reference.md) (documented in `tool-reference.md`) combines steps 2–6 below — doc reads, Field Note search, memory search, and reference load — into a single call. New agent work should prefer `goop_boot` for efficiency. The granular step-by-step sequence remains valid and is useful when an agent needs fine control over which pieces to fetch.

Before doing work, every subagent must:

1. `goop_state({ action: "get" })`
2. `goop_read_db({ doc_type: "spec" })` — load spec contract
3. `goop_read_db({ doc_type: "blueprint" })` — load task context
4. `goop_search_notes({ query: "[task context]" })` — check Field Notes for prior research. If a snippet is relevant but insufficient, use `note_id` (when the ID is already known from the snippet) or `full: true` (when re-issuing the query) to retrieve the complete body — see `field-notes-protocol.md` (Enhanced Retrieval) for full guidance.
5. `memory_search({ query: "[task context]" })`
6. `goop_reference({ name: "tool-reference" })` — load the full argument surface of every tool; prefer batch/plural args over repeated single calls where available.
7. `Read(".goopspec/PROJECT_KNOWLEDGE_BASE.md")` if present
8. Acknowledge current phase, spec lock status, and active task.

If any required bootstrap step fails, return `BLOCKED`.

## Planning File Rules

- `spec` document is read-only for executors; only the orchestrator/planner may write it.
- `blueprint` document is read-only for executors; only the orchestrator/planner may write it.
- `chronicle` document is read-write for all agents; update it after each task via `goop_write_db({ doc_type: "chronicle" })`.
- Research findings are persisted as Field Notes via `goop_save_note` and searched via `goop_search_notes`.

## Atomic Commit Protocol

Every completed task must produce at least one atomic commit.

- Commit after every task. Never wait until the end of a wave.
- Never batch multiple tasks into a single commit.
- A wave with N tasks should produce at least N commits.
- Use conventional commit format: `type(scope): description`.
- Never reference GoopSpec phases, waves, task IDs, or planning docs in commit messages.
- Include a short body explaining why.
- Prefer multiple focused commits when a task contains unrelated changes.

See `git-workflow.md` for full commit conventions.
See `pr-creation.md` for wave-level PR strategy, branch naming, and the single-branch parallelism rule.

## Response Envelope

Subagent responses use the lean markdown-header format defined in `response-format.md`. The old XML envelope is deprecated.

Required sections: `STATUS`, `SUMMARY`, `ARTIFACTS`, `VERIFICATION`, `NEXT`.

## Task Modes

| Mode | Use | Flow |
|------|-----|------|
| **quick** | Small fix, single file, < 30 min; orchestrator may self-edit trivial config/docs per the 5-condition test in `commands/goop-quick.md` (Self-Edit Authority) | Discuss → Execute → Accept |
| **standard** | Feature or moderate work | Full 5-phase workflow |
| **comprehensive** | Complex system | Full workflow + deep research + parallel agents |
| **milestone** | Major release | Multiple cycles + archive + git tag |

## Status Indicators

Use in `CHRONICLE.md` and task reports:

| Symbol | Meaning |
|--------|---------|
| `[OK]` | Complete/Passed |
| `[FAIL]` | Failed/Error |
| `[WARN]` | Attention required |
| `[WORK]` | In progress |
| `[WAIT]` | Blocked/Waiting |
| `[GATE]` | User confirmation required |

## Progress Tracking

Update `CHRONICLE.md` after every task. Each task record should include status, files touched, verification result, and any blockers. Track useful metrics over time: tasks completed per hour, average task duration, deviation frequency, checkpoint frequency.

## Archive & Learning Extraction

When a milestone completes:

1. Move workflow docs to `archive/`.
2. Generate `RETROSPECTIVE.md`.
3. Extract `LEARNINGS.md`.
4. Persist learnings to memory with semantic `concepts` and atomic `facts`.
5. Tag git with the milestone version.

Example memory entry:

```typescript
memory_save({
  type: "observation",
  title: "Milestone Learning: [name]",
  concepts: ["auth", "jwt", "security"],
  facts: ["jose library better than jsonwebtoken for ESM"],
  importance: 0.8
})
```

## Anti-Patterns

- Starting work without loading state and spec.
- Writing workflow docs to `.goopspec/` root for a non-default workflow.
- Returning vague reports without artifacts, verification, or next steps.
- Implementing without mapping changes to a must-have.

---

*Core Protocol v1.0 — GoopSpec Reference*
