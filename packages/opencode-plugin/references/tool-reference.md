# GoopSpec MCP Tool Reference

A complete, example-first cheat sheet for every GoopSpec MCP tool, and the single normative home of the house tool-description standard.

> **Companion document:** `references/core-protocol.md` explains *when and why* to batch independent tool calls in one turn. This document is the *what arguments exist* companion to that *when/why* guidance. Read the batching section there first, then use this reference to pick the most efficient arguments for each call.

## House Tool-Description Standard

This section is the **single normative definition** of how every GoopSpec tool description and argument description must be composed. The registry is fixed at exactly 38 tools (verified in `src/tools/index.test.ts` and `src/core/tools-v2.test.ts`; full audit in Field Note `fn_20260804_lnt7gk2b`). Other documents — `dispatch-patterns.md`, `AGENTS.md`, agent definitions — point here; they do not restate these rules.

### Named sections (top-level `description`)

Every tool `description` string is a single plaintext block with these named sections, in this order. Front-load the most important information; agents may not read the whole description.

| # | Section | Label | Presence | Content |
|---|---------|-------|----------|---------|
| 1 | Purpose | *(no label — opening sentence)* | **Mandatory** | `<VERB> <RESOURCE>. <WHAT it does>.` One concrete sentence, no jargon. |
| 2 | When to use | `WHEN TO USE:` | **Mandatory** | Exact situations that warrant the tool. 1-2 sentences. |
| 3 | When not to use | `WHEN NOT TO USE:` | **Mandatory** | Adjacent tools or cases, with explicit redirects (name the alternative tool). 1-2 sentences. |
| 4 | Modes | `MODES:` | **Mandatory when the tool has more than one mode**; omit for a single unconditional mode. | For each mutually exclusive mode: name exactly which arguments to send, which to omit, and which combinations are rejected. |
| 5 | Returns | `RETURNS:` | **Mandatory** | What the tool returns and a useful next action. |
| 6 | Caveats | `CAVEATS:` | **Mandatory when applicable** | Atomicity, side effects, defaults, precedence, conditional requirements, exclusions, empty-value behavior. |

Section labels are uppercase inline tags terminated by a colon (`WHEN TO USE:`, `WHEN NOT TO USE:`, `MODES:`, `RETURNS:`, `CAVEATS:`). The Purpose section has no label; it is the opening sentence. Sections are separated by single spaces or newlines within one continuous string.

### Length bounds

The bound that differs by allowlist membership is the ceiling, not the floor. Every description shares the same 120-character floor.

| Bound | Range | Applies to |
|-------|-------|------------|
| Normal | 120-700 characters | All tools not on the high-friction allowlist. |
| High-friction allowlist | 120-1200 characters | Tools on the high-friction allowlist. Allowlisting raises the ceiling from 700 to 1200 and never requires a description to exceed 700, so a concise allowlisted description anywhere in 120-700 still passes. |

**Allowlist criteria.** A tool qualifies for the allowlist when it has multiple mutually exclusive modes, conditional arguments, action-dependent required fields, or complex cross-field contracts whose mandatory content cannot fit in 700 characters. The allowlist is intentionally small to protect the prompt token budget. Qualifying earns headroom above 700; it does not obligate a description to use it, and padding a description past 700 just to "fill" the allowance defeats the token-budget goal and fails review.

**Allowlist storage location.** The allowlist is a TypeScript constant `HIGH_FRICTION_TOOLS: readonly string[]` in `packages/opencode-plugin/src/tools/index.test.ts`. It holds registered MCP tool names (e.g. `"goop_write_wave"`). Add a tool's name to the constant to exempt it from the 700-char upper bound; the conformance test enforces the 1200-char ceiling for allowlisted tools and the 700-char ceiling for all others. This constant is the single source of truth for allowlist membership — do not duplicate the list in this document.

### Argument descriptions

Every top-level and nested argument field — including fields inside nested objects and array item element objects — must end its Zod chain with `.describe()`. The description string covers:

1. **Shape and meaning** — what the value represents.
2. **Required or conditional status** — e.g., "Required for X; omit only for Y."
3. **Defaults** — where applicable.
4. **Allowed values** — where not already constrained by an enum.
5. **Sibling interactions** — e.g., "Cannot be supplied alongside `items[]`."
6. **Omission semantics** — for every optional argument that selects a mode: state **"omit this field entirely when not using this mode; do not pass an empty string."**

