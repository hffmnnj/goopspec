# AGENTS.md

Guidelines for AI agents working in this codebase.

## Build & Test Commands

```bash
bun install                              # Install all workspace dependencies
bun run build                            # Build all packages
bun run typecheck                        # Type check all packages
bun test                                 # Run all tests (all packages)

# Per-package commands
bun run --cwd packages/core build        # Build @goopspec/core
bun run --cwd packages/daemon build      # Build @goopspec/daemon
bun run --cwd packages/opencode-plugin build  # Build @goopspec/opencode-plugin
bun run --cwd packages/web build         # Build @goopspec/web (Astro)
bun run --cwd packages/web dev           # Dev server for web panel

# Testing
bun test packages/core/                  # Test core package
bun test packages/daemon/                # Test daemon package
bun test packages/opencode-plugin/       # Test plugin package
bun test packages/opencode-plugin/src/tools/goop-status/index.test.ts  # Single file
bun test --filter "goop_status"          # Tests matching pattern
bun test --watch                         # Watch mode
```

## Project Structure

```
packages/
├── core/            # @goopspec/core — shared types, Zod schemas, API contracts
├── daemon/          # @goopspec/daemon — 24/7 Hono server, SQLite, WS, SSE
├── opencode-plugin/ # @goopspec/opencode-plugin — MCP tools, skills, hooks
└── web/             # @goopspec/web — Astro SSR web panel

packages/opencode-plugin/src/
├── core/           # Types, config, resolver
├── tools/          # MCP tool implementations
├── hooks/          # OpenCode plugin hooks
├── features/       # Feature modules (memory, state, routing, daemon client)
├── agents/         # Agent definitions and prompt sections
├── shared/         # Utilities (logger, paths, ui)
└── test-utils.ts   # Shared test utilities

agents/             # Agent markdown definitions
commands/           # Slash command definitions
skills/             # Loadable skill modules
references/         # Reference documentation
templates/          # File templates
```

## Packages

| Package | Purpose |
|---------|---------|
| `@goopspec/core` | Shared types (`Project`, `WorkItem`, `WorkflowSession`, `WorkflowEvent`, `DaemonHealth`), Zod schemas, WS message types, `generateId` |
| `@goopspec/daemon` | Always-on Hono HTTP server (port 7331), SQLite persistence via `bun:sqlite`, Bun-native WebSocket rooms, SSE event stream, workflow orchestration |
| `@goopspec/opencode-plugin` | MCP tools, slash commands, skills, hooks — the OpenCode plugin entry point |
| `@goopspec/web` | Astro v5 SSR web panel with React islands (Shadcn/ui), Tailwind v4, PWA support |

## Code Style

### TypeScript Configuration
- **Target**: ES2022, **Module**: NodeNext
- **Strict mode** enabled with noUnusedLocals, noUnusedParameters, noImplicitReturns
- Use `.js` extension for all local imports (ESM requirement)

### Import Order
```typescript
// 1. External imports
import { tool, type ToolDefinition } from "@Claude-ai/plugin/tool";
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
- `setupTestEnvironment(prefix)` - Temp dir with .goopspec structure
- `createMockPluginContext(opts)` - Full plugin context mock
- `createMockToolContext(opts)` - Tool execution context mock
- `createMockStateManager(state)` - State manager mock

## Implementation Patterns

### UI Pattern (Clack)
Use the shared UI wrapper for consistent, interactive feedback.

```typescript
import { ui } from "../shared/ui.js";

// Status spinners
await ui.spinner("Analyzing dependency graph", async () => {
  await heavyOperation();
  return "Graph built";
});

// Interactive prompts
const confirm = await ui.confirm("Do you want to proceed?");

// Notes and Logs
ui.note("Analysis Complete", "Found 3 potential issues.");
```

### Tool Pattern
```typescript
import { tool, type ToolDefinition } from "@Claude-ai/plugin/tool";
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
    async postToolUse(params: {
      toolName: string;
      result: unknown;
      sessionId: string;
    }): Promise<{ inject?: string } | void> {
      // Hook logic
    },
  };
}
```

## Key Rules

1. **Memory-First** - Always check memory/state before action. Persist learnings after.
2. **Interactive UI** - Use `ui` helpers (Clack) for all user interaction. Never use raw `console.log`.
3. **Graceful degradation** - Never crash the plugin, return fallback results.
4. **Co-locate tests** - Test files next to implementation.
5. **Use test-utils** - Leverage shared mock factories.
6. **ESM imports** - Always use .js extension for local imports.
7. **Explicit types** - Avoid `any`, define interfaces in core/types.ts.
8. **Minimal comments** - Only document non-obvious logic.
9. **Atomic commits** - Keep changes focused and small.

## Gotchas (Auto)

<!-- Last verified: 2026-03-11 — git-worktree-multi-session milestone -->

- **Bun `mock.module()` replaces the entire module globally.** When mocking `../../features/worktree/git.js` in a tool test, spread the real module into the mock (`const real = await import(...); mock.module(..., () => ({ ...real, fn: mockFn }))`) — otherwise named exports disappear and other tests in the same run fail with "Export named 'X' not found".

- **State schema v2 required for multi-workflow.** `state.json` must be `"version": 2` with a `workflows` map. v1 files are auto-migrated on first write with a `.backup` copy. The `"default"` workflow key maps to `.goopspec/` root (backward compat); all other workflow IDs get their own subdirectory.

- **Workflow-scoped docs live under `.goopspec/<workflowId>/`.** When writing SPEC.md, BLUEPRINT.md, CHRONICLE.md, ADL.md, HANDOFF.md, REQUIREMENTS.md, RESEARCH.md — always use `getWorkflowDocPath(projectDir, workflowId, filename)` from `src/shared/paths.ts`. Never write these to `.goopspec/` root for non-default workflows.

- **`GOOPSPEC_DEBUG=true` enables verbose logging** via `log()` in `src/shared/logger.ts`. Without it, `log()` calls are no-ops. Only `logError()` always logs.

- **Tailwind v4 + Astro: use `@tailwindcss/vite`, NOT `@astrojs/tailwind`.** The `@astrojs/tailwind` integration is incompatible with Tailwind v4. Add `tailwindcss()` from `@tailwindcss/vite` directly to `astro.config.ts` vite plugins array.

- **Daemon WebSocket uses Bun native transport, NOT hono/ws.** WebSocket handling is wired through `Bun.serve`'s `websocket` config option (`packages/daemon/src/transport/ws-server.ts`). Do not attempt to use a Hono WebSocket adapter — it is not used here.

- **Daemon SSE uses Web Streams API (`ReadableStream`), not a library.** The SSE endpoint (`packages/daemon/src/transport/sse.ts`) streams events via `ReadableStream` + `ReadableStreamDefaultController`. No third-party SSE library is used.

- **Daemon transport tests use mock WebSocket objects — do NOT start real servers.** Unit tests for `rooms.ts`, `ws-server.ts`, and `sse.ts` inject mock objects. Starting a real `Bun.serve` instance in tests causes port conflicts and flakiness.
