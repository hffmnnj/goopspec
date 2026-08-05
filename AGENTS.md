# AGENTS.md

Guidelines for AI agents working in this codebase.

## Build & Test Commands

```bash
bun install                                          # Install workspace dependencies
bun run --cwd packages/opencode-plugin build         # Build the plugin
bun run --cwd packages/opencode-plugin typecheck     # Type check the plugin
bun run --cwd packages/opencode-plugin test           # Run all plugin tests
bun run --cwd packages/opencode-plugin lint          # Run Biome lint on src
bun run --cwd packages/opencode-plugin lint:fix       # Fix Biome issues in src
bun run --cwd packages/opencode-plugin format        # Format src with Biome

# Testing
bun test packages/opencode-plugin/                   # Test plugin package
bun test packages/opencode-plugin/src/tools/goop-status/index.test.ts  # Single file
bun test -t "goop_status"                             # Tests matching name (regex)
bun test --changed=main                               # Only tests affected by git diff vs main (traces imports)
bun test --bail=3 --timeout=10000                     # Bounded run
bun test --watch                                      # Watch mode
```

### ⚠️ `rtk` test gotcha — HIGH severity

`rtk bun test` reports "0 passed / N skipped" for runs that actually execute thousands of tests. **Only `rtk proxy bun test ...` is trustworthy.** This caused real confusion during execution — a run that passed 1960 tests was reported as "0 passed / 44 skipped". Always use `rtk proxy` for test commands, never bare `rtk`.

## Project Structure

```
packages/
└── opencode-plugin/       # @goopspec/opencode-plugin — MCP tools, hooks, and orchestration logic

packages/opencode-plugin/src/
├── core/                  # Types, config, resolver
├── tools/                 # MCP tool implementations
│   ├── goop-read-db/      # Read workflow docs from GoopSpecDB
│   ├── goop-write-db/     # Write/update workflow docs; auto-renders markdown sidecar
│   ├── goop-read-section/ # Read structured document sections
│   ├── goop-write-wave/   # Upsert wave/task progress rows
│   ├── goop-blocker/      # Open, resolve, and list workflow blockers
│   ├── goop-dashboard/    # Render cross-workflow dashboard
│   ├── goop-save-note/    # Save a Field Note to the global knowledge base
│   ├── goop-search-notes/ # Search Field Notes with FTS + tag filtering
│   └── ...                # Other tool directories
├── hooks/                 # OpenCode plugin hooks
├── features/              # Feature modules (memory, state, db, routing, model-routing)
│   └── db/                # GoopSpecDB — unified SQLite database (schema, migrations, types)
├── shared/                # Utilities (logger, paths)
├── test-utils.ts          # Shared test utilities
└── index.ts               # Plugin entry point

packages/opencode-plugin/
├── agents/                # 15 agent markdown definitions
├── commands/              # 9 slash command definitions
├── references/            # 19 consolidated reference documents (incl. field-notes-protocol)
└── templates/             # File templates
```

## OpenCode V1/V2 Dual Plugin Support

The plugin ships as a single default export that satisfies both the legacy V1 plugin contract (async function returning `Hooks`/`tool` map) and the V2 plugin contract (`Plugin.define({ id, setup })`). Detection is structural and zero-config: the host reads whichever shape it expects from the same export object.

### Dual-Shape Export

`src/index.ts` exports a single default via `Object.assign(asyncFunction, v2Plugin)`:

```typescript
const goopspec: Plugin = async (input) => { /* V1 setup */ };
const v2Plugin = V2Plugin.define({ id: "goopspec", async setup(ctx) { /* V2 setup */ } });
export default Object.assign(goopspec, v2Plugin);
```

The V1 loader calls the function directly; the V2 loader reads `.id` and `.setup` from the same object. No config change, no runtime heuristic, no env var.

### Where V1 Logic Lives

- **`src/core/sdk-compat.ts`** — Single import seam for the `@opencode-ai/plugin` SDK (V1 types, values).
- **`src/core/context.ts`** — Builds the shared `PluginContext` from V1 `PluginInput`.
- **`src/tools/`** — All 38 tool factories in `src/tools/index.ts` (`createTools()`). The count is pinned by `src/tools/index.test.ts` and `src/core/tools-v2.test.ts`; treat the emitted schema as the authority on each tool's arguments, not this file.
- **`src/hooks/`** — All 10 hook factories in `DEFAULT_HOOK_FACTORIES`, assembled by `createHooks()`.
- **`src/core/types.ts`** — `PluginContext`, `SdkEssentials`, `ToolContext`, etc.

