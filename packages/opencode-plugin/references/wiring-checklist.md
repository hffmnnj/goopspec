# Wiring Checklist

Prevent integration gaps: a feature that builds correctly but isn't wired is invisible to users.

## Why Wiring Fails

Agents build features in isolation. Tests pass locally, but the feature is unreachable because it was never registered, exported, or routed.

## Wiring Patterns

### Pattern 1: New Tool/Command Not Registered in Index

A new MCP tool is built but never added to the plugin's tool registry.

- [ ] `src/tools/index.ts` imports the new tool factory.
- [ ] `createTools()` return object includes the new tool.
- [ ] `bun run build` succeeds with the new import.
- [ ] Manual test: tool appears in the MCP tool list.

### Pattern 2: New Route/Page Not Added to Router

A new handler, page, or slash command is unreachable because the dispatch table was not updated.

- [ ] Command/handler file exists.
- [ ] It is listed in command discovery or the router config.
- [ ] The resolver can resolve the new name.
- [ ] Discovery tools list the new entry.

### Pattern 3: New Agent/Skill Not Referenced in Orchestrator or AGENTS.md

A new agent or skill has no dispatch path.

- [ ] Agent/skill file exists with correct naming.
- [ ] Orchestrator delegation table includes the new agent.
- [ ] Routing logic maps at least one task category to the new agent.
- [ ] `AGENTS.md` documents the new agent's purpose and scope.
- [ ] At least one `task()` call path can reach it.

### Pattern 4: New Config Option Not Plumbed to Consumers

A configuration field exists but nothing reads or acts on it.

- [ ] Field is defined in the type/schema.
- [ ] At least one mutation path sets it.
- [ ] At least one consumer reads it and changes behavior.
- [ ] Prompt-building hooks include it when relevant.
- [ ] A test toggles it and asserts an observable effect.

### Pattern 5: New Module Not Exported from Package Entry Point

A module works internally but isn't re-exported from `src/index.ts`.

- [ ] Public API is exported from `src/index.ts`.
- [ ] `bun run build` includes it in `dist/`.
- [ ] No "unused export" warnings.
- [ ] Integration or manual test confirms runtime reachability.

## Wiring Verification Summary

Before marking a feature complete:

- [ ] **Registry** — new tools, commands, or handlers registered in their index/router.
- [ ] **Routing** — at least one dispatch path reaches the new code.
- [ ] **Exports** — public API re-exported from the package entry point.
- [ ] **Config plumbing** — new options read by at least one consumer with observable effect.
- [ ] **Documentation** — new agents, skills, or references listed in `AGENTS.md` or equivalent.
- [ ] **Build** — `bun run build` succeeds and includes new files in output.
- [ ] **Discovery** — new resource appears in listing tools.

## Handoff Protocol

Mandatory handoffs at phase completion, wave completion, checkpoint reached, or when context is getting full. Optional at natural pauses.

### HANDOFF.md Structure

```markdown
# Session Handoff

**Generated:** [timestamp]
**Phase:** [current phase]

## Accomplished This Session
- [x] [Task/milestone]

## Current State
- Phase: [phase]
- Spec Locked: [yes/no]
- Wave: [N of M]
- Task: [X of Y]

## Files Modified
- `path/to/file` — [change]

## Commits Made
- `abc1234` — type(scope): message

## Next Session Instructions
### Command to Run
`/goop-[command]`

### Documents to Read First
1. `goop_read_db({ doc_type: "spec" })`
2. `goop_read_db({ doc_type: "blueprint" })`
3. `goop_read_db({ doc_type: "chronicle" })`

### Context Summary
[2-4 sentences: decisions, patterns, gotchas]

### Immediate Next Task
**Task:** [exact description]
**Files:** `path/to/files`
**Action:** [what needs to be done]
**Verify:** [how to verify]

## Warnings & Blockers
### Active Blockers
[None | list]

### Gotchas Discovered
- [pattern or issue]
```

### Handoff Rules

- Include tasks completed, key decisions with rationale, exact workflow position, files modified, and explicit next steps.
- Do not include full file contents or detailed implementation code.
- Keep the context summary to 2-4 sentences max.
- Update chronicle via `goop_write_db({ doc_type: "chronicle", content: "..." })` before generating `HANDOFF.md`.
- Write `HANDOFF.md` via `goop_write_db({ doc_type: "handoff", content: "..." })`.
- Persist a memory entry for the handoff context.

### Orchestrator Responsibilities

- Detect handoff points.
- Generate handoff via `goop_write_db({ doc_type: "handoff", content: "..." })`.
- Update chronicle via `goop_write_db({ doc_type: "chronicle", content: "..." })`.
- Suggest starting a new session when appropriate.

### Subagent Responsibilities

Return `suggest_new_session: true` when:

- A complex task is completed.
- Significant context has accumulated.
- A natural pause point is reached.

---

*Wiring Checklist v1.0 — GoopSpec Reference*
