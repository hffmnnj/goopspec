# PROJECT_KNOWLEDGE_BASE.md

Global, cross-workflow knowledge base for the GoopSpec monorepo. Not workflow-scoped.

## Stack

- **Package:** `@goopspec/opencode-plugin` (`packages/opencode-plugin/`)
- **Runtime:** Bun (`>=1.0.0`)
- **Language:** TypeScript, strict mode, ES2022 target, NodeNext modules
- **Lint/Format:** Biome (`biome check src`, `biome format --write src`)
- **Test runner:** `bun test`
- **Host SDK:** `@opencode-ai/plugin` (currently pinned `^1.18.0`, peer `^1.18.0`) — supports both V1
  (legacy async function) and V2 (`Plugin.define`) plugin contracts via dual-shape default export.

## Conventions

- All local ESM imports use the `.js` extension (NodeNext requirement).
- Direct imports of `@opencode-ai/plugin` / `@opencode-ai/sdk` are forbidden outside
  `src/core/sdk-compat.ts` — that file is the single compatibility seam for the SDK surface.
- Tools live under `src/tools/<tool-name>/index.ts` with co-located `index.test.ts`.
- Hooks live under `src/hooks/`, registered via `DEFAULT_HOOK_FACTORIES` and assembled by
  `createHooks(ctx, factories)` in `src/hooks/index.ts`.
- `src/core/context.ts` builds the shared `PluginContext` passed to every tool/hook factory.
- `src/index.ts` is the plugin entrypoint: a single default export via `Object.assign` that satisfies
  both V1 (async function returning `{ ...hooks, tool: tools }`) and V2 (`{ id, setup }`) contracts.

## Architecture Notes

- GoopSpecDB (`.goopspec/goopspec.db`, SQLite via `bun:sqlite`) is the source of truth for
  workflow state; markdown files under `.goopspec/<workflowId>/` are rendered sidecars.
- Memory (`memory.db`) is in-process SQLite with FTS5 + LIKE fallback — no separate service.

## Detailed Inventory (as of 2026-07-16)

- **30 registered tools** + 1 unregistered orphan (`goop_create_pr`). All use `tool()` from sdk-compat.
- **10 hook factories** in `DEFAULT_HOOK_FACTORIES`. One unregistered: `referenceInjectionFactory`.
- **PluginContext** has 7 fields: `sdk`, `db`, `stateManager`, `memory`, `resolver`, `session`, `sessionManager`.
  Only `sdk` depends on the V1 `PluginInput` shape; the other 6 are SDK-agnostic.
- **sdk-compat.ts** is the single import seam for `@opencode-ai/plugin`, `@opencode-ai/plugin/tool`, and `@opencode-ai/sdk`.
  Includes `detectSdkChannel()` / `classifyChannel()` version detection.
- **package.json** exports only `".": "./src/index.ts"` — no `/v2` subpath.

## Known Gaps (as of 2026-07-16)

- OpenCode V2 plugin API support now exists (workflow `opencode-v2-plugin-support` completed).
  Dual-shape default export (`Object.assign` of V1 async function with `V2Plugin.define{ id, setup }`)
  in `src/index.ts`; V2 adapters in `src/core/v2-compat.ts`, `context-v2.ts`, `tools-v2.ts`, `hooks-v2.ts`.
  All 30 tools and 10 hooks work under both contracts. See `AGENTS.md` for full architecture docs.
- `goop_create_pr` tool is fully implemented but not registered in `createTools()`.
- `referenceInjectionFactory` is fully implemented and tested but not in `DEFAULT_HOOK_FACTORIES`.

*Maintained by the GoopSpec orchestrator. Update when architecture or conventions change.*