These are the single source of truth. V2 adapters import and reuse them — they never fork or duplicate.

### Where V2 Adapter Logic Lives

- **`src/core/v2-compat.ts`** — Single import seam for `@opencode-ai/plugin/v2/promise` (V2 types, `V2Plugin.define`). Contains augmented types (`V2RuntimeContext`, `V2ToolCapability`, `V2SessionCapability`, `V2EventCapability`) for documented V2 runtime capabilities that the published promise declarations don't yet expose. Guards with runtime capability checks so an older host degrades without crashing.
- **`src/core/context-v2.ts`** — Maps V2's `ctx` (which lacks `client`, `directory`, `worktree`, `$`) to GoopSpec's `PluginContext`. `directory` falls back to `process.cwd()`. The Bun shell (`$`) throws if called. Subsystems (`db`, `stateManager`, `memory`, etc.) are SDK-agnostic and reused via `createPluginSubsystems()`.
- **`src/core/tools-v2.ts`** — Converts V1 Zod `ToolDefinition.args` to JSON Schema via `z.toJSONSchema()`, then registers every tool from `createTools()` with the V2 runtime through `ctx.tool.transform()`. Zero tool-execution logic lives here — the V1 `definition.execute` function is called as-is.
- **`src/core/hooks-v2.ts`** — Registers V1 hook behavior with V2 runtime hooks (`ctx.session.hook("request", ...)` for system transforms, `ctx.tool.hook("execute.before/after", ...)` for tool lifecycle). V2 does not expose equivalents for config, chat-message, command, permission, event, or compaction hooks, so those remain V1-only.

### The Shared-Logic Rule

**Any new tool or hook must be added only to the V1 source of truth** (`src/tools/index.ts` or `DEFAULT_HOOK_FACTORIES`). It becomes available under both V1 and V2 automatically — no V2 adapter file needs to be touched for ordinary additions. V2 adapters iterate over `createTools()` and `DEFAULT_HOOK_FACTORIES` programmatically.

### V2 SDK Type Gap

The published `@opencode-ai/plugin/v2/promise` declarations do not yet include the `session`, `tool`, and `event` capabilities that the OpenCode documentation describes as runtime-attached. GoopSpec declares its own augmented `V2RuntimeContext` type (in `v2-compat.ts`) with optional `session?`, `tool?`, and `event?` fields, and every adapter guards the capability with a `typeof` check before invoking it. This ensures the plugin degrades gracefully on hosts that don't provide the capability yet.

## Packages

| Package | Purpose |
|---------|---------|
| `@goopspec/opencode-plugin` | MCP tools, slash commands, hooks, and in-process orchestration — the OpenCode plugin entry point |

## Code Style

### TypeScript Configuration
- **Target**: ES2022, **Module**: NodeNext
- **Strict mode** enabled with `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`
- Use `.js` extension for all local imports (ESM requirement)

### Import Order
```typescript
// 1. External imports
import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool";
// 2. Internal imports with .js extension
import type { PluginContext } from "../../core/types.js";
import { log, logError } from "../shared/logger.js";
```

### Naming Conventions
| Type | Convention | Example |
|------|------------|---------|
| Files | kebab-case | `goop-status.ts` |
| Variables/Functions | camelCase | `createGoopStatusTool` |
| Types/Interfaces | PascalCase | `PluginContext` |
| Constants | UPPER_SNAKE_CASE | `MEMORY_TYPES` |

### Type Definitions
- Define interfaces in `src/core/types.ts`
- Use explicit types, avoid `any`
- Export const arrays with `as const` for union types:
```typescript
export const MEMORY_TYPES = ["observation", "decision", "note"] as const;
export type MemoryType = (typeof MEMORY_TYPES)[number];
```

### Error Handling
```typescript
try {
  // Main logic
} catch (error) {
  logError("Operation failed", error);
  return createMinimalResult();  // Graceful degradation, don't throw
}
```

### Logging
```typescript
import { log, logError } from "../shared/logger.js";
log("Debug message", { data });   // Only when GOOPSPEC_DEBUG=true
logError("Error message", error); // Always logged
```

## Testing

### Test Location
Tests are co-located: `packages/opencode-plugin/src/tools/goop-status/index.test.ts`

