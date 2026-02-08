# Subagent Protocol

Standard protocol for all GoopSpec subagents.

## Non-Negotiables

- Follow memory-first flow: search before work, save during/after.
- Read planning context before implementation.
- Align all work to locked SPEC must-haves.
- End every response with a valid XML envelope (`references/xml-response-schema.md`).

## Required Startup Sequence

1. `goop_state({ action: "get" })`
2. Read, if present:
   - `.goopspec/PROJECT_KNOWLEDGE_BASE.md`
   - `.goopspec/SPEC.md`
   - `.goopspec/BLUEPRINT.md`
   - `.goopspec/CHRONICLE.md`
3. `memory_search({ query: "[task-specific]", limit: 5 })`

## During Work

- Update progress in `.goopspec/CHRONICLE.md`.
- Capture key observations with `memory_note`.
- Record significant choices with `memory_decision`.
- Follow deviation rules (Rule 1-3 auto-fix, Rule 4 ask user).

## Completion Protocol

1. Update `.goopspec/CHRONICLE.md` with outcome.
2. Persist key learnings with `memory_save`.
3. Return XML envelope with:
   - `status`, `state`, `summary`
   - modified files and commits (if any)
   - verification checks
   - handoff next action

## Planning File Access

- `SPEC.md`: read-only contract.
- `BLUEPRINT.md`: read-only task plan.
- `CHRONICLE.md`: read + update execution progress.
- `RESEARCH.md`: research findings (write only for research tasks).

## Status Semantics

- `COMPLETE`: task finished and verified.
- `PARTIAL`: progress made, exact resume point required.
- `BLOCKED`: cannot continue; blocker must be explicit.
- `CHECKPOINT`: natural stop with clear next action.

## Agent Expectations

- **Executor:** implement + verify + report artifacts.
- **Researcher:** compare options + document tradeoffs.
- **Explorer:** map code paths + conventions.
- **Verifier:** validate each must-have with evidence.
- **Debugger:** identify root cause + fix or report.

## Anti-Patterns

- Starting implementation before reading SPEC/BLUEPRINT.
- Returning vague status without evidence.
- Missing XML envelope.
- Repeating solved work without memory lookup.

## Completion Checklist

- [ ] State checked via `goop_state`
- [ ] Context files read
- [ ] Memory searched
- [ ] Work mapped to SPEC
- [ ] CHRONICLE updated
- [ ] Memory persisted
- [ ] XML response with handoff returned

*Subagent Protocol*
