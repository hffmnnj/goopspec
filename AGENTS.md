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
├── hooks/                 # OpenCode plugin hooks
├── features/              # Feature modules (memory, state, routing, model-routing)
├── shared/                # Utilities (logger, paths)
├── test-utils.ts          # Shared test utilities
└── index.ts               # Plugin entry point

agents/                    # 13 agent markdown definitions
commands/                  # 9 slash command definitions
references/                # 12 consolidated reference documents
templates/                 # File templates
```

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

## Gotchas (Auto)

<!-- Last verified: 2026-06-17 — GoopSpec 1.0.0 plugin-only structure -->

- **Bun `mock.module()` replaces the entire module globally.** When mocking `../../features/worktree/git.js` in a tool test, spread the real module into the mock (`const real = await import(...); mock.module(..., () => ({ ...real, fn: mockFn }))`) — otherwise named exports disappear and other tests in the same run fail with "Export named 'X' not found".

- **State schema v2 required for multi-workflow.** `state.json` must be `"version": 2` with a `workflows` map. v1 files are auto-migrated on first write with a `.backup` copy. The `"default"` workflow key maps to `.goopspec/` root (backward compat); all other workflow IDs get their own subdirectory.

- **Workflow-scoped docs live under `.goopspec/<workflowId>/`.** When writing SPEC.md, BLUEPRINT.md, CHRONICLE.md, ADL.md, HANDOFF.md, REQUIREMENTS.md, RESEARCH.md — always use `getWorkflowDocPath(projectDir, workflowId, filename)` from `src/shared/paths.ts`. Never write these to `.goopspec/` root for non-default workflows.

- **`GOOPSPEC_DEBUG=true` enables verbose logging** via `log()` in `src/shared/logger.ts`. Without it, `log()` calls are no-ops. Only `logError()` always logs.

- **Memory is in-process via `bun:sqlite`.** The memory feature runs inside the plugin process using SQLite with FTS5 + LIKE fallback. There is no separate worker process and no `port-37777` service.

- **Knowledge lives in `references/`, not `skills/`.** GoopSpec 1.0.0 removed the skills feature. Use `goop_reference` to load the 12 consolidated reference documents.