### Test Structure
```typescript
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createGoopStatusTool } from "./index.js";
import {
  createMockPluginContext,
  createMockToolContext,
  setupTestEnvironment,
  type PluginContext,
} from "../../test-utils.js";

describe("goop_status tool", () => {
  let ctx: PluginContext;
  let cleanup: () => void;

  beforeEach(() => {
    const env = setupTestEnvironment("test-name");
    cleanup = env.cleanup;
    ctx = createMockPluginContext({ testDir: env.testDir });
  });

  afterEach(() => cleanup());

  it("does something", async () => {
    const tool = createGoopStatusTool(ctx);
    const result = await tool.execute({}, createMockToolContext());
    expect(result).toContain("expected");
  });
});
```

### Mock Factories (test-utils.ts)
- `setupTestEnvironment(prefix)` - Temp dir with `.goopspec` structure
- `createMockPluginContext(opts)` - Full plugin context mock
- `createMockToolContext(opts)` - Tool execution context mock
- `createMockStateManager(state)` - State manager mock

## Implementation Patterns

### Tool Pattern
```typescript
import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool";
import type { PluginContext, ToolContext } from "../../core/types.js";

export function createMyTool(ctx: PluginContext): ToolDefinition {
  return tool({
    description: "Brief tool description",
    args: {
      param: tool.schema.string().optional(),
    },
    async execute(args, _context: ToolContext): Promise<string> {
      // 1. Memory Check (Memory-First)
      const memory = await ctx.memory.search(args.param);

      // 2. Execution
      const state = ctx.stateManager.getState();
      return "result";
    },
  });
}
```

### Hook Pattern
```typescript
export function createMyHook(ctx: PluginContext) {
  return {
    name: "my-hook",
    hooks: {
      "experimental.chat.system.transform": async (params) => {
        // Hook logic
      },
    },
  };
}
```

## Key Rules

1. **Memory-First** - Always check memory/state before action. Persist learnings after.
2. **Use OpenCode plugin APIs** - Prefer OpenCode plugin SDK helpers for user interaction.
3. **Graceful degradation** - Never crash the plugin, return fallback results.
4. **Co-locate tests** - Test files next to implementation.
5. **Use test-utils** - Leverage shared mock factories.
6. **ESM imports** - Always use `.js` extension for local imports.
7. **Explicit types** - Avoid `any`, define interfaces in `core/types.ts`.
8. **Minimal comments** - Only document non-obvious logic.
9. **Atomic commits** - Keep changes focused and small.

## Stage-Gated Verification

Verification is split across two inspect-only roles, gated by lifecycle stage:

- `goop-wave-verifier` — execute phase, scoped to one wave at a time. Inspects the wave and records verification rows via `goop_write_wave` `verifications[]`; it never implements fixes. Gaps go back to the correctly tiered executor for remediation, then the wave is re-verified.
- `goop-verifier` — acceptance only. Runs at the accept gate as the final whole-workflow audit against the spec; it is not dispatched during execute.

A wave does not complete, and execute does not progress to accept, while the wave's effective verification evidence is missing or failing.

## Agent Thinking Levels

GoopSpec supports per-role reasoning-effort configuration through plain-text labels. The system resolves each label against the live OpenCode model catalog — never a hard-coded budget table.

### Five Canonical Levels

| Label | Intent |
|-------|--------|
| `none` | No reasoning effort (a real variant, not budget 0) |
| `low` | Minimal reasoning, fastest response |
| `medium` | Balanced reasoning (default for explorer, researcher) |
| `high` | Thorough reasoning (default for all other roles) |
| `xhigh` | Maximum reasoning, slowest but most capable |

### Per-Role Config Field

Set `agentThinkingLevels` in any config source (project `goopspec.json`, `.goopspec/config.json`, or global `~/.config/opencode/goopspec.json`):

```json
{
  "agentThinkingLevels": {
    "explorer": "medium",
    "executor-low": "low",
    "executor-high": "xhigh",
    "orchestrator": "high"
  }
}
```

Input is case-insensitive and normalized to canonical lowercase. Unknown labels are rejected with a diagnostic via `logError` (see `normalizeConfig` in `src/features/setup/index.ts` lines 370-388).

### Built-in Role Defaults

Defined in `src/core/constants.ts` (lines 140-146). The canonical `AGENT_ROLES` list has 15 roles; the defaults below are derived from it:

| Role(s) | Default Level |
|---------|---------------|
| `explorer`, `researcher` | `medium` |
| All other `AGENT_ROLES` (13 roles) | `high` |