`.describe()` must be the **last method** in the Zod chain so that `z.toJSONSchema()` emits the metadata in the V2 JSON Schema. The codebase follows this convention (verified: every `.describe()` call is terminal; zero reversed chains). Preserve it.

### Cross-field contracts in prose

Express mutually exclusive modes, conditional requirements, and action-dependent arguments in **prose** within the top-level description and `.describe()` text. Do **not** use JSON Schema `oneOf`, `anyOf`, `allOf`, or `dependentRequired`. Multiple tool hosts do not reliably support these constructs (verified: zero instances in `src/tools/`).

### Enums for finite values

Use `tool.schema.enum(...)` for finite-value fields. Keep `.describe()` last so both the enum metadata and the description survive `z.toJSONSchema()` conversion.

### Corrective errors

Runtime errors for invalid argument combinations name the tool, the offending field or combination, valid usage, and the next action. The description and `.describe()` text must give the caller enough information to avoid the error on the first try.

### Friction reporting

Executors and wave verifiers own reporting tool friction. Every executor and verifier return must include a `FRICTION` section reporting every instance where a GoopSpec tool call failed, behaved unexpectedly, required a retry, or where a tool's schema or description misled the caller — including the exact argument involved and what the schema should have said. If no friction occurred, write "none". Incidents are logged to ADL and Field Notes and mapped to traced amendments through the deviation protocol. **This is the single authoritative statement of friction-reporting ownership; other documents point here.**

### Empty-string argument coalescing

Tool-call serialization in some hosts injects empty strings (`""`) into argument payloads the caller never authored — most often into status and mode-selecting fields, including inside nested `task_updates[]` entries. An empty string is never a legitimate value for those fields, but it arrives as a *present* value and defeats the caller's intent: a mode conflict the caller never created, an "invalid status" rejection, or `""` stored as a real value. This was confirmed in the field: rewriting descriptions to say "omit, do not pass an empty string" did not stop the next agent from failing the same way, because the empty string is injected below the level any description can reach.

At the single shared tool-input boundary (`createTools` in `src/tools/index.ts`, which both the V1 and V2 registration paths consume), an exact empty string is treated as absent (omitted) for every field where empty has no legitimate meaning, recursively through arrays and nested objects, before any tool logic runs. Only exact `""` is affected — `null`, `undefined`, `0`, `false`, `[]`, `{}`, and whitespace-only strings pass through untouched (a whitespace-only string may be intentional content). A non-empty value is never dropped.

A small, explicit set of **tool-field pairs** is exempt, because for those pairs an empty string is a documented, intentional operation and coalescing it would convert that operation into a silent no-op — the same failure class the boundary exists to eliminate. The policy lives in `EMPTY_STRING_LOAD_BEARING_FIELDS_BY_TOOL` in `packages/opencode-plugin/src/shared/coalesce.ts`; it is keyed by canonical tool name first, then field name:

| Field | Tools | Meaning of empty |
|-------|-------|------------------|
| `new_string` | `goop_write_db`, `goop_write_section`, `goop_save_note` | Delete the matched text. |
| `old_string` | `goop_write_db`, `goop_write_section`, `goop_save_note` | Activate patch mode on presence alone (documented in `shared/write-mode.ts`). |
| `pr_url` | `goop_write_wave` (top-level and `items[]`) | Clear the stored PR URL. |
| `pr_branch` | `goop_write_wave` (top-level and `items[]`) | Clear the stored PR branch. |
| `title` | `goop_write_wave` (top-level and `items[]`) | Clear the stored wave title (same overwrite-with-empty contract as `pr_url`/`pr_branch`). |

Tool scoping is deliberate: a field name alone never grants an exemption. For example, `title:""` is protected for `goop_write_wave` but coalesces to absent for `memory_save`, `goop_save_note`, and `goop_create_pr`. A new tool receives no exemption by default; add a tool-field pair only after confirming that empty is a documented, load-bearing operation and testing that behavior.

`content` is deliberately **not** exempt: an empty content has no legitimate meaning in a single-mode write, and exempting it would let an injected `content:""` silently destroy a document. Coalescing it to absent produces a loud `none`-mode error instead of a destructive wipe; in batch mode an empty `content` is already a neutral placeholder and is unaffected.

