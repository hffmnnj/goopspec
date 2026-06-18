# Enforcement System

Hook-based enforcement that turns GoopSpec from suggestions into an enforced workflow.

## Components

### Phase Context Builder

Generates phase-specific `MUST DO` / `MUST NOT DO` rules for injection into system prompts.

Key functions:

- `buildPhaseEnforcement(phase, state)`
- `buildStateContext(state)`
- `buildEnforcementContext(state)`
- `isOperationAllowed(phase, operation)`

### Document Scaffolder

Creates phase directory structure with templated documents.

Key functions:

- `scaffoldPhaseDocuments(ctx, phaseName, phase)`
- `checkPhaseDocuments(ctx, phaseName, phase)`

Required documents by phase (checked via `goop_read_db({ doc_type: "..." })` returning content, not a 'not found' message):

| Type | Required In |
|------|-------------|
| `spec` | plan, research, specify, execute, accept |
| `blueprint` | specify, execute, accept |
| `chronicle` | plan, research, specify, execute, accept |

### Validators

Validate operations against the current phase.

Key functions:

- `validateWriteOperation(phase, filePath)`
- `validatePhaseTransition(ctx, from, to)`
- `isImplementationFile(filePath)`

Protected implementation directories include `src/`, `lib/`, `app/`, `apps/`, `packages/`, `server/`, `client/`.

## Hooks

### System Transform Hook

Injects enforcement context into every system prompt:

- Current phase and state.
- Phase-specific `MUST DO` / `MUST NOT DO` rules.
- Delegation reminders in execute phase.
- Memory context for continuity.

### Command Processor Hook

Processes `/goop-*` slash commands, triggers state transitions, scaffolds phase documents, and logs to ADL.

| Command | Target Phase |
|---------|--------------|
| `/goop-discuss` | plan (discovery) |
| `/goop-plan` | plan |
| `/goop-research` | research |
| `/goop-execute` | execute |
| `/goop-accept` | accept |

### Orchestrator Enforcement Hook

- Blocks `edit`/`write` on implementation files for the orchestrator.
- Allows planning files (`.goopspec/`, `.md`, `.json`).
- Enforces direct `task()` delegation with rich prompts.
- Tracks delegations per session.

## Phase Rules

### Plan Phase

MUST DO:

- Ask clarifying questions.
- Create spec document via `goop_write_db({ doc_type: "spec", content: "..." })` with must-haves, nice-to-haves, out of scope.
- Get user confirmation before proceeding.

MUST NOT DO:

- Write implementation code.
- Edit files in `src/`.
- Skip requirement gathering.

### Research Phase

MUST DO:

- Read spec via `goop_read_db({ doc_type: "spec" })`.
- Persist findings as Field Notes via `goop_save_note`. Search prior research via `goop_search_notes`.
- Document trade-offs and recommendations.

MUST NOT DO:

- Write implementation code.
- Modify source files.

### Specify Phase

MUST DO:

- Create blueprint document via `goop_write_db({ doc_type: "blueprint", content: "..." })` with wave-based plan.
- Map all must-haves to tasks.
- Get user confirmation to lock specification.

MUST NOT DO:

- Write implementation code.
- Proceed without locked specification.

### Execute Phase

MUST DO:

- Delegate all code work via `task()`.
- Track progress via `goop_write_db({ doc_type: "chronicle", content: "..." })`.
- Follow wave order.
- Save checkpoints at wave boundaries.

MUST NOT DO:

- Write code directly.
- Skip verification.

### Accept Phase

MUST DO:

- Verify all must-haves.
- Run tests.
- Get explicit user acceptance.

MUST NOT DO:

- Mark complete without verification.
- Skip user confirmation.

## Context Injection

Project-level knowledge flows automatically to every agent via `PROJECT_KNOWLEDGE_BASE.md`.

### What to Include

- Stack choices (runtime, framework, libraries).
- Naming conventions.
- Commit format.
- Major architectural decisions.
- Known gotchas.

### What to Exclude

- Sensitive data (API keys, passwords).
- Temporary workarounds.
- Personal preferences.
- Speculation.

### Injection Points

- Every subagent reads `PROJECT_KNOWLEDGE_BASE.md` before starting work.
- Orchestrator prompts include relevant context sections.
- `memory_search` augments injected knowledge with task-specific memories.

### Maintenance

The memory-distiller agent updates `PROJECT_KNOWLEDGE_BASE.md` after major decisions, pattern discoveries, gotcha discoveries, and at session end.

## Troubleshooting

### "Cannot write to file" errors

Delegate to `goop-executor-{tier}`. The orchestrator is blocked from writing implementation files.

### Phase transition rejected

Ensure required documents exist in DB before transitioning (check via `goop_read_db({ doc_type: "..." })` returning content):

- `execute` requires `spec` document in DB.
- `accept` requires `spec`, `blueprint`, and `chronicle` documents in DB.

### Commands not triggering state changes

Verify the command is processed by checking ADL entries via `goop_adl({ action: "read" })`.

---

*Enforcement System v1.0 — GoopSpec Reference*
