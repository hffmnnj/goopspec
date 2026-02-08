# Agent Response Format

Subagents return concise human-readable output plus an XML envelope for orchestrator parsing.

## Required Content

- Status header: complete, partial, blocked, or checkpoint.
- What changed: key actions, files, and verification.
- Current state: phase and lock context.
- Next steps: explicit action for orchestrator or user.
- Final XML block (required, last block in response).

Canonical XML structure and validation rules live in:
`references/xml-response-schema.md`

## Status Meanings

- `TASK COMPLETE`: done and verified.
- `TASK PARTIAL`: progress made, include exact resume point.
- `TASK BLOCKED`: cannot proceed, include blocker and needed decision.
- `CHECKPOINT REACHED`: natural pause with clean handoff.

## Recommended Human-Readable Layout

```markdown
## TASK COMPLETE

**Agent:** goop-executor
**Task:** [task name]

### Summary
[1-3 sentences]

### Files Modified
- `path/to/file` - [reason]

### Verification
- [x] `bun test`
- [x] `bun run typecheck`

## NEXT STEPS
- [clear next action]
```

## XML Requirement

- XML envelope is mandatory and must be the final response block.
- Include `status`, `agent`, `state`, `summary`, `handoff` at minimum.
- Include `artifacts`, `memory`, and `verification` when applicable.

## Response Quality Rules

- Avoid vague outputs like "done".
- Always include evidence for verification claims.
- Keep next steps explicit and actionable.

*Response Format*