Defaults derive from the canonical `AGENT_ROLES` list, so any new role added to the list automatically gets a safe default.

### Capability Resolution Against Live Model Catalog

Resolution happens in `src/features/thinking/resolve.ts`:

1. **V2 path** (`src/features/thinking/capability.ts` lines 34-52): Reads `ctx.catalog` → `model.variants[]` (`{id, headers, body}`). The variant `id` is the exact supported value; `body`/`headers` carry the provider request (OpenAI `reasoningEffort`, OpenRouter `reasoning.effort`, Anthropic `thinking`/`budgetTokens`, Google `thinkingConfig`, Bedrock `reasoningConfig`).

2. **V1 path** (capability.ts lines 72-89): Reads `PluginInput.client` provider catalog → `capabilities.reasoning: boolean` + `options`. V1 lacks exact variant enums; supported values are drawn from the option tree.

3. **Fallback order**: V2 catalog → V1 SDK catalog → preserve provider default + warn.

**Rule 4 safe fallback** (resolve.ts lines 26-32): When a configured label is not supported by the resolved model, GoopSpec returns `apply: null` (preserve the provider default) and emits a clear warning via `logError`. It never silently downgrades (e.g., `xhigh`→`high`) and never fails agent dispatch. `none` is treated as a real variant, not mapped to budget 0.

### Three-Tier Precedence

Defined in `loadMergedConfig` (`src/features/setup/index.ts` lines 459-496):

```
Project goopspec.json          ← highest priority
  └─ .goopspec/config.json
      └─ Global ~/.config/opencode/goopspec.json
          └─ Built-in default  ← lowest priority
```

`agentThinkingLevels` deep-merges across all three sources per role, exactly like `agentModels`. A project-level value overrides an internal value which overrides a global value which overrides the built-in default.

### V1 vs V2 Behavior Differences

**V1** (`src/hooks/agent-registration.ts`):
- Config hook (`config` event) is startup-only — agent-menu metadata cannot be re-registered live.
- `chat.params` hook reads uncached config on every future turn, so option changes take effect on the next dispatch.
- Agent-menu re-registration requires a restart (documented in code comment at line 95-97).

**V2** (`src/core/hooks-v2.ts`):
- `agent.transform` applies resolved variant body/headers to each agent draft at setup time (lines 149-181).
- `catalog.transform` snapshots live model capabilities (lines 137-147).
- Both `agent` and `catalog` capabilities are `typeof`-guarded so older hosts degrade without crashing (lines 189-197).
- `reloadThinkingLevels()` re-runs the transform pipeline and calls `agent.reload()`/`catalog.reload()` when the runtime provides them (lines 211-218).

### Legacy Numeric Compatibility

Defined in `normalizeConfig` (`src/features/setup/index.ts` lines 442-446) and `agent-registration.ts` lines 52-58:

- Legacy `agentThinkingBudgets` (per-role numeric) and `orchestrator.thinkingBudget` continue to work.
- When both a new `agentThinkingLevels` label and a legacy numeric budget target the same role, the **new label wins**.
- Legacy numeric applies only when no new label is present for that role.
- No budget is copied into `chat.params` because the provider option from the live catalog is the only verified V1 setting.

### Hot-Reload Boundaries

The config watcher (`src/features/setup/config-watcher.ts`) watches the project-root `goopspec.json`:

- **Watching strategy**: Watches the parent directory (survives atomic file replacements) and filters by filename (line 59-61).
- **Debounce**: 100ms debounce window (`CONFIG_WATCHER_DEBOUNCE_MS` in `src/index.ts` line 21).
- **Validation**: On reload, the raw JSON is parsed and run through `normalizeConfig` before delivery (config-watcher.ts lines 47-48).
- **Lifecycle**: Watcher is created during plugin setup and disposed via `Hooks.dispose` (V1) or `ctx.teardown.register` (V2) — see `src/index.ts` lines 29-39 (V1) and lines 60-76 (V2).

**V1 behavior** (`src/index.ts` lines 29-39): On reload, a `logError` message is emitted noting that future turns use updated options but a restart is required to refresh the agent menu. `loadMergedConfig` has no retained cache, so the next `chat.params` resolution reads fresh values.

**V2 behavior** (`src/index.ts` lines 60-64): On reload, `hooks.reloadThinkingLevels()` is called, which re-runs the `agent.transform`/`catalog.transform` pipeline and calls `agent.reload()`/`catalog.reload()` when the runtime provides those capabilities. The watcher is disposed via `ctx.teardown.register`.

