# RESEARCH: Baseline Token Audit (Wave 1, Task 1.1)

**Date:** 2026-02-08  
**Methodology:** token estimate = `chars / 4`  
**Scope:** tools, agents, references, skills, and auto-injected prompt content used during agent launch.

## Baseline Summary

- **Total baseline chars:** `400,854`
- **Total baseline tokens (estimated):** `100,213.50`
- **Primary contributors:** reference docs + agent markdown dominate the launch overhead.

## Category Breakdown

| Category | Files/Sections | Chars | Est. Tokens | Share |
|---|---:|---:|---:|---:|
| Tool descriptions | 16 | 4,043 | 1,010.75 | 1.01% |
| Agent markdown files | 13 | 163,420 | 40,855.00 | 40.77% |
| Reference docs | 36 | 222,407 | 55,601.75 | 55.48% |
| Skill docs | 1 | 8,249 | 2,062.25 | 2.06% |
| Auto-injected boilerplate | 5 sections | 2,735 | 683.75 | 0.68% |
| **Total Baseline** | **71 measured units** | **400,854** | **100,213.50** | **100%** |

## Ranked Largest Contributors (Top 15)

| Rank | Contributor | Category | Chars | Est. Tokens |
|---:|---|---|---:|---:|
| 1 | `agents/goop-orchestrator.md` | agent-file | 22,496 | 5,624.00 |
| 2 | `agents/goop-planner.md` | agent-file | 16,165 | 4,041.25 |
| 3 | `references/plan-process.md` | reference-file | 14,772 | 3,693.00 |
| 4 | `agents/goop-researcher.md` | agent-file | 13,785 | 3,446.25 |
| 5 | `references/discuss-process.md` | reference-file | 13,020 | 3,255.00 |
| 6 | `agents/goop-writer.md` | agent-file | 12,984 | 3,246.00 |
| 7 | `agents/goop-tester.md` | agent-file | 12,892 | 3,223.00 |
| 8 | `agents/goop-executor.md` | agent-file | 12,775 | 3,193.75 |
| 9 | `agents/goop-designer.md` | agent-file | 12,684 | 3,171.00 |
| 10 | `agents/goop-verifier.md` | agent-file | 11,821 | 2,955.25 |
| 11 | `agents/goop-debugger.md` | agent-file | 10,983 | 2,745.75 |
| 12 | `agents/goop-librarian.md` | agent-file | 10,041 | 2,510.25 |
| 13 | `references/subagent-protocol.md` | reference-file | 10,035 | 2,508.75 |
| 14 | `agents/goop-explorer.md` | agent-file | 9,970 | 2,492.50 |
| 15 | `agents/memory-distiller.md` | agent-file | 9,244 | 2,311.00 |

---

## 1) Tool Description Baseline (16 tools)

Extraction rule: measure **only** the description string literal/template used by `return tool({ ... })`.

| Tool file | Description source | Chars | Est. Tokens |
|---|---|---:|---:|
| `src/tools/goop-state/index.ts` | literal | 856 | 214.00 |
| `src/tools/goop-reference/index.ts` | literal | 722 | 180.50 |
| `src/tools/goop-setup/index.ts` | literal | 386 | 96.50 |
| `src/tools/memory-save/index.ts` | literal | 355 | 88.75 |
| `src/tools/memory-search/index.ts` | literal | 331 | 82.75 |
| `src/tools/memory-decision/index.ts` | literal | 258 | 64.50 |
| `src/tools/memory-forget/index.ts` | literal | 240 | 60.00 |
| `src/tools/memory-note/index.ts` | literal | 202 | 50.50 |
| `src/tools/goop-delegate/index.ts` | literal | 139 | 34.75 |
| `src/tools/goop-skill/index.ts` | literal | 116 | 29.00 |
| `src/tools/goop-adl/index.ts` | literal | 111 | 27.75 |
| `src/tools/session-search/index.ts` | literal | 110 | 27.50 |
| `src/tools/goop-spec/index.ts` | literal | 69 | 17.25 |
| `src/tools/goop-checkpoint/index.ts` | literal | 65 | 16.25 |
| `src/tools/goop-status/index.ts` | literal | 62 | 15.50 |
| `src/tools/slashcommand/index.ts` | buildDescription template literal | 21 | 5.25 |
| **Tools Total** |  | **4,043** | **1,010.75** |

