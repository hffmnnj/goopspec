# GoopSpec MCP Tool Reference

A complete, example-first cheat sheet for every GoopSpec MCP tool.

> **Companion document:** `references/core-protocol.md` explains *when and why* to batch independent tool calls in one turn. This document is the *what arguments exist* companion to that *when/why* guidance. Read the batching section there first, then use this reference to pick the most efficient arguments for each call.

## Batching cheat sheet

The fastest mental model is: if the tool has a plural/batch argument (`doc_types`, `wave_numbers`, `section_keys`, `items`, `entries`, `task_updates`), use it. Preferring batch/plural forms over repeated single calls is the single biggest tool-call efficiency win available.

| If you need to... | Don't do this... | Do this instead |
|---|---|---|
| Read 3 workflow docs | 3 separate `goop_read_db` calls | `goop_read_db({ doc_types: ["spec", "blueprint", "chronicle"] })` |
| Write 3 docs | 3 separate `goop_write_db` calls | `goop_write_db({ items: [...] })` |
| Write 3 sections | 3 separate `goop_write_section` calls | `goop_write_section({ items: [...] })` |
| Append 3 chronicle entries | 3 separate `goop_append_chronicle` calls | `goop_append_chronicle({ entries: [...] })` |
| Save 3 field notes | 3 separate `goop_save_note` calls | `goop_save_note({ items: [...] })` |
| Update 3 task statuses | 3 separate `goop_write_wave` calls | `goop_write_wave({ wave_number: 1, task_updates: [...] })` |
| Open 3 blockers | 3 separate `goop_blocker` calls | `goop_blocker({ items: [...] })` |

## Document tools

| Tool | Arguments | Example |
|---|---|---|
| `goop_read_db` | `doc_type?`, `doc_types?: string[]`, `workflow_id?` | `goop_read_db({ doc_types: ["spec", "blueprint", "chronicle"] })` |
| `goop_write_db` | `doc_type`, `content`, `mode?: "replace" \| "append"`, `workflow_id?`, `items?: {doc_type, content, mode?}[]` | `goop_write_db({ doc_type: "chronicle", content: "### 2026-07-16\n\nWave 9 complete." })` |
| `goop_read_section` | `doc_type`, `section_key?`, `section_keys?: string[]`, `workflow_id?` | `goop_read_section({ doc_type: "spec", section_keys: ["vision", "must-haves"] })` |
| `goop_write_section` | `action?: "write" \| "delete"`, `doc_type`, `section_key`, `content?`, `position?`, `workflow_id?`, `items?: {doc_type, section_key, content, position?}[]` | `goop_write_section({ action: "delete", doc_type: "spec", section_key: "risks" })` |
| `goop_append_chronicle` | `entry?`, `workflow_id?`, `entries?: string[]`, `alsoLogAdl?: {type, rule?, description, entry_action?, files?}`, `alsoSaveMemory?: {title, content, type?, importance?, concepts?}` | `goop_append_chronicle({ entry: "Wave 2 passed.", alsoLogAdl: { type: "observation", description: "Wave 2 verification complete", entry_action: "Logged" } })` |
| `goop_search_docs` | `query`, `workflow_id?`, `workflow_ids?: string[]`, `doc_type?`, `doc_types?: string[]`, `section_key?`, `section_keys?: string[]`, `since?`, `until?`, `limit?` | `goop_search_docs({ query: "batch guidance", doc_types: ["spec", "blueprint"], limit: 10 })` |
| `goop_boot` | `workflow_id?`, `doc_types?: string[]` (default `["spec","blueprint"]`), `include_state?`, `note_query?`, `note_tags?`, `note_limit?`, `note_full?`, `memory_query?`, `memory_limit?`, `memory_types?`, `memory_concepts?`, `memory_min_importance?`, `references?: string[]`, `reference_section?` | `goop_boot({ doc_types: ["spec", "blueprint", "chronicle"], note_query: "token efficiency", references: ["core-protocol"] })` |

**Behavioral notes:** `goop_write_db` clears all `doc_sections` for that doc before writing, so monolithic writes always win. `goop_write_section` auto-migrates existing monolithic content into a `_migrated-legacy-content` section on the first sectioned write, preventing silent shadowing. `goop_write_section` delete mode is single-section only; `items` is write-only.

