# GoopSpec MCP Tool Reference

A complete, example-first cheat sheet for every GoopSpec MCP tool.

> **Companion document:** `references/core-protocol.md` explains *when and why* to batch independent tool calls in one turn. This document is the *what arguments exist* companion to that *when/why* guidance. Read the batching section there first, then use this reference to pick the most efficient arguments for each call.

## Batching cheat sheet

The fastest mental model is: if the tool has a plural/batch argument (`doc_types`, `wave_numbers`, `section_keys`, `items`, `entries`, `task_updates`), use it. Preferring batch/plural forms over repeated single calls is the single biggest tool-call efficiency win available.

| If you need to... | Don't do this... | Do this instead |
|---|---|---|
| Read 3 workflow docs | 3 separate `goop_read_db` calls | `goop_read_db({ doc_types: ["spec", "blueprint", "chronicle"] })` |
| Read 3 waves | 3 separate `goop_read_waves` calls | `goop_read_waves({ wave_numbers: [1, 2, 3] })` |
| Read 3 sections | 3 separate `goop_read_section` calls | `goop_read_section({ doc_type: "spec", section_keys: ["vision", "scope", "risks"] })` |
| Write 3 docs | 3 separate `goop_write_db` calls | `goop_write_db({ items: [...] })` |
| Write 3 sections | 3 separate `goop_write_section` calls | `goop_write_section({ items: [...] })` |
| Append 3 chronicle entries | 3 separate `goop_append_chronicle` calls | `goop_append_chronicle({ entries: [...] })` |
| Save 3 field notes | 3 separate `goop_save_note` calls | `goop_save_note({ items: [...] })` |
| Update 3 task statuses | 3 separate `goop_write_wave` calls | `goop_write_wave({ wave_number: 1, task_updates: [...] })` |
| Record 3 verifications | 3 separate `goop_record_verification` calls | `goop_record_verification({ items: [...] })` |
| Open 3 blockers | 3 separate `goop_blocker` calls | `goop_blocker({ items: [...] })` |
| Read verifications for 3 waves | 3 separate `goop_read_verifications` calls | `goop_read_verifications({ wave_ids: [1, 2, 3] })` |

## Document tools

| Tool | Arguments | Example |
|---|---|---|
| `goop_read_db` | `doc_type?`, `doc_types?: string[]`, `workflow_id?` | `goop_read_db({ doc_types: ["spec", "blueprint", "chronicle"] })` |
| `goop_write_db` | `doc_type`, `content`, `mode?: "replace" \| "append"`, `workflow_id?`, `items?: {doc_type, content, mode?}[]` | `goop_write_db({ doc_type: "chronicle", content: "### 2026-07-16\n\nWave 9 complete." })` |
| `goop_read_section` | `doc_type`, `section_key?`, `section_keys?: string[]`, `workflow_id?` | `goop_read_section({ doc_type: "spec", section_keys: ["vision", "must-haves"] })` |
| `goop_write_section` | `action?: "write" \| "delete"`, `doc_type`, `section_key`, `content?`, `position?`, `workflow_id?`, `items?: {doc_type, section_key, content, position?}[]` | `goop_write_section({ action: "delete", doc_type: "spec", section_key: "risks" })` |
| `goop_append_chronicle` | `entry?`, `workflow_id?`, `entries?: string[]` | `goop_append_chronicle({ entries: ["Wave 2 passed.", "Opened PR."] })` |
| `goop_search_docs` | `query`, `workflow_id?`, `workflow_ids?: string[]`, `doc_type?`, `doc_types?: string[]`, `section_key?`, `section_keys?: string[]`, `since?`, `until?`, `limit?` | `goop_search_docs({ query: "batch guidance", doc_types: ["spec", "blueprint"], limit: 10 })` |

**Behavioral notes:** `goop_write_db` clears all `doc_sections` for that doc before writing, so monolithic writes always win. `goop_write_section` auto-migrates existing monolithic content into a `_migrated-legacy-content` section on the first sectioned write, preventing silent shadowing. `goop_write_section` delete mode is single-section only; `items` is write-only.

## Wave and tracking tools