---

## 2) Agent Markdown Baseline (13 agents)

Measurement rule: full raw markdown file size per file.

| Agent file | Chars | Est. Tokens |
|---|---:|---:|
| `agents/goop-orchestrator.md` | 22,496 | 5,624.00 |
| `agents/goop-planner.md` | 16,165 | 4,041.25 |
| `agents/goop-researcher.md` | 13,785 | 3,446.25 |
| `agents/goop-writer.md` | 12,984 | 3,246.00 |
| `agents/goop-tester.md` | 12,892 | 3,223.00 |
| `agents/goop-executor.md` | 12,775 | 3,193.75 |
| `agents/goop-designer.md` | 12,684 | 3,171.00 |
| `agents/goop-verifier.md` | 11,821 | 2,955.25 |
| `agents/goop-debugger.md` | 10,983 | 2,745.75 |
| `agents/goop-librarian.md` | 10,041 | 2,510.25 |
| `agents/goop-explorer.md` | 9,970 | 2,492.50 |
| `agents/memory-distiller.md` | 9,244 | 2,311.00 |
| `agents/goop-creative.md` | 7,580 | 1,895.00 |
| **Agents Total** | **163,420** | **40,855.00** |

---

## 3) Reference Document Baseline (`references/*.md`)

Measurement rule: full raw markdown file size per file.

| Reference file | Chars | Est. Tokens |
|---|---:|---:|
| `references/plan-process.md` | 14,772 | 3,693.00 |
| `references/discuss-process.md` | 13,020 | 3,255.00 |
| `references/subagent-protocol.md` | 10,035 | 2,508.75 |
| `references/plugin-architecture.md` | 9,144 | 2,286.00 |
| `references/response-format.md` | 9,126 | 2,281.50 |
| `references/phase-gates.md` | 8,732 | 2,183.00 |
| `references/agent-patterns.md` | 8,324 | 2,081.00 |
| `references/git-workflow.md` | 7,645 | 1,911.25 |
| `references/xml-response-schema.md` | 7,256 | 1,814.00 |
| `references/context-injection.md` | 6,922 | 1,730.50 |
| `references/handoff-protocol.md` | 6,870 | 1,717.50 |
| `references/map-codebase-process.md` | 6,706 | 1,676.50 |
| `references/discovery-interview.md` | 6,635 | 1,658.75 |
| `references/accept-process.md` | 6,631 | 1,657.75 |
| `references/ui-brand.md` | 6,520 | 1,630.00 |
| `references/execute-process.md` | 6,223 | 1,555.75 |
| `references/orchestrator-philosophy.md` | 6,202 | 1,550.50 |
| `references/quick-process.md` | 6,005 | 1,501.25 |
| `references/team-coordination.md` | 5,849 | 1,462.25 |
| `references/dispatch-patterns.md` | 5,775 | 1,443.75 |
| `references/enforcement-system.md` | 5,748 | 1,437.00 |
| `references/model-profiles.md` | 5,114 | 1,278.50 |
| `references/tdd.md` | 4,913 | 1,228.25 |
| `references/security-checklist.md` | 4,573 | 1,143.25 |
| `references/status-process.md` | 4,538 | 1,134.50 |
| `references/specify-process.md` | 4,111 | 1,027.75 |
| `references/workflow-plan.md` | 3,910 | 977.50 |
| `references/interactive-questioning.md` | 3,887 | 971.75 |
| `references/workflow-specify.md` | 3,752 | 938.00 |
| `references/workflow-research.md` | 3,710 | 927.50 |
| `references/ui-interaction-patterns.md` | 3,591 | 897.75 |
| `references/visual-style.md` | 3,580 | 895.00 |
| `references/workflow-accept.md` | 3,377 | 844.25 |
| `references/boundary-system.md` | 3,275 | 818.75 |
| `references/workflow-execute.md` | 3,091 | 772.75 |
| `references/deviation-rules.md` | 2,845 | 711.25 |
| **References Total** | **222,407** | **55,601.75** |