`goop_boot` replaces the 4-5-call agent boot sequence (read docs + search notes + search memory + load references) with a single call. Granular tools remain available and unchanged.

`goop_append_chronicle`'s `alsoLogAdl`/`alsoSaveMemory` replace separate `goop_adl`/`memory_save` calls when logging alongside a chronicle entry. Cross-store atomicity is unavailable — writes are best-effort sequential with partial-failure reporting. Not available in `entries` batch mode.

## Wave and tracking tools

| Tool | Arguments | Example |
|---|---|---|
| `goop_write_wave` | `wave_number`, `title?`, `status?`, `pr_branch?`, `pr_url?`, `tasks?: {task_index, description?, agent?, status?}[]`, `task_update?: {task_index, status}`, `task_updates?: {task_index, status}[]`, `workflow_id?`, `items?: {wave_number, title?, status?, pr_branch?, pr_url?, tasks?}[]`, `verifications?: {check_name, status, detail?, wave_id?}[]`, `traceability?: {requirement_key, wave_number?, task_index?, status?}[]` | `goop_write_wave({ wave_number: 2, task_updates: [{ task_index: 1, status: "complete" }, { task_index: 2, status: "complete" }], verifications: [{ check_name: "typecheck", status: "pass" }] })` |
| `goop_read_wave` | `workflow_id?`, `wave_numbers?: number[]` | `goop_read_wave({ wave_numbers: [1, 2] })` |
| `goop_query_decisions` | `rule?`, `rules?: number[]`, `type?`, `types?: string[]`, `workflow_id?`, `limit?` | `goop_query_decisions({ rules: [2, 3], types: ["deviation", "observation"], limit: 20 })` |
| `goop_blocker` | `action: "open" \| "resolve" \| "list"`, `description?`, `severity?`, `wave_id?`, `id?`, `resolution?`, `status?`, `workflow_id?`, `items?: {action, description?, severity?, wave_id?, id?, resolution?, status?, workflow_id?}[]` | `goop_blocker({ action: "open", description: "CI token expired", severity: "high", wave_id: 2 })` |
| `goop_acceptance_audit` | `workflow_id?`, `wave_ids?: number[]`, `include_all_blockers?: boolean` | `goop_acceptance_audit({ wave_ids: [1, 2], include_all_blockers: true })` |

`goop_write_wave`'s `verifications`/`traceability` fields replace the retired standalone `goop_record_verification` and `goop_write_traceability` tools — their behavior is fully absorbed as inline args. Not available alongside `items` or `task_updates` batch modes.

`goop_acceptance_audit` replaces the retired `goop_read_verifications` and `goop_read_waves` tools at the accept gate, plus blockers. Returns combined `{blockers, verifications, waves}` in a JSON comment.

## Project view tools

| Tool | Arguments | Example |
|---|---|---|
| `goop_timeline` | `workflow_id?`, `limit?` | `goop_timeline({ workflow_id: "goopspec-orchestration-upgrade", limit: 50 })` |
| `goop_dashboard` | `workflow_id?` | `goop_dashboard({})` |

## Field Note tools

| Tool | Arguments | Example |
|---|---|---|
| `goop_save_note` | `title`, `body`, `tags`, `source_agent`, `importance?`, `workflow_id?`, `project_id?`, `items?: {title, body, tags, source_agent, importance?, workflow_id?, project_id?}[]` | `goop_save_note({ title: "SQLite FTS5 tokenization", body: "...", tags: ["sqlite", "fts5"], source_agent: "goop-researcher", importance: 8 })` |
| `goop_search_notes` | `query?`, `tags?`, `project_id?`, `workflow_id?`, `limit?`, `full?`, `body_offset?`, `body_limit?`, `note_id?` | `goop_search_notes({ note_id: "fn_20260716_0v28qlej" })` |

**Behavioral note:** `note_id` bypasses search and returns the full body; when you already have the ID from a snippet, prefer `note_id` over narrowing queries. Use `full: true` to retrieve full bodies via a normal search.

**Body control examples:**
- `goop_search_notes({ query: "sqlite" })` — returns 200-char snippets
- `goop_search_notes({ query: "sqlite", full: true })` — returns full bodies
- `goop_search_notes({ query: "sqlite", body_offset: 0, body_limit: 500 })` — returns first 500 chars
- `goop_search_notes({ note_id: "fn_20260716_abc123" })` — exact fetch, always full body
- `goop_search_notes({ note_id: "fn_20260716_abc123", query: "ignored" })` — `note_id` takes precedence