Callers should still omit fields they do not intend rather than rely on coalescing — the boundary exists to neutralize injected artifacts a caller cannot prevent, not to license passing empty strings deliberately.

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
| `goop_write_db` | `doc_type`, `content?`, `mode?: "replace" \| "append"`, `old_string?`, `new_string?`, `replace_all?`, `workflow_id?`, `items?: {doc_type, content?, mode?, old_string?, new_string?, replace_all?}[]` | `goop_write_db({ doc_type: "chronicle", content: "### 2026-07-16\n\nWave 9 complete." })` |
| `goop_read_section` | `doc_type`, `section_key?`, `section_keys?: string[]`, `workflow_id?` | `goop_read_section({ doc_type: "spec", section_keys: ["vision", "must-haves"] })` |
| `goop_write_section` | `action?: "write" \| "delete"`, `doc_type`, `section_key`, `content?`, `position?`, `old_string?`, `new_string?`, `replace_all?`, `workflow_id?`, `items?: {doc_type, section_key, content?, position?, old_string?, new_string?, replace_all?}[]` | `goop_write_section({ action: "delete", doc_type: "spec", section_key: "risks" })` |
| `goop_append_chronicle` | `entry?`, `workflow_id?`, `entries?: string[]`, `alsoLogAdl?: {type, rule?, description, entry_action?, files?}`, `alsoSaveMemory?: {title, content, type?, importance?, concepts?}` | `goop_append_chronicle({ entry: "Wave 2 passed.", alsoLogAdl: { type: "observation", description: "Wave 2 verification complete", entry_action: "Logged" } })` |
| `goop_search_docs` | `query`, `workflow_id?`, `workflow_ids?: string[]`, `doc_type?`, `doc_types?: string[]`, `section_key?`, `section_keys?: string[]`, `since?`, `until?`, `limit?` | `goop_search_docs({ query: "batch guidance", doc_types: ["spec", "blueprint"], limit: 10 })` |
| `goop_boot` | `workflow_id?`, `doc_types?: string[]` (no default — opt-in only; pass explicitly to load documents; wave context via `goop_read_wave` separately), `include_state?`, `note_query?`, `note_tags?`, `note_limit?`, `note_full?`, `memory_query?`, `memory_limit?`, `memory_types?`, `memory_concepts?`, `memory_min_importance?`, `references?: string[]`, `reference_section?` | `goop_boot({ doc_types: ["spec", "chronicle"], note_query: "token efficiency", references: ["core-protocol"] })` |

**Behavioral notes:** `goop_write_db` clears all `doc_sections` for that doc before writing, so monolithic writes always win. `goop_write_section` auto-migrates existing monolithic content into a `_migrated-legacy-content` section on the first sectioned write, preventing silent shadowing. `goop_write_section` delete mode is single-section only; `items` is write-only.

`goop_boot` replaces the 4-5-call agent boot sequence (read docs + search notes + search memory + load references) with a single call. Documents are loaded only when `doc_types` is explicitly passed; there is no default document set. Wave/task context is not included; fetch it with `goop_read_wave` when needed. Granular tools remain available and unchanged.

`goop_append_chronicle`'s `alsoLogAdl`/`alsoSaveMemory` replace separate `goop_adl`/`memory_save` calls when logging alongside a chronicle entry. Cross-store atomicity is unavailable — writes are best-effort sequential with partial-failure reporting. Not available in `entries` batch mode.

## Wave and tracking tools

| Tool | Arguments | Example |
|---|---|---|
| `goop_write_wave` | `wave_number`, `title?`, `status?`, `pr_branch?`, `pr_url?`, `tasks?: {task_index, description?, agent?, status?}[]`, `task_update?: {task_index, status}`, `task_updates?: {task_index, status}[]`, `workflow_id?`, `items?: {wave_number, title?, status?, pr_branch?, pr_url?, tasks?}[]`, `verifications?: {check_name, status, detail?, wave_id?}[]`, `traceability?: {requirement_key, wave_number?, task_index?, status?}[]` | `goop_write_wave({ wave_number: 2, task_updates: [{ task_index: 1, status: "complete" }, { task_index: 2, status: "complete" }], verifications: [{ check_name: "typecheck", status: "pass" }] })` |
| `goop_read_wave` | `workflow_id?`, `wave_numbers?: number[]` | `goop_read_wave({ wave_numbers: [1, 2] })` |
| `goop_query_decisions` | `rule?`, `rules?: number[]`, `type?`, `types?: string[]`, `workflow_id?`, `limit?` | `goop_query_decisions({ rules: [2, 3], types: ["deviation", "observation"], limit: 20 })` |
| `goop_blocker` | `action: "open" \| "resolve" \| "list"`, `description?`, `severity?`, `wave_id?`, `id?`, `resolution?`, `status?`, `workflow_id?`, `items?: {action, description?, severity?, wave_id?, id?, resolution?, status?, workflow_id?}[]` | `goop_blocker({ action: "open", description: "CI token expired", severity: "high", wave_id: 2 })` |
| `goop_acceptance_audit` | `workflow_id?`, `wave_ids?: number[]`, `include_all_blockers?: boolean` | `goop_acceptance_audit({ wave_ids: [1, 2], include_all_blockers: true })` |