---

## 4) Skill File Baseline (`skills/*.md`)

| Skill file | Chars | Est. Tokens |
|---|---:|---:|
| `skills/README.md` | 8,249 | 2,062.25 |
| **Skills Total** | **8,249** | **2,062.25** |

---

## 5) Auto-Injected Content Baseline

### Agent factory (`src/agents/agent-factory.ts`)

Measured sections injected into every composed agent prompt:

| Section | Chars | Est. Tokens |
|---|---:|---:|
| `#question-tool-instructions-section` | 1,393 | 348.25 |
| `#memory-instructions-section` | 773 | 193.25 |

### System transform (`src/hooks/system-transform.ts`)

Measured runtime-injected templates/blocks:

| Section | Chars | Est. Tokens |
|---|---:|---:|
| `#persistent-memory-context-block` | 298 | 74.50 |
| `#session-context-template` | 234 | 58.50 |
| `#session-context-wrapper` | 37 | 9.25 |
| **Auto-Injected Total** | **2,735** | **683.75** |

---

## Notes and Caveats

1. `references/*.md` currently contains **36** files (not 35).
2. `skills/*.md` currently contains **1** markdown file (`skills/README.md`).
3. `slashcommand` uses a dynamic getter for description; measured from the template literal inside `buildDescription()`.
4. `system-transform.ts` does not contain a literal `<goopspec_context>` block in current code; measured actual injected sections present in this file.

## Reproducibility

To reproduce this Baseline audit, rerun file-size and string-literal extraction with the same rules:

- Tool descriptions: extract only `description` literals/templates from each `src/tools/*/index.ts` tool definition.
- Agents/references/skills: raw file character count.
- Auto-injected sections: explicit injected template blocks in `src/agents/agent-factory.ts` and `src/hooks/system-transform.ts`.

---

# RESEARCH: Plugin Architecture (Wave 1, Task 1.2)

**Domain:** OpenCode plugin + tool + agent architecture (selective tool loading)
**Date:** 2026-02-08
**Sources:** OpenCode official docs, OpenCode OSS source (sst/opencode @ 4086a9ae), GoopSpec source

## A2 Answer

**Assumption A2 ("OpenCode loads all tool definitions on launch"): VALIDATED.**

OpenCode constructs the LLM `tools` object by iterating over the full tool registry (built-ins + plugins + MCP) and passes those tool definitions into the provider call. Agent/session permissions are enforced at execution time via `PermissionNext.ask()`, but they do **not** filter which tool definitions are included in the model request.

**Therefore:** OpenCode does **not** support selective tool *definition* loading per agent (as a context-size optimization) without upstream changes.

## Tool Registration Flow (Plugin → OpenCode → LLM)

### 1) Plugin tools are declared in the SDK as { description, args, execute }

Evidence:
- `@opencode-ai/plugin` tool helper + ToolDefinition shape: https://raw.githubusercontent.com/sst/opencode/4086a9ae/packages/plugin/src/tool.ts

### 2) OpenCode loads plugin hooks and converts ToolDefinition → Tool.Info

Tool definitions from plugin hooks are collected by `Plugin.list()`, and each tool is converted via `fromPlugin()`.

Evidence:
- Plugin loading + `Plugin.list()`: https://raw.githubusercontent.com/sst/opencode/4086a9ae/packages/opencode/src/plugin/index.ts
- Tool registry ingestion + `fromPlugin()`: https://raw.githubusercontent.com/sst/opencode/4086a9ae/packages/opencode/src/tool/registry.ts

### 3) OpenCode passes tool definitions to the LLM every prompt iteration

`SessionPrompt.resolveTools()` builds a Vercel AI SDK `tools` object by looping all tools returned by `ToolRegistry.tools(...)` and registering each one with `ai.tool({ id, description, inputSchema, execute })`. This `tools` object is passed into the model call (`processor.process(...)`).

Evidence:
- `resolveTools()` implementation: https://raw.githubusercontent.com/sst/opencode/4086a9ae/packages/opencode/src/session/prompt.ts

## How Tool Descriptions/Schemas Reach the LLM

