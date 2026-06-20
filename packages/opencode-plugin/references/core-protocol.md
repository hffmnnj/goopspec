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

Each phase has a gate. A phase cannot start until the previous gate is satisfied. See `phase-gates.md` for gate semantics.

## DB-as-State

Project state is stored in GoopSpecDB (`.goopspec/goopspec.db`). Markdown files under `.goopspec/<workflowId>/` are **rendered outputs** from the DB, written automatically on every `goop_write_db` call. They are human-readable sidecars — the DB is the source of truth.

| File | Scope | Purpose | Storage |
|------|-------|---------|---------|
| `REQUIREMENTS.md` | workflow | Discovery output: vision, must-haves, constraints, out of scope, assumptions, risks | GoopSpecDB `documents` table; rendered as `.goopspec/<workflowId>/REQUIREMENTS.md` |
| `SPEC.md` | workflow | Locked contract with must-haves, nice-to-haves, out of scope, traceability | GoopSpecDB `documents` table; rendered as `.goopspec/<workflowId>/SPEC.md` |
| `BLUEPRINT.md` | workflow | Wave/task plan with verification steps and spec coverage | GoopSpecDB `documents` table; rendered as `.goopspec/<workflowId>/BLUEPRINT.md` |
| `CHRONICLE.md` | workflow | Progress log, decisions, deviations, blockers | GoopSpecDB `documents` table; rendered as `.goopspec/<workflowId>/CHRONICLE.md` |
| `ADL.md` | workflow | Automated Decision Log: deviations, architectural decisions, observations | GoopSpecDB `documents` table; rendered as `.goopspec/<workflowId>/ADL.md` |
| `HANDOFF.md` | workflow | Session handoff context for fresh sessions | GoopSpecDB `documents` table; rendered as `.goopspec/<workflowId>/HANDOFF.md` |
| `PROJECT_KNOWLEDGE_BASE.md` | global | Stack, conventions, decisions, patterns, gotchas | `.goopspec/PROJECT_KNOWLEDGE_BASE.md` (file, unchanged) |
| `state.json` | global | **Replaced by GoopSpecDB `workflows` table** | `.goopspec/goopspec.db` |
| `memory.db` | global | Episodic/semantic memory | `.goopspec/memory.db` (unchanged) |
| `goopspec.db` | global | Unified state DB (workflows, events, documents, field_notes) | `.goopspec/goopspec.db` |
| `config.json` | global | User configuration | `.goopspec/config.json` (file, unchanged) |

For workflow path resolution:
- Resolve `workflowId` from `goop_state({ action: "get" })` before reading or writing workflow docs.
- Read workflow docs via `goop_read_db({ doc_type: "..." })` — no path construction needed.
- Write workflow docs via `goop_write_db({ doc_type: "...", content: "..." })` — the tool renders the markdown sidecar automatically.
- `config.json` and `memory.db` are always global files.

## DB Tool Surface

- Documents: `goop_read_db`, `goop_write_db`, `goop_append_chronicle`, `goop_read_section`, `goop_write_section`, `goop_search_docs`.
- Waves and tracking: `goop_write_wave`, `goop_read_waves`, `goop_query_decisions`, `goop_record_verification`, `goop_read_verifications`, `goop_blocker`, `goop_write_traceability`.
- Project views: `goop_timeline`, `goop_dashboard`.
- Field Notes: `goop_save_note`, `goop_search_notes`.

## Memory-First Protocol

Every agent follows the same loop:

1. **Before:** `memory_search`, read state, read `PROJECT_KNOWLEDGE_BASE.md`, read spec via `goop_read_db({ doc_type: "spec" })` and blueprint via `goop_read_db({ doc_type: "blueprint" })`.
2. **During:** record observations with `memory_note`, decisions with `memory_decision`, progress via `goop_write_db({ doc_type: "chronicle", content: "..." })`.
3. **After:** persist learnings with `memory_save`, update chronicle via `goop_write_db`, return a structured response.

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

## Agent Boot Sequence

Before doing work, every subagent must:

1. `goop_state({ action: "get" })`
2. `goop_read_db({ doc_type: "spec" })` — load spec contract
3. `goop_read_db({ doc_type: "blueprint" })` — load task context
4. `goop_search_notes({ query: "[task context]" })` — check Field Notes for prior research
5. `memory_search({ query: "[task context]" })`
6. `Read(".goopspec/PROJECT_KNOWLEDGE_BASE.md")` if present
7. Acknowledge current phase, spec lock status, and active task.

If any required bootstrap step fails, return `BLOCKED`.

## Planning File Rules

- `spec` document is read-only for executors. Only the orchestrator/planner may write it via `goop_write_db({ doc_type: "spec", content: "..." })`.
- `blueprint` document is read-only for executors. Only the orchestrator/planner may write it via `goop_write_db({ doc_type: "blueprint", content: "..." })`.
- `chronicle` document is read-write for all agents; update it after each task via `goop_write_db({ doc_type: "chronicle", content: "..." })`.
- Research findings are persisted as Field Notes via `goop_save_note` and searched via `goop_search_notes({ query: "[topic]" })`.

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
| **quick** | Small fix, single file, \u003c 30 min | Discuss → Execute → Accept |
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