## State and workflow tools

| Tool | Arguments | Example |
|---|---|---|
| `goop_state` | `action`, `phase?`, `mode?`, `depth?`, `autopilot?`, `lazy?`, `currentWave?`, `totalWaves?`, `workflowId?`, `force?`, `activate?` | `goop_state({ action: "create-workflow", workflowId: "my-feature", activate: true })` |
| `goop_status` | `verbose?` | `goop_status({ verbose: true })` |
| `goop_checkpoint` | `action: "save" \| "load" \| "list"`, `id?`, `context?` | `goop_checkpoint({ action: "save", id: "before-refactor", context: { branch: "feat/tool-reference" } })` |
| `goop_setup` | `action`, `projectName?`, `defaultModel?`, `agentModels?`, `memoryEnabled?`, `gitignoreGoopspec?`, `preserveData?`, `confirmed?`, `scope?` | `goop_setup({ action: "verify" })` |
| `goop_spec` | `action: "read" \| "list" \| "validate"`, `file?: "spec" \| "plan" \| "both"`, `phase?` | `goop_spec({ action: "validate" })` |
| `goop_infer_intent` | `transcript`, `workflowPhase?`, `hasActiveWorkflow?`, `autoApply?`, `confidenceThreshold?` | `goop_infer_intent({ transcript: "create a plan for the auth refactor", hasActiveWorkflow: false })` |

**State actions:** `get`, `transition`, `complete-interview`/`reset-interview`, `lock-spec`/`unlock-spec`, `confirm-acceptance`/`reset-acceptance`, `set-mode`, `set-depth`, `set-autopilot`, `update-wave`, `reset`, `list-workflows`, `set-active-workflow`, `create-workflow`. `create-workflow` with `activate: true` collapses create + switch into one call.

**Setup actions:** `detect` (inspect project), `init`/`plan`/`apply` (create `.goopspec` structure), `models` (view/configure per-role model routing), `verify` (health check), `status` (show config), `reset` (reset to defaults).

`goop_infer_intent`'s `autoApply` (opt-in, default `false`) replaces a manual infer-then-act two-call flow for `create-workflow`/`transition`. When `autoApply: true` and confidence exceeds `confidenceThreshold` (default `0.9`, minimum `0.85`), non-destructive mutations are applied server-side. Returns `mutation: {applied, action, result|error}` in the JSON payload. Granular tools remain available and unchanged.

## Memory tools

| Tool | Arguments | Example |
|---|---|---|
| `memory_save` | `title`, `content`, `type?: "observation" \| "decision" \| "note" \| "todo"`, `concepts?`, `facts?`, `importance?`, `sourceFiles?`, `reasoning?`, `alternatives?`, `deduplicate?: boolean` | `memory_save({ title: "bun:sqlite FTS5 requires explicit tokenizer", content: "...", type: "observation", concepts: ["bun", "sqlite", "fts5"], importance: 8 })` |
| `memory_search` | `query`, `limit?`, `types?: string[]`, `concepts?: string[]`, `minImportance?`, `includeFieldNotes?: boolean` | `memory_search({ query: "SQLite FTS5", concepts: ["sqlite", "fts5"], limit: 10 })` |
| `memory_forget` | `id?`, `query?`, `confirm?` | `memory_forget({ id: 42 })` |

**`memory_save.deduplicate`** (default `false`) — opt in to near-duplicate consolidation before inserting. When `true`, the manager runs an FTS5 similarity query against the combined `title` + stored `content` tokens. If the best candidate scores ≥ 0.85 (bounded token-F1 over the same normalized tokens used for search), the new insert is skipped and the existing row is reinforced: its `importance` becomes `MAX(existing, new)`, its `created_at` is refreshed, and the existing content is returned. No row is deleted. When `false` or absent, behavior is byte-identical to before.

**`memory_search.includeFieldNotes`** (default `false`) — opt in to cross-store search. When `true`, `memory_search` queries `memory.db` and Field Notes in parallel, then fuses the two ranked lists with reciprocal-rank fusion (RRF, `k=60`). Each returned result is tagged with its origin store:

