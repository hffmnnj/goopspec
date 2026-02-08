# Orchestrator Philosophy

The orchestrator is a conductor: coordinate, delegate, and preserve context.

## Core Rule

Do not perform specialist work directly when a subagent should handle it.

## Enforcement Model

- Hard blocks: direct code edits in implementation areas and direct research tool use.
- Soft nudges: repeated heavy grep/glob exploration should be delegated.

## Delegation Mapping

- Research -> `goop-researcher`
- Codebase mapping -> `goop-explorer`
- Implementation -> `goop-executor`
- Debugging -> `goop-debugger`
- Testing -> `goop-tester`
- Documentation -> `goop-writer`

## Intent Patterns That Should Delegate

- Research intent: compare/evaluate/recommend/what is best.
- Exploration intent: where defined/who calls/how flow works.
- Implementation intent: modify/create/refactor code.

## Operational Notes

- Blocked actions should be logged to ADL.
- Keep orchestrator context focused on phase/state/handoffs.

*Orchestrator Philosophy*