At OpenCode layer, each tool definition sent to the model consists of:
- `description: item.description`
- `inputSchema`: JSON Schema derived from the tool's Zod schema (`z.toJSONSchema(item.parameters)`), then normalized by `ProviderTransform.schema(...)`, then wrapped with `ai.jsonSchema(...)`.

Evidence:
- Tool schema + description wiring: https://raw.githubusercontent.com/sst/opencode/4086a9ae/packages/opencode/src/session/prompt.ts
- Provider schema normalization rules: https://deepwiki.com/sst/opencode/4.3-provider-transformations

## Agent Prompt Assembly (GoopSpec)

GoopSpec assembles each agent prompt at config time by concatenating:
- agent markdown body
- injected skills (`skills/`)
- injected references/templates (`references/`, `templates/`)
- memory boilerplate (if enabled)
- question tool boilerplate (always)

Evidence:
- Prompt composition + tool permission mapping: `src/agents/agent-factory.ts`
- Agent registration via config hook: `src/plugin-handlers/config-handler.ts`

## Optimization Opportunities

### Plugin-level (available now)

- Compress tool `description` strings (these are always shipped to the LLM via tool definitions).
- If allowed by spec later: shrink/normalize `args` schemas (JSON Schema also contributes to tool payload).
- Reduce agent prompt size by changing GoopSpec prompt composition (skills/references/boilerplate injection).
- Reduce runtime system prompt injection via `experimental.chat.system.transform` (already used by GoopSpec).

### Requires OpenCode upstream change

- Implement permission-based filtering of the tool list before building the LLM `tools` object in `resolveTools()`. Today, OpenCode always registers every tool returned from `ToolRegistry.tools(...)` into the model request.

Evidence:
- No tool-list filtering in `resolveTools()`: https://raw.githubusercontent.com/sst/opencode/4086a9ae/packages/opencode/src/session/prompt.ts

## Constraints / Gaps

- `.references/` directory does not exist in this repo.
- `node_modules/` is not present in this worktree, so SDK/source evidence was obtained from upstream OSS source instead.
- The plugin hook surface does not include a hook to modify/filter the `tools` object passed to the LLM (hooks cover message/system transforms, params/headers, and tool lifecycle, but not tool list selection).

Evidence:
- Hooks surface: https://raw.githubusercontent.com/sst/opencode/4086a9ae/packages/plugin/src/index.ts

---

# RESEARCH: Optimization Strategy (Wave 1, Task 1.3)

**Date:** 2026-02-08
**Goal:** Prioritize optimization work for Waves 2-4 using composed prompt impact (not raw file size alone).

## Current Composed Prompt Sizes (Top 3 Agents)

Method: `composeAgentPrompt()` output size estimate = `chars / 4`.

| Agent | Composed Chars | Est. Tokens | Skills Injected | References Injected |
|---|---:|---:|---:|---:|
| `goop-orchestrator` | 136,648 | 34,162.00 | 5 | 12 |
| `goop-planner` | 112,802 | 28,200.50 | 5 | 11 |
| `goop-executor` | 103,568 | 25,892.00 | 5 | 9 |

Key read: the largest agents are already in the 26K-34K range each after composition, and reference/skill injection dominates more than raw base agent markdown.

## Worth-It Threshold

**Success threshold:** minimum **20% reduction** in overall launch overhead baseline.

- Baseline total: `100,213.50` estimated tokens.
- Threshold savings target: **>= 20,042.70 tokens**.
- Stretch target: **25-30%** if high-frequency injected references/skills can be compressed without behavior drift.

Rationale: below 20%, optimization risk (quality regression + maintenance complexity) likely outweighs practical context-window gains.

## Prioritized Optimization Targets (Impact vs Effort)

Ranking uses:
1) composed prompt impact on largest agents,
2) number of agents affected,
3) implementation effort/risk.

### P1 - Agent Prompt Composition (GO)

**Estimated impact:** Very High (primary driver for top 3 agents)  
**Effort:** Medium  
**Why first:** Directly reduces every high-cost composed prompt by trimming verbose base prompt sections and redundant guidance.

Approach:
- Compress the 13 agent markdown bodies, starting with orchestrator/planner/executor.
- Preserve behavioral instructions, gates, and role boundaries; remove duplication/redundant examples first.
- Keep structure stable to protect test and behavior compatibility.