| Tool | Arguments | Example |
|---|---|---|
| `goop_write_wave` | `wave_number`, `title?`, `status?`, `pr_branch?`, `pr_url?`, `tasks?: {task_index, description?, agent?, status?}[]`, `task_update?: {task_index, status}`, `task_updates?: {task_index, status}[]`, `workflow_id?`, `items?: {wave_number, title?, status?, pr_branch?, pr_url?, tasks?}[]` | `goop_write_wave({ wave_number: 2, task_updates: [{ task_index: 1, status: "complete" }, { task_index: 2, status: "complete" }] })` |
| `goop_read_waves` | `wave_number?`, `wave_numbers?: number[]`, `status?`, `workflow_id?` | `goop_read_waves({ wave_numbers: [1, 2, 3] })` |
| `goop_write_traceability` | `requirement_key`, `wave_number?`, `task_index?`, `status?`, `workflow_id?`, `items?: {requirement_key, wave_number?, task_index?, status?}[]` | `goop_write_traceability({ requirement_key: "MH2", wave_number: 2, task_index: 1, status: "covered" })` |
| `goop_query_decisions` | `rule?`, `rules?: number[]`, `type?`, `types?: string[]`, `workflow_id?`, `limit?` | `goop_query_decisions({ rules: [2, 3], types: ["deviation", "observation"], limit: 20 })` |
| `goop_record_verification` | `check_name: "typecheck" \| "test" \| "lint" \| "custom"`, `status: "pass" \| "fail" \| "skip"`, `wave_id?`, `detail?`, `workflow_id?`, `items?: {check_name, status, wave_id?, detail?, workflow_id?}[]` | `goop_record_verification({ items: [{ check_name: "typecheck", status: "pass", wave_id: 2 }, { check_name: "test", status: "pass", wave_id: 2 }] })` |
| `goop_read_verifications` | `wave_id?`, `wave_ids?: number[]`, `workflow_id?` | `goop_read_verifications({ wave_ids: [1, 2, 3] })` |
| `goop_blocker` | `action: "open" \| "resolve" \| "list"`, `description?`, `severity?`, `wave_id?`, `id?`, `resolution?`, `status?`, `workflow_id?`, `items?: {action, description?, severity?, wave_id?, id?, resolution?, status?, workflow_id?}[]` | `goop_blocker({ action: "open", description: "CI token expired", severity: "high", wave_id: 2 })` |

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

## State and workflow tools

| Tool | Arguments | Example |
|---|---|---|
| `goop_state` | `action`, `phase?`, `mode?`, `depth?`, `autopilot?`, `lazy?`, `currentWave?`, `totalWaves?`, `workflowId?`, `force?`, `activate?` | `goop_state({ action: "create-workflow", workflowId: "my-feature", activate: true })` |
| `goop_status` | `verbose?` | `goop_status({ verbose: true })` |
| `goop_checkpoint` | `action: "save" \| "load" \| "list"`, `id?`, `context?` | `goop_checkpoint({ action: "save", id: "before-refactor", context: { branch: "feat/tool-reference" } })` |
| `goop_setup` | `action`, `projectName?`, `defaultModel?`, `agentModels?`, `memoryEnabled?`, `gitignoreGoopspec?`, `preserveData?`, `confirmed?`, `scope?` | `goop_setup({ action: "verify" })` |
| `goop_spec` | `action: "read" \| "list" \| "validate"`, `file?: "spec" \| "plan" \| "both"`, `phase?` | `goop_spec({ action: "validate" })` |

**State actions:** `get`, `transition`, `complete-interview`/`reset-interview`, `lock-spec`/`unlock-spec`, `confirm-acceptance`/`reset-acceptance`, `set-mode`, `set-depth`, `set-autopilot`, `update-wave`, `reset`, `list-workflows`, `set-active-workflow`, `create-workflow`. `create-workflow` with `activate: true` collapses create + switch into one call.

## Memory tools

| Tool | Arguments | Example |
|---|---|---|
| `memory_save` | `title`, `content`, `type?: "observation" \| "decision" \| "note" \| "todo"`, `concepts?`, `facts?`, `importance?`, `sourceFiles?`, `reasoning?`, `alternatives?` | `memory_save({ title: "bun:sqlite FTS5 requires explicit tokenizer", content: "...", type: "observation", concepts: ["bun", "sqlite", "fts5"], importance: 8 })` |
| `memory_search` | `query`, `limit?`, `types?: string[]`, `concepts?: string[]`, `minImportance?` | `memory_search({ query: "SQLite FTS5", concepts: ["sqlite", "fts5"], limit: 10 })` |
| `memory_forget` | `id?`, `query?`, `confirm?` | `memory_forget({ id: 42 })` |

## Reference and command tools

| Tool | Arguments | Example |
|---|---|---|
| `goop_reference` | `name?`, `names?: string[]`, `type?: "reference" \| "template"`, `list?`, `section?` | `goop_reference({ names: ["core-protocol", "git-workflow", "field-notes-protocol"] })` |
| `slashcommand` | `command` | `slashcommand({ command: "/goop-execute" })` |

## Utility tools

| Tool | Arguments | Example |
|---|---|---|
| `goop_adl` | `action: "read" \| "append"`, `type?`, `description?`, `entry_action?`, `rule?`, `files?` | `goop_adl({ action: "append", type: "deviation", description: "Bypassed code-review gate", entry_action: "Escalated to user", rule: 4, files: ["src/auth.ts"] })` |
| `goop_get_global_config` | none | `goop_get_global_config({})` |
| `goop_create_pr` | `title`, `body`, `branch`, `base?: "main"`, `draft?` | `goop_create_pr({ title: "fix(db): prevent section shadowing", body: "...", branch: "feat/section-tool-hardening", base: "main" })` |
| `goop_infer_intent` | `transcript`, `workflowPhase?`, `hasActiveWorkflow?` | `goop_infer_intent({ transcript: "create a plan for the auth refactor", hasActiveWorkflow: false })` |

---

*Tool Reference v1.0 — GoopSpec Reference*
