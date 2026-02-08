# Context Injection

Context injection keeps subagents aligned with project stack, conventions, and decisions.

## Source of Truth

`.goopspec/PROJECT_KNOWLEDGE_BASE.md` should contain:
- Project identity
- Non-negotiable stack
- Conventions (naming, exports, tests, commits)
- Architecture decisions
- Known gotchas and integration points

## Injection Flow

1. Read workflow state.
2. Read `PROJECT_KNOWLEDGE_BASE.md` if present.
3. Inject relevant context into delegated prompts.
4. Search memory for task-specific context.

## Subagent Contract

- Follow injected stack/convention choices.
- Reuse existing patterns before inventing new ones.
- Record new patterns/decisions to memory.
- Surface missing or stale knowledge for updates.

## Maintenance

`memory-distiller` should update the knowledge base when:
- major decisions change
- new patterns become standard
- new gotchas are discovered

Update sequence:
1. read current knowledge base
2. merge new findings
3. remove stale entries
4. save file and log in `CHRONICLE.md`

## Include / Exclude Rules

Always include:
- stack, conventions, architecture decisions, gotchas

Never include:
- secrets/credentials
- temporary speculation
- personal-only notes

## Memory Integration

- Before task: `memory_search("[task] patterns conventions")`
- After discovery: `memory_save` with concepts and source files

*Context Injection Protocol*