## DB Tools Available

- Documents: `goop_read_db`, `goop_write_db`, `goop_append_chronicle`, `goop_read_section`, `goop_write_section`, `goop_search_docs`
- Waves and tracking: `goop_write_wave`, `goop_read_wave`, `goop_query_decisions`, `goop_blocker`
- Project views: `goop_timeline`, `goop_dashboard`
- Field Notes: `goop_save_note`, `goop_search_notes`

## Structural Code Tools

Three MCP tools wrap external CLIs for AST-aware code analysis and transformation: `ast_grep` (structural search/rewrite), `difftastic` (AST-aware diff), and `scip` (SCIP-index code intelligence). Each resolves its binary via `PATH` or the optional `binaryPaths` config in `goopspec.json` (keys: `ast-grep`, `difft`, `scip`, `scip-typescript`) and degrades to an install hint when the binary is missing. The emitted tool schema is the authority on each tool's arguments, modes, defaults, and returns — read it at call time; `references/tool-reference.md` carries the maintained cheat sheet. Do not restate the args here: a copy silently goes stale (a prior version of this section fabricated arguments the tools never accepted).

## Image Generation Tool

`generate_image` generates images via the user's ChatGPT subscription OAuth credentials (no API key) using `gpt-image-2`. The emitted tool schema owns the full argument surface, the transparent-background png-only contract (rendered on green screen, keyed to alpha locally via the `pngjs` codec in `png-codec.ts`), and the two declared-but-ignored arguments (`mask`, `outputCompression`) — read it at call time rather than relying on a restatement here. For prompting technique, load the `image-prompting` reference via `goop_reference`.

## Background Command Tools

Three tools manage detached background jobs: `background_command` (start), `background_status` (poll one or list all), and `background_cancel` (terminate). Jobs are scoped to the plugin process lifetime, expire after 30 minutes (1800 seconds) by default, and write logs to `.goopspec/background-jobs/<jobId>/stdout.log` and `stderr.log`. The emitted tool schemas own the arguments, defaults, ranges, and return shapes.

## Gotchas (Auto)

<!-- Last verified: 2026-06-18 — GoopSpec 1.0.0 plugin-only structure -->

- **Bun `mock.module()` replaces the entire module globally.** When mocking `../../features/worktree/git.js` in a tool test, spread the real module into the mock (`const real = await import(...); mock.module(..., () => ({ ...real, fn: mockFn }))`) — otherwise named exports disappear and other tests in the same run fail with "Export named 'X' not found".

- **`goopspec.db` is the source of truth for workflow state.** The unified SQLite database at `.goopspec/goopspec.db` stores workflows, events, documents, and field notes. `state.json` is auto-migrated to DB on first use; `.backup` kept for safety. Markdown files under `.goopspec/<workflowId>/` are rendered sidecars, not primary storage.

- **`goop_read_db({ doc_types: [...] })` batch form preferred.** In agent boot sequences, use the batch form to load multiple docs in one call instead of multiple singular `goop_read_db({ doc_type: "..." })` calls. Example: `goop_read_db({ doc_types: ["spec", "blueprint", "chronicle"] })`.

- **Workflow-scoped docs live under `.goopspec/<workflowId>/`.** When writing SPEC.md, BLUEPRINT.md, CHRONICLE.md, ADL.md, HANDOFF.md, REQUIREMENTS.md, RESEARCH.md — always use `getWorkflowDocPath(projectDir, workflowId, filename)` from `src/shared/paths.ts`. Never write these to `.goopspec/` root for non-default workflows.

- **`GOOPSPEC_DEBUG=true` enables verbose logging** via `log()` in `src/shared/logger.ts`. Without it, `log()` calls are no-ops. Only `logError()` always logs.

- **Memory is in-process via `bun:sqlite`.** The memory feature runs inside the plugin process using SQLite with FTS5 + LIKE fallback. There is no separate worker process and no `port-37777` service.

- **Prefer `items[]` batch mode for multi-write turns.** All four write tools (`goop_write_db`, `goop_write_section`, `goop_write_wave`, `goop_save_note`) now accept an optional `items[]` parameter. When writing more than one doc/section/wave/row/note in a turn, use the batch form to minimize tool calls and wrap writes in a single transaction. Single-item usage is unchanged and still supported.

