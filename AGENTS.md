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
bun test --filter "goop_status"                       # Tests matching pattern
bun test --watch                                      # Watch mode
```

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

agents/                    # 14 agent markdown definitions
commands/                  # 9 slash command definitions
references/                # 13 consolidated reference documents (incl. field-notes-protocol)
templates/                 # File templates
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
- **`src/tools/`** — All 30 tool factories in `src/tools/index.ts` (`createTools()`).
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

Defined in `src/core/constants.ts` (lines 140-146):

| Role(s) | Default Level |
|---------|---------------|
| `explorer`, `researcher` | `medium` |
| All other `AGENT_ROLES` (12 roles) | `high` |

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
- Waves and tracking: `goop_write_wave`, `goop_query_decisions`, `goop_blocker`
- Project views: `goop_timeline`, `goop_dashboard`
- Field Notes: `goop_save_note`, `goop_search_notes`

## Gotchas (Auto)

<!-- Last verified: 2026-06-18 — GoopSpec 1.0.0 plugin-only structure -->

- **Bun `mock.module()` replaces the entire module globally.** When mocking `../../features/worktree/git.js` in a tool test, spread the real module into the mock (`const real = await import(...); mock.module(..., () => ({ ...real, fn: mockFn }))`) — otherwise named exports disappear and other tests in the same run fail with "Export named 'X' not found".

- **`goopspec.db` is the source of truth for workflow state.** The unified SQLite database at `.goopspec/goopspec.db` stores workflows, events, documents, and field notes. `state.json` is auto-migrated to DB on first use; `.backup` kept for safety. Markdown files under `.goopspec/<workflowId>/` are rendered sidecars, not primary storage.

- **`goop_read_db({ doc_types: [...] })` batch form preferred.** In agent boot sequences, use the batch form to load multiple docs in one call instead of multiple singular `goop_read_db({ doc_type: "..." })` calls. Example: `goop_read_db({ doc_types: ["spec", "blueprint", "chronicle"] })`.

- **Workflow-scoped docs live under `.goopspec/<workflowId>/`.** When writing SPEC.md, BLUEPRINT.md, CHRONICLE.md, ADL.md, HANDOFF.md, REQUIREMENTS.md, RESEARCH.md — always use `getWorkflowDocPath(projectDir, workflowId, filename)` from `src/shared/paths.ts`. Never write these to `.goopspec/` root for non-default workflows.

- **`GOOPSPEC_DEBUG=true` enables verbose logging** via `log()` in `src/shared/logger.ts`. Without it, `log()` calls are no-ops. Only `logError()` always logs.

- **Memory is in-process via `bun:sqlite`.** The memory feature runs inside the plugin process using SQLite with FTS5 + LIKE fallback. There is no separate worker process and no `port-37777` service.

- **Prefer `items[]` batch mode for multi-write turns.** All four write tools (`goop_write_db`, `goop_write_section`, `goop_write_wave`, `goop_save_note`) now accept an optional `items[]` parameter. When writing more than one doc/section/wave/row/note in a turn, use the batch form to minimize tool calls and wrap writes in a single transaction. Single-item usage is unchanged and still supported.

- **Knowledge lives in `references/`, not `skills/`.** GoopSpec 1.0.0 removed the skills feature. Use `goop_reference` to load the 13 consolidated reference documents (including `field-notes-protocol`).
