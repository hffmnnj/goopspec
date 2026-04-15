# Wiring Checklist

Use during planning and verification to prevent integration gaps. "Wiring" is the act of connecting new code to existing entry points, registries, routers, and consumers. A feature that builds correctly but isn't wired is invisible to users.

## Why Wiring Fails

Agents build features in isolation. The implementation is correct, tests pass locally, but the feature is unreachable because it was never registered, exported, or routed. These failures are silent — no error is thrown, the feature simply doesn't exist from the user's perspective.

---

## Pattern 1: New Tool/Command Not Registered in Index

A new MCP tool is built but never added to the plugin's tool registry.

**Why it happens:** The agent creates `src/tools/goop-xyz/index.ts` with a working tool factory, writes tests, and commits — but never touches `src/tools/index.ts` where all tools are collected and returned to the plugin.

**GoopSpec example:** A `createGoopXyzTool` function exists in `src/tools/goop-xyz/index.ts` but is not imported or included in the tools object returned by `createTools()` in `src/tools/index.ts`. The tool works in tests but is invisible to Claude Code.

**What to check:**
- [ ] `src/tools/index.ts` imports the new tool factory
- [ ] `createTools()` return object includes the new tool
- [ ] `bun run build` succeeds with the new import
- [ ] Manual test: tool appears in MCP tool list

**Common fix:**
```typescript
// src/tools/index.ts
import { createGoopXyzTool } from "./goop-xyz/index.js";

// Inside createTools():
goop_xyz: createGoopXyzTool(ctx),
```

---

## Pattern 2: New Route/Page Not Added to Router

A new handler or page is built but never registered in the routing layer, so it's unreachable.

**Why it happens:** The agent creates the handler file and its logic but doesn't update the dispatch table, command registry, or router configuration that maps user input to handlers.

**GoopSpec example:** A new slash command `goop-xyz` is defined in `commands/goop-xyz.md` but not registered in the OpenCode plugin config or the `slashcommand` tool's command discovery logic. Users type `/goop-xyz` and get "unknown command."

**What to check:**
- [ ] Command definition file exists in `commands/`
- [ ] Command is listed in the plugin's command discovery path
- [ ] `slashcommand` tool can resolve the new command name
- [ ] `goop_reference({ list: true })` or equivalent discovery shows the new entry

**Common fix:**
Add the command markdown file to the `commands/` directory following the naming convention (`goop-[name].md`). Verify the command resolver scans the directory dynamically or update the static registry if one exists.

---

## Pattern 3: New Agent/Skill Not Referenced in Orchestrator or AGENTS.md

A new agent definition or skill is created but has no dispatch path — nothing routes work to it.

**Why it happens:** The agent creates `agents/goop-xyz.md` with a complete system prompt, but the orchestrator's delegation table doesn't list it, AGENTS.md doesn't mention it, and no `subagent_type` routing maps to it.

**GoopSpec example:** A new `agents/goop-tester.md` is created with testing-specific instructions. But `agents/goop-orchestrator.md` has no entry for `goop-tester` in its delegation table, and the routing logic in `src/features/routing/` doesn't map any task category to the new agent type.

**What to check:**
- [ ] Agent file exists in `agents/` with correct naming (`goop-[name].md`)
- [ ] Orchestrator's delegation table includes the new agent type
- [ ] `src/features/routing/` maps at least one task category to the new agent
- [ ] AGENTS.md documents the new agent's purpose and scope
- [ ] At least one `task()` call path can reach the new agent

**Common fix:**
1. Add the agent to the orchestrator's delegation mapping in `agents/goop-orchestrator.md`
2. Add a routing entry in `src/features/routing/` that maps task descriptions to the new `subagent_type`
3. Document the agent in AGENTS.md

---

## Pattern 4: New Config Option Not Plumbed Through to Consumers

A configuration field is added to a type or schema, but nothing reads or acts on it.

**Why it happens:** The agent adds a field to the state type (e.g., `WorkflowState` in `src/core/types.ts`) and updates the state mutation tool, but forgets to update the hooks, features, or prompt builders that should branch on the new value.

**GoopSpec example:** Adding `lazyAutopilot?: boolean` to `GoopState.workflow` in `src/core/types.ts` and extending `set-autopilot` in `src/tools/goop-state/index.ts` — but not updating `buildWorkflowStateBlock` in `src/hooks/compaction-hook.ts` to inject the appropriate directive when the flag is true. The flag is settable but has no effect on agent behavior.

**What to check:**
- [ ] New field is defined in the type (`src/core/types.ts`)
- [ ] At least one mutation path sets the field (tool, hook, or feature)
- [ ] At least one consumer reads the field and changes behavior
- [ ] Hooks that build prompt context include the new field when relevant
- [ ] A test toggles the field and asserts observable behavior change

**Common fix:**
Trace all places that read the config/state object. For each consumer that should react to the new field, add a conditional branch. Write a test that sets the field and verifies the downstream effect.

---

## Pattern 5: New Module Not Exported from Package Entry Point

A new module works internally but isn't re-exported from the package's public API surface.

**Why it happens:** The agent creates `src/features/lazy-autopilot/index.ts` with working logic and tests, but never adds a re-export in `src/index.ts`. The module is invisible to external consumers and may be tree-shaken out of the build.

**GoopSpec example:** A new `src/features/lazy-autopilot/index.ts` exports `createLazyAutopilotFeature`, but `src/index.ts` doesn't import or re-export it. The feature works in unit tests (which import directly) but isn't available to the plugin runtime.

**What to check:**
- [ ] Module's public API is exported from `src/index.ts`
- [ ] `bun run build` includes the module in `dist/`
- [ ] No "unused export" warnings for the new module
- [ ] Integration test or manual test confirms the module is reachable at runtime

**Common fix:**
```typescript
// src/index.ts
export { createLazyAutopilotFeature } from "./features/lazy-autopilot/index.js";
```

---

## Wiring Verification Summary

Run through this checklist for every feature before marking it complete:

- [ ] **Registry** — New tools, commands, or handlers registered in their index/router
- [ ] **Routing** — At least one dispatch path reaches the new code
- [ ] **Exports** — Public API re-exported from package entry point
- [ ] **Config plumbing** — New options read by at least one consumer with observable effect
- [ ] **Documentation** — New agents, skills, or references listed in AGENTS.md or equivalent
- [ ] **Build** — `bun run build` succeeds and includes new files in output
- [ ] **Discovery** — New resource appears in listing tools (`goop_reference({ list: true })`, `goop_skill({ list: true })`)

If any item fails, the feature has a wiring gap. Fix before acceptance.

---

*Wiring Checklist Reference v1.0*
*Load via: `goop_reference({ name: "wiring-checklist" })`*