- **`goop_save_note` batch mode is now atomic.** Previously, `goop_save_note` with `items[]` used a manual loop and could half-succeed — persisting one row of three and reporting the rest failed. All items are now wrapped in a single transaction. If you have working assumptions built on the old behaviour (e.g. retry logic for partial failures), update them.

- **`goop_write_wave`'s top-level `wave_number` is conditionally required.** It is required for wave writes, task writes, verifications, and `items[]`. It is omittable only for a traceability-only call where every row carries its own `wave_number`. A traceability-only call where any row omits `wave_number` is rejected rather than persisting a null target.

- **Knowledge lives in `references/`, not `skills/`.** GoopSpec 1.0.0 removed the skills feature. Use `goop_reference` to load the 19 consolidated reference documents (including `field-notes-protocol`).

- **ADL is an append-log, not a document row.** Read it with `goop_adl({ action: "read" })`. `goop_read_db({ doc_type: "adl" })` returns "No adl document found" — the ADL is stored as structured events, not a full document.

- **`goop_write_wave` accepts `verifications[]` and `traceability[]` in two forms, and the distinction matters.** With `task_updates[]` (the common case), supply them as top-level fields — they are processed atomically alongside task updates. With `items[]`, supply them **per-item** — each `items[]` entry can carry its own `verifications[]` and `traceability[]`. A traceability row omitting `wave_number` inherits the enclosing item's wave; an explicit value overrides. A verification omitting `wave_id` defaults to the enclosing item's resolved wave row; an explicit id wins. Everything is written in one transaction — any failure rolls back rows *and* events, so no orphan events survive. Supplying top-level `verifications`/`traceability` **alongside** `items[]` is rejected deliberately, because those payloads would otherwise be silently dropped.

- **Compaction hook replaces `output.prompt`, does not append to `output.context`.** The `experimental.session.compacting` hook (V1-only) overwrites `output.prompt` with a bounded continuation prompt from the shared formatter (`src/shared/continuation-prompt.ts`). `output.prompt` is last-writer-wins — earlier prompt content is not preserved or merged. `output.context` is never touched by the hook; if the host does not read `output.context` after compaction, context entries from other hooks are silently discarded. The hook stands down without mutating either field when no valid workflow can be resolved.

- **Live V2 catalogs can publish `reasoning_options` instead of `variants`.** Real OpenCode host catalogs (e.g. `openai/gpt-5.6-sol`) publish `reasoning: true` plus `reasoning_options: [{type:"effort", values:[...]}]` with **no** `variants` array — only supported ids, no request encoding. `resolveCapabilities` (`src/features/thinking/capability.ts`) extracts these into an id-only supported set; `resolveThinkingValue` returns the honest string id (no fabricated headers/body); and the V2 adapter applies it through `agent.model.variant` alone (`src/core/hooks-v2.ts`). The same shape is classified as `raw.source === "v2"` on the V1 path, where `getVerifiedV1RequestOption` returns `undefined` and the provider default is preserved with a diagnostic — V1 never fabricates a request option.

- **System prompt composition: one state block, separate phase enforcement.** `src/hooks/system-transform.ts` injects exactly one `<goopspec_state>` block per LLM call. Phase enforcement (`## PHASE ENFORCEMENT`) is a separate block built by `src/features/enforcement/phase-context.ts` — it returns rules only, not a second state block. The `<goopspec_db>` block carries only the workflow doc inventory and a pointer to tool schemas; DB tool descriptions are no longer restated in the system prompt. Shared prompt-authoring strategy (precedence, absolutes, outcome-first, one autonomy policy per role, batching) lives once in `packages/opencode-plugin/references/core-protocol.md` §Prompt Authoring Rules — every other prompt surface points to it, not restates it.

- **The host loads a built bundle, once per session — source edits in a worktree do not affect the running session.** `package.json` points `main`/`exports` at the source entry (`src/index.ts`), but the `build` script compiles that entry to a `dist/index.js` bundle (`bun build ./src/index.ts --outdir ./dist --target bun`), and the host loads the plugin from the built bundle at its configured install path, once per session. That install path is outside this git worktree, so editing tool behavior here — even after a commit or a passing test run — changes nothing the current session actually executes. An agent that just changed a tool cannot observe the change in its own tool calls, and a clean call must not be treated as evidence the fix works. Validating a plugin behavior change requires rebuilding the bundle at the install path and restarting the host; the only evidence available inside a session is the unit test suite.
