# Team Coordination Reference

This reference documents how GoopSpec agents coordinate when running in parallel. It explains the registry, per-agent file patterns, merge workflow, conflict handling, and recommended practices.

## Overview

The team coordination system prevents parallel agents from overwriting shared files by:

- Registering active agents and their claimed files in a central registry.
- Redirecting shared outputs to per-agent files using a stable naming pattern.
- Allowing the orchestrator to merge per-agent outputs into canonical files.
- Detecting conflicts early and suggesting safe alternatives.

Key artifacts live under `.goopspec/team/`.

## Registry Structure and Operations

**Registry location:** `.goopspec/team/registry.json` (with `.goopspec/team/registry.lock` for atomic writes).

**Registry schema:**

```json
{
  "version": 1,
  "agents": {
    "agent-id": {
      "id": "agent-id",
      "type": "goop-executor-medium",
      "task": "Implement registry",
      "claimedFiles": ["src/features/team/registry.ts"],
      "parentId": "parent-agent-id",
      "startedAt": 1700000000000,
      "ttl": 1800000
    }
  }
}
```

**Fields:**

- `id`: unique agent identifier.
- `type`: agent type (e.g., `goop-researcher`).
- `task`: short task description.
- `claimedFiles`: files this agent intends to write.
- `parentId`: parent agent identifier if delegated.
- `startedAt`: registration time (ms epoch).
- `ttl`: optional time-to-live for cleanup (ms).

**Core operations:**

- `getRegistry()` reads the registry state.
- `registerAgent(registration)` registers an agent atomically.
- `deregisterAgent(agentId)` removes the agent entry.
- `getActiveAgents()` returns all active agents.
- `getAgentsByType(type)` filters by agent type.
- `isFileClaimed(filePath)` checks if any agent has claimed a file.

**Atomic behavior:** registry updates use a lock file and atomic write to prevent race conditions.

## Per-Agent File Patterns

When multiple agents produce shared artifacts, each writes to its own file using:

```
{basename}-{shortId}.{ext}
```

Example: `RESEARCH.md` becomes `RESEARCH-a1b2c3.md` for agent `a1b2c3`.

**Short ID rules:**

- Derived from the agent ID with non-alphanumeric characters removed.
- Length is clamped to 6-8 characters (default 7).
- If a short ID is empty after normalization, the basename remains unchanged.

**Helpers:**

- `generateAgentFilePath(basePath, agentId, shortIdLength?)`
- `extractAgentId(agentFilePath)`
- `findAgentFiles(basePath, pattern?)`
- `getCanonicalPath(agentFilePath)`

### Per-Agent File Patterns by Agent Type

Per-agent naming works for any shared output file. Common base files by agent type:

| Agent Type | Typical Base File | Per-Agent Example |
| --- | --- | --- |
| `goop-researcher` | `RESEARCH.md` | `RESEARCH-res001.md` |
| `goop-explorer` | `RESEARCH.md` | `RESEARCH-exp123.md` |
| `goop-planner` | `BLUEPRINT.md` | `BLUEPRINT-plan42.md` |
| `goop-verifier` | `CHRONICLE.md` | `CHRONICLE-ver789.md` |
| `goop-writer` | `RESEARCH.md` or `SPEC.md` | `SPEC-wrt555.md` |
| `goop-executor-{tier}` | Shared docs when needed | `CHRONICLE-exe321.md` |
| `goop-debugger` | `RESEARCH.md` | `RESEARCH-bug007.md` |

These examples are illustrative; the pattern applies to any base file (e.g., `SPEC.md`, `BLUEPRINT.md`, `CHRONICLE.md`, `RESEARCH.md`, `HANDOFF.md`).

## Merge Workflow

After parallel work, the orchestrator merges per-agent outputs into a canonical file.

**Merge steps:**

1. Locate all per-agent files matching the canonical base path.
2. Read registry to map short IDs to full agent IDs and tasks.
3. Render a header for each section, then concatenate sections with separators.
4. Write the merged content to the canonical output path.
5. Optionally remove per-agent files after merge.

**Header template:**

```
## Agent {{agentId}}

Task: {{task}}
```

The merge utility replaces `{{agentId}}` and `{{task}}`, then joins sections using `---` separators.

## Conflict Detection and Resolution

Before writing a file, check for conflicts:

1. Call `checkFileConflict(filePath, requestingAgentId)`.
2. If `hasConflict` is `true`, read `warningMessage` and `suggestedPath`.
3. Write to the suggested per-agent path instead of the claimed file.
4. Notify the orchestrator to merge once all agents complete.

If the file is claimed by the same agent, the conflict check allows the write.

## Examples

### Generate a Per-Agent File Path

```ts
import { generateAgentFilePath } from "../src/features/team/file-patterns.js";

const agentFile = generateAgentFilePath("RESEARCH.md", "res-001");
// => "RESEARCH-res001.md"
```

### Merge Per-Agent Outputs

```ts
import { mergeAgentOutputs } from "../src/features/team/merge.js";

await mergeAgentOutputs({
  basePath: ".goopspec/RESEARCH.md",
  cleanup: false,
});
```

### Conflict Warning (Example)

```
WARNING: File Conflict Detected

The file you're trying to write is claimed by another agent:
- Agent: exec-001 (goop-executor-high)
- Task: Modify index

Suggested action: Write to your per-agent file instead:
→ RESEARCH-exec002.md
```

## Best Practices

- Register early and claim files you intend to modify.
- Use per-agent files for shared artifacts (research, plans, summaries).
- Avoid writing directly to canonical files during parallel work.
- Keep per-agent outputs focused and well-structured to ease merging.
- Clean up per-agent files after a successful merge when possible.
- If you must touch a claimed file, coordinate through the orchestrator.

## Related Files

- `src/features/team/types.ts` - Registry types
- `src/features/team/registry.ts` - Registry operations
- `src/features/team/file-patterns.ts` - File pattern helpers
- `src/features/team/merge.ts` - Merge utilities
- `src/features/team/conflict.ts` - Conflict detection
- `src/features/team/cleanup.ts` - Cleanup utilities
