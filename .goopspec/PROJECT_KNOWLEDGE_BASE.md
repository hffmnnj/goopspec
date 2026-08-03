# PROJECT_KNOWLEDGE_BASE.md

Global, cross-workflow orientation for the GoopSpec monorepo. Not workflow-scoped.
Canonical working guide: [`AGENTS.md`](../../AGENTS.md) — treat it and the linked source files as authoritative when this file disagrees.

## Purpose & Layout

GoopSpec is an [OpenCode](https://opencode.ai) plugin (`@goopspec/opencode-plugin`) that puts a spec-driven contract in front of AI coding: an interview, a locked spec, wave-based execution, and an acceptance gate — backed by a SQLite state engine, 14 specialised agents, and runtime enforcement hooks. See [`README.md`](../../README.md).

```
packages/opencode-plugin/
├── agents/        # 14 agent prompt definitions (markdown)
├── commands/      # 9 slash command definitions (markdown)
├── references/    # 19 consolidated reference docs (goop_reference)
├── templates/     # 12 document templates (incl. project-knowledge-base.md)
└── src/
    ├── core/      # types, constants, V1/V2 seams and adapters
    ├── features/  # db, memory, state-manager, setup, thinking, routing, enforcement, ...
    ├── hooks/     # 13 hook factories (src/hooks/index.ts)
    ├── shared/    # logger, paths, continuation-prompt, render-sidecars
    ├── tools/     # 38 MCP tools, tests co-located
    └── index.ts   # dual V1/V2 default export
```

## Build / Test / Typecheck / Lint

```bash
bun install                                          # workspace deps
bun run --cwd packages/opencode-plugin build         # build
bun run --cwd packages/opencode-plugin typecheck     # typecheck
bun run --cwd packages/opencode-plugin test          # full suite
bun run --cwd packages/opencode-plugin lint          # Biome
bun run --cwd packages/opencode-plugin lint:fix      # Biome fix
bun run --cwd packages/opencode-plugin format        # Biome format

bun test packages/opencode-plugin/src/tools/goop-status/index.test.ts   # single file
bun test -t "goop_status"                            # name match
bun test --changed=main                              # tests affected by diff
bun test --bail=3 --timeout=10000                    # bounded run
```

## Conventions

- TypeScript: ES2022 target, NodeNext modules, strict mode + `noUnusedLocals` / `noUnusedParameters` / `noImplicitReturns`.
- Local imports always carry the `.js` extension (ESM requirement).
- Files kebab-case; variables/functions camelCase; types PascalCase; constants UPPER_SNAKE_CASE; shared interfaces in `src/core/types.ts`.
- Direct SDK imports only through the seams: `src/core/sdk-compat.ts` (V1) and `src/core/v2-compat.ts` (V2). Never import `@opencode-ai/plugin` elsewhere.
- Errors log and degrade; never throw. A crashed plugin takes the whole session down.
- Tools: factory per directory under `src/tools/<name>/index.ts` using `tool()` from sdk-compat, registered once in `src/tools/index.ts` `createTools()` (verified: 38 tools).
- Hooks: factory per module, assembled in `src/hooks/index.ts` `DEFAULT_HOOK_FACTORIES` (verified: 13 factories).

## V1/V2 Shared-Logic Rule

- Single default export: `src/index.ts` = `Object.assign(asyncFn, V2Plugin.define({ id: "goopspec", setup }))`. V1 loader calls the function; V2 reads `.id`/`.setup`. No config flag.
- All tools and hooks are defined **once in the V1 source of truth**. V2 adapters (`src/core/context-v2.ts`, `tools-v2.ts`, `hooks-v2.ts`) reuse them programmatically (Zod args → JSON Schema via `z.toJSONSchema()`).
- Any new tool/hook goes only into `createTools()` / `DEFAULT_HOOK_FACTORIES`; it then works under both contracts with no V2 adapter change.
- V2 does not yet expose config, chat-message, command, permission, event, or compaction hooks — those remain V1-only and log the limitation once at startup. `typeof`-guards let older hosts degrade without crashing.

## State & Sidecars

- GoopSpecDB (`.goopspec/goopspec.db`, SQLite via `bun:sqlite`) is the source of truth for workflow state. Markdown files under `.goopspec/<workflowId>/` are rendered sidecars, regenerated on every write.
- Workflow docs must be placed via `getWorkflowDocPath(projectDir, workflowId, filename)` (`src/shared/paths.ts`) — never write them to the `.goopspec/` root for a non-default workflow.
- `state.json` is auto-migrated to the DB on first use; `.backup` kept for safety.
- `memory.db` is in-process SQLite (FTS5 + LIKE fallback) — no worker, no daemon, no port.
- The ADL is an append-log of structured events, not a document row (read via `goop_adl`).
- Prefer batch forms (`doc_types[]`, `items[]`, `wave_numbers[]`) to collapse multi-read/multi-write turns into one call.

## Test Discipline

- Co-locate tests next to implementation (`src/tools/<name>/index.test.ts`). Use the shared mock factories in `src/test-utils.ts` (`setupTestEnvironment`, `createMockPluginContext`, `createMockToolContext`).
- Scope runs to the narrowest rung: single file → directory → `--changed=main` → full suite. Bound with `--bail=3 --timeout=10000`.
- **`rtk` test gotcha (HIGH):** bare `rtk bun test` reports "0 passed / N skipped" for runs that actually execute thousands of tests. Only `rtk proxy bun test ...` is trustworthy. Always use `rtk proxy` for test commands.
- Bun `mock.module()` replaces the entire module globally — spread the real module (`{ ...real, fn: mockFn }`) when stubbing to preserve named exports.

## Agents & Delegation

- One orchestrator + 13 specialists (see README §Agents and Delegation for the roster and default models). The orchestrator coordinates and never implements — `src/hooks/orchestrator-enforcement.ts` denies its writes to implementation paths via `permission.ask` at the SDK level.
- Six executor tiers route by blast radius: `low`/`medium`/`high` and `frontend-low`/`frontend-medium`/`frontend-high`. Medium is the default on both tracks.
- Every subagent returns the five-section envelope: STATUS, SUMMARY, ARTIFACTS, VERIFICATION, NEXT (see `references/response-format.md`).
- Memory-first protocol: search before acting, persist learnings after (see `references/core-protocol.md` §Memory-First Protocol). Per-role reasoning effort via `agentThinkingLevels`, resolved against the live model catalog (`src/features/thinking/`).

## Prompt-Bearing Surfaces

Relevant to prompt-optimization work — where prompt text actually lives in this repo:

- `packages/opencode-plugin/agents/*.md` — 14 agent definitions, the largest prompt surfaces. Registered at startup by `src/hooks/agent-registration.ts` (V1 `config`/`chat.params`; V2 `agent.transform` + `catalog.transform`). Under V1, agent-menu changes need a restart; option changes apply on the next dispatch.
- `packages/opencode-plugin/commands/*.md` — 9 slash commands.
- `src/hooks/system-transform.ts` — injects `<goopspec_state>` (the single canonical workflow-state block), `## PHASE ENFORCEMENT` rules (a separate block via `src/features/enforcement/phase-context.ts` — not a second state block), `<goopspec_memory>` (~800-token budget), `<goopspec_field_notes>` (~300 tokens, importance ≥ 8), and `<goopspec_db>` into every LLM call through `experimental.chat.system.transform`. The `<goopspec_db>` block carries only the workflow doc inventory and a pointer to tool schemas — DB tool descriptions are no longer restated here. Session caches with 30s TTL.
- `packages/opencode-plugin/references/core-protocol.md` §Prompt Authoring Rules — the single shared authority for cross-model prompt strategy (precedence, absolutes, outcome-first, one autonomy policy per role, batching). Every other prompt surface points to it, not restates it.
- `src/shared/continuation-prompt.ts` — compaction continuation prompt (`buildContinuationPrompt`, max 10,000 chars). Replaces `output.prompt` (last-writer-wins) and never touches `output.context`; V1-only hook.
- `packages/opencode-plugin/references/*.md` — 19 reference docs loaded on demand via `goop_reference`.
- `packages/opencode-plugin/templates/*.md` — 12 templates (spec, blueprint, chronicle, project-knowledge-base, ...) used by doc writers.
- `src/hooks/chat-message.ts` — distils significant prompts to memory; `src/hooks/comment-checker.ts` flags comment-ratio issues on writes.

## Known Gotchas

- `goopspec.db` is the source of truth; never treat sidecar markdown as primary state.
- `GOOPSPEC_DEBUG=true` enables `log()` output; without it `log()` is a no-op. `logError()` always logs.
- `goop_write_wave`: top-level `wave_number` is required for wave/task/verification writes and `items[]`; supply `verifications[]`/`traceability[]` top-level with `task_updates[]` but per-item with `items[]` — mixing the two forms is rejected.
- `goop_save_note` `items[]` is atomic (single transaction), so retry logic for partial failures is obsolete.
- Compaction hook: `output.prompt` is last-writer-wins; earlier prompt content is not preserved or merged. Hook stands down when no valid workflow resolves.
- Thinking levels are labels resolved against the live model catalog. Unknown labels are rejected; unsupported labels fall back to the provider default with a warning — never a silent downgrade, never a dispatch failure.
- `src/hooks/reference-injection.ts` exists and is tested but is **not** in `DEFAULT_HOOK_FACTORIES` — verify before assuming reference injection is active.

---

*Maintained by GoopSpec. Update when architecture or conventions change. Keep it concise; link to canonical sources instead of duplicating them.*