- **Memory results** — `origin: "memory"`, a normalized RRF score, and the usual `MemoryEntry` fields (`id`, `type`, `title`, `content`, `facts`, `concepts`, `importance`, `sourceFiles`, `createdAt`).
- **Field Note results** — `origin: "field_note"`, a normalized RRF score, and the curated note fields (`id`, `title`, `body`, `tags`, `source_agent`, `importance`, `workflow_id`, `project_id`, `created_at`).

When `false` or absent, only `memory.db` results are returned, identical to the prior contract.

**Scoring notes:** The underlying memory ranking is now multi-signal: FTS5 BM25 (`title=10, content=5, facts=2, concepts=2`) is multiplied by `(importance / 10)` and a recency-decay factor `EXP(-0.001 * (unixepoch() - created_at) / 86400)` (~693-day / ~1.9-year half-life; `ln(2)/0.001 ≈ 693`), then further boosted by concept/fact overlap (`0.7 + 0.3 * conceptBoost`). This is all internal to `memory.db`; Field Notes enter the fused result through RRF rank, not their raw native score.

## Reference and command tools

| Tool | Arguments | Example |
|---|---|---|
| `goop_reference` | `name?`, `names?: string[]`, `type?: "reference" \| "template"`, `list?`, `section?` | `goop_reference({ names: ["core-protocol", "git-workflow", "field-notes-protocol"] })` |
| `slashcommand` | `command` | `slashcommand({ command: "/goop-execute" })` |

**Usage examples:**
- `goop_reference({ name: "executor-core" })` — Load a single reference
- `goop_reference({ names: ["core-protocol", "git-workflow"] })` — Load multiple references
- `goop_reference({ list: true })` — List available references
- `goop_reference({ type: "template" })` — Filter by type
- `goop_reference({ name: "core-protocol", section: "Commit Format" })` — Extract a specific section

## Utility tools

| Tool | Arguments | Example |
|---|---|---|
| `goop_adl` | `action: "read" \| "append"`, `type?`, `description?`, `entry_action?`, `rule?`, `files?` | `goop_adl({ action: "append", type: "deviation", description: "Bypassed code-review gate", entry_action: "Escalated to user", rule: 4, files: ["src/auth.ts"] })` |
| `goop_get_global_config` | none | `goop_get_global_config({})` |
| `goop_create_pr` | `title`, `body`, `branch`, `base?: "main"`, `draft?` | `goop_create_pr({ title: "fix(db): prevent section shadowing", body: "...", branch: "feat/section-tool-hardening", base: "main" })` |

**Behavioral note:** `goop_create_pr` includes a mandatory GoopSpec terminology gate — it scans the title, body, and branch for internal terms and blocks creation on violations. The title, body, and branch must contain no GoopSpec internal terms (e.g., "goop_", "MH1", "wave_number").

## Combinator tools (added 2026-07)

The following tools and extended arguments reduce multi-call sequences to single calls. The 4 granular tools they supersede (`goop_record_verification`, `goop_write_traceability`, `goop_read_verifications`, `goop_read_waves`) have been retired — their behavior is fully absorbed into the combinators below.

| Pattern | Replaces | How |
|---------|----------|------|
| `goop_boot` | 4-5-call agent boot (read docs + search notes + search memory + load references) | Single call returns all requested blocks. Defaults to `["spec", "blueprint"]` docs. |
| `goop_write_wave` + `verifications`/`traceability` | Retired `goop_record_verification`/`goop_write_traceability` | Side-payloads run sequentially inside the same `execute()`. Not available in `items`/`task_updates` batch modes. |
| `goop_infer_intent` + `autoApply` | Manual infer-then-act two-call flow for `create-workflow`/`transition` | Opt-in (`autoApply: true`), confidence-gated (threshold `0.9`, minimum `0.85`), non-destructive-only. Returns `mutation` in result. |
| `goop_append_chronicle` + `alsoLogAdl`/`alsoSaveMemory` | Separate `goop_adl`/`memory_save` calls alongside a chronicle entry | Best-effort sequential writes with partial-failure reporting. Not available in `entries` batch mode. |
| `goop_acceptance_audit` | Retired `goop_read_verifications`/`goop_read_waves` + blockers at the accept gate | Single read-only call returns combined `{blockers, verifications, waves}`. |

---

*Tool Reference v1.1 — GoopSpec Reference*