Risks:
- Loss of role fidelity if imperative constraints are over-trimmed.
- Mitigation: per-agent before/after diff review + role behavior verification in Wave 3.3.

### P2 - Injected References (Injected-Only First) (GO)

**Estimated impact:** Very High (largest shared payload in composed prompts)  
**Effort:** Medium-High  
**Why second:** Repeatedly injected references multiply cost across many agents.

Approach:
- Prioritize references by `size x injection frequency`.
- Compress references that are actually injected in frontmatter first (not all 36 blindly).
- De-duplicate overlapping protocol content across heavily used references while preserving canonical instructions.

Risks:
- Protocol drift/inconsistency if overlapping docs diverge.
- Mitigation: maintain one canonical statement for each critical protocol (XML envelope, handoff, deviation rules), then cross-reference.

### P3 - Shared Skills (GO, targeted)

**Estimated impact:** High (shared across major agents, especially `goop-core`)  
**Effort:** Medium  
**Why third:** Skills are injected into many agents; trimming common skills has broad payoff.

Approach:
- Compress high-frequency shared skills first (`goop-core`, `memory-usage` where injected).
- Remove repeated explanatory prose that agents already receive in base prompts/references.
- Keep actionable checklists and constraints intact.

Risks:
- Losing workflow sequencing clarity.
- Mitigation: keep phase contracts and gate language verbatim; trim narrative, not rules.

### P4 - Auto-Injected Boilerplate (Conditional + Compression) (GO)

**Estimated impact:** Medium (small per-agent, broad fan-out to all agents)  
**Effort:** Low-Medium  
**Why fourth:** Memory/question sections are small individually but guaranteed overhead everywhere.

Approach:
- Shorten memory and question boilerplate language without changing required behavior.
- Add conditional injection where safe (memory section only when memory enabled/needed; question section only for agents that may ask user-facing questions).

Risks:
- Agents forget to use required interaction pattern.
- Mitigation: keep a concise mandatory rule line even in compressed form; validate with agent behavior tests.

### P5 - Tool Descriptions (GO, conservative)

**Estimated impact:** Low (~1% baseline) but global  
**Effort:** Low  
**Why still do it:** Easy win and universally applied, but should not consume disproportionate effort.

Approach:
- Conservative compression only (remove redundancy, keep action and constraints).
- Do not change tool schemas or behavior semantics.
- Treat as cleanup/efficiency pass rather than main savings driver.

Risks:
- Tool misuse if descriptions become ambiguous.
- Mitigation: enforce clarity floor and verify tool-selection behavior.

## Go / No-Go Matrix by Category

| Category | Recommendation | Why |
|---|---|---|
| Tools | **GO (Conservative)** | Low impact but low risk and global; quick pass only. |
| Agents | **GO (Aggressive but safe)** | Highest direct leverage on composed size for biggest agents. |
| References | **GO (Injected-first)** | Largest repeated payload; prioritize by frequency x size. |
| Auto-injected | **GO (Conditional + concise)** | Small per-agent, large aggregate fan-out; low-medium effort. |

## Wave 2-4 Execution Guidance

- **Wave 2 (Tools):** Keep scope strict and time-boxed; finish quickly unless unexpected regressions.
- **Wave 3 (Agents + Skills):** Primary optimization wave; allocate most review/verification budget here.
- **Wave 4 (References + Auto-injected):** Focus on high-frequency injected references, then conditional injection logic.

## Strategy Risks Summary

| Strategy | Risk Level | Main Failure Mode | Mitigation |
|---|---|---|---|
| Agent compression | High | Behavior/role drift | Preserve imperative constraints; role-by-role verification |
| Reference compression | Medium-High | Protocol inconsistency | Canonical source + dedupe with cross-reference |
| Skill compression | Medium | Loss of workflow clarity | Keep phase/gate checklist language intact |
| Auto-injected optimization | Medium | Missing required user interaction behavior | Keep minimal mandatory instruction; test user-facing agents |
| Tool description compression | Low-Medium | Ambiguous tool selection | Keep action verbs + constraints; verify tool behavior |