`goop_write_wave`'s `verifications`/`traceability` fields replace the retired standalone `goop_record_verification` and `goop_write_traceability` tools — their behavior is fully absorbed as inline args. Available alongside `task_updates` (processed atomically in one transaction; if any task update fails, verifications and traceability are rolled back too). Not available alongside `items` batch mode.

`goop_acceptance_audit` replaces the retired `goop_read_verifications` and `goop_read_waves` tools at the accept gate, plus blockers. Returns combined `{blockers, verifications, waves}` in a JSON comment.

## Project view tools

| Tool | Arguments | Example |
|---|---|---|
| `goop_timeline` | `workflow_id?`, `limit?` | `goop_timeline({ workflow_id: "goopspec-orchestration-upgrade", limit: 50 })` |
| `goop_dashboard` | `workflow_id?` | `goop_dashboard({})` |

## Field Note tools

| Tool | Arguments | Example |
|---|---|---|
| `goop_save_note` | `title`, `body`, `tags`, `source_agent`, `importance?`, `note_id?`, `old_string?`, `new_string?`, `replace_all?`, `workflow_id?`, `project_id?`, `items?: {title, body, tags, source_agent, importance?, note_id?, old_string?, new_string?, replace_all?, workflow_id?, project_id?}[]` | `goop_save_note({ title: "SQLite FTS5 tokenization", body: "...", tags: ["sqlite", "fts5"], source_agent: "goop-researcher", importance: 8 })` |
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

**`update-wave` semantics:** `currentWave` is the wave currently in progress, numbered from 1; `0` means no wave has started. `totalWaves` is the configured number of waves. `update-wave` does not count completed waves; completion is recorded in `waves` and `wave_tasks`.

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

## Image generation tools

| Tool | Arguments | Example |
|------|-----------|---------|
| `generate_image` | `prompt` (required), `out`, `images[]`, `model`, `size`, `quality`, `outputFormat`, `background`, `count`, `inputFidelity`, `timeout`, `dryRun`, `authFile`, `action`, `moderation`, `outputCompression`, `detail`, `mask`, `allowRefresh` | `generate_image({ prompt: "A serene mountain landscape at sunset", out: "docs/hero.png", count: 2 })` |

Generates images using the user's existing ChatGPT subscription OAuth credentials — no API key required. Images default to `.goopspec/generated-images/`; pass an explicit `out` path to place an asset elsewhere. For prompting technique, see `goop_reference({ name: "image-prompting" })`.

## Combinator tools (added 2026-07)

The following tools and extended arguments reduce multi-call sequences to single calls. The 4 granular tools they supersede (`goop_record_verification`, `goop_write_traceability`, `goop_read_verifications`, `goop_read_waves`) have been retired — their behavior is fully absorbed into the combinators below.

| Pattern | Replaces | How |
|---------|----------|------|
| `goop_boot` | 4-5-call agent boot (read docs + search notes + search memory + load references) | Single call returns all requested blocks. Documents require explicit `doc_types` — no default. Wave context is fetched separately via `goop_read_wave`. |
| `goop_write_wave` + `verifications`/`traceability` | Retired `goop_record_verification`/`goop_write_traceability` | Side-payloads run sequentially inside the same `execute()`. Available alongside `task_updates` (atomic transaction); not available in `items` batch mode. |
| `goop_infer_intent` + `autoApply` | Manual infer-then-act two-call flow for `create-workflow`/`transition` | Opt-in (`autoApply: true`), confidence-gated (threshold `0.9`, minimum `0.85`), non-destructive-only. Returns `mutation` in result. |
| `goop_append_chronicle` + `alsoLogAdl`/`alsoSaveMemory` | Separate `goop_adl`/`memory_save` calls alongside a chronicle entry | Best-effort sequential writes with partial-failure reporting. Not available in `entries` batch mode. |
| `goop_acceptance_audit` | Retired `goop_read_verifications`/`goop_read_waves` + blockers at the accept gate | Single read-only call returns combined `{blockers, verifications, waves}`. |

---

*Tool Reference v1.1 — GoopSpec Reference*
