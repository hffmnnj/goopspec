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

### `goop_read_db`

Read a workflow document or batch-load several documents in one call.

**Args:**

| Name | Type | Required | Default | Notes |
|---|---|---|---|---|
| `doc_type` | `string` | optional (single mode) | — | One of `spec`, `blueprint`, `chronicle`, `adl`, `handoff`, `requirements`, `research` |
| `doc_types` | `string[]` | optional (batch mode) | — | Read multiple docs at once |
| `workflow_id` | `string` | optional | active workflow | Override target workflow |

**Example:**

```json
goop_read_db({ doc_types: ["spec", "blueprint", "chronicle"] })
```

**Batch guidance:** Always use `doc_types` when reading the spec and blueprint together, or any other multi-document boot sequence. `goop_read_db({ doc_types: ["spec", "blueprint"] })` is one call instead of two.

---

### `goop_write_db`

Write or update a workflow document as monolithic content. Renders the sidecar markdown file automatically.

**Args:**

| Name | Type | Required | Default | Notes |
|---|---|---|---|---|
| `doc_type` | `string` | required (single mode) | — | Target document type |
| `content` | `string` | required (single mode) | — | Markdown body |
| `mode` | `"replace" \| "append"` | optional | `"replace"` | Append concatenates to existing content |
| `workflow_id` | `string` | optional | active workflow | Override target workflow |
| `items` | `{ doc_type, content, mode? }[]` | optional (batch mode) | — | Batch multiple document writes |

**Behavioral note:** `goop_write_db` now clears any existing `doc_sections` rows for the same `(workflow_id, doc_type)` before writing monolithic content. A monolithic write always wins and cannot be shadowed by stale sections.

**Example:**

```json
goop_write_db({ doc_type: "chronicle", content: "### 2026-07-16\n\nWave 9 complete." })
```

**Batch guidance:** When updating multiple documents, use `items` to write them in a single transaction and a single tool call.

```json
goop_write_db({
  items: [
    { doc_type: "chronicle", content: "..." },
    { doc_type: "adl", content: "..." }
  ]
})
```

---

### `goop_read_section`

Read structured sections for a document, either all sections, one section, or a batch of specific sections.

**Args:**

| Name | Type | Required | Default | Notes |
|---|---|---|---|---|
| `doc_type` | `string` | required | — | Document type |
| `section_key` | `string` | optional (single mode) | — | Read one specific section |
| `section_keys` | `string[]` | optional (batch mode) | — | Read multiple specific sections |
| `workflow_id` | `string` | optional | active workflow | Override target workflow |

**Example:**

```json
goop_read_section({ doc_type: "spec", section_keys: ["vision", "must-haves"] })
```

**Batch guidance:** Need several sections from the same doc? Use `section_keys` in one call, not repeated single `section_key` calls.

---

### `goop_write_section`

Write, update, or delete a structured document section. Sectioned writes assemble into a rendered sidecar.

**Args:**

| Name | Type | Required | Default | Notes |
|---|---|---|---|---|
| `action` | `"write" \| "delete"` | optional | `"write"` | Delete mode removes a single section |
| `doc_type` | `string` | required | — | Document type |
| `section_key` | `string` | required for write/delete single mode | — | Stable key for the section |
| `content` | `string` | required for write single mode | — | Markdown body |
| `position` | `number` | optional | append-after | Ordering position for assembly |
| `workflow_id` | `string` | optional | active workflow | Override target workflow |
| `items` | `{ doc_type, section_key, content, position? }[]` | optional (batch mode) | — | Batch section writes only; delete does not support `items` |

**Behavioral note:** On the first sectioned write for a doc_type that previously had monolithic content and has zero existing sections, `goop_write_section` automatically migrates the monolithic content into a reserved `_migrated-legacy-content` section at position 0 before writing the new section. This prevents silent content loss when moving from monolithic to sectioned storage.

**Examples:**

```json
// Write a single section
goop_write_section({ doc_type: "spec", section_key: "risks", content: "..." })

// Delete a section
goop_write_section({ action: "delete", doc_type: "spec", section_key: "risks" })

// Batch write sections
goop_write_section({
  items: [
    { doc_type: "spec", section_key: "vision", content: "...", position: 0 },
    { doc_type: "spec", section_key: "scope", content: "...", position: 1 }
  ]
})
```

**Batch guidance:** Use `items` for multi-section writes. Delete is single-section only via `action: "delete"` plus `section_key`.

---

### `goop_append_chronicle`

Append a timestamped entry to the chronicle without reading the full document first.

**Args:**

| Name | Type | Required | Default | Notes |
|---|---|---|---|---|
| `entry` | `string` | required (single mode) | — | Chronicle entry text |
| `workflow_id` | `string` | optional | active workflow | Override target workflow |
| `entries` | `string[]` | optional (batch mode) | — | Batch of chronicle entry strings |

**Example:**

```json
goop_append_chronicle({ entry: "Wave 2 verification passed." })
```

**Batch guidance:** Multiple progress updates in one turn should use `entries`, not repeated `entry` calls.

```json
goop_append_chronicle({
  entries: [
    "Wave 2 verification passed.",
    "Opened PR for review."
  ]
})
```

---

### `goop_search_docs`

Search workflow documents and sections across all workflows, with optional filters.

**Args:**

| Name | Type | Required | Default | Notes |
|---|---|---|---|---|
| `query` | `string` | required | — | Search query |
| `workflow_id` | `string` | optional | — | Filter to one workflow |
| `workflow_ids` | `string[]` | optional | — | Filter to any of several workflows (OR) |
| `doc_type` | `string` | optional | — | Filter to one document type |
| `doc_types` | `string[]` | optional | — | Filter to any of several document types (OR) |
| `section_key` | `string` | optional | — | Filter to one section key |
| `section_keys` | `string[]` | optional | — | Filter to any of several section keys (OR) |
| `since` | `number` | optional | — | Unix seconds, created-at lower bound |
| `until` | `number` | optional | — | Unix seconds, created-at upper bound |
| `limit` | `number` | optional | `20` | Max results, capped at 50 |

**Example:**

```json
goop_search_docs({ query: "batch guidance", doc_types: ["spec", "blueprint"], limit: 10 })
```

**Batch guidance:** Use plural filters (`workflow_ids`, `doc_types`, `section_keys`) when searching across multiple scopes. Do not make one call per scope.

---

## Wave and tracking tools

### `goop_write_wave`

Write or update wave metadata and inline tasks, change a single task status, bulk-update task statuses, or batch-write multiple waves.

**Args:**

| Name | Type | Required | Default | Notes |
|---|---|---|---|---|
| `wave_number` | `number` | required as target | — | Wave number to create, update, or target |
| `title` | `string` | optional | — | Wave title |
| `status` | `string` | optional | — | Wave status |
| `pr_branch` | `string` | optional | — | PR branch |
| `pr_url` | `string` | optional | — | PR URL |
| `tasks` | `{ task_index, description?, agent?, status? }[]` | optional | — | Inline task objects |
| `task_update` | `{ task_index, status }` | optional | — | Single task status update |
| `task_updates` | `{ task_index, status }[]` | optional | — | Bulk task status updates for `wave_number` |
| `workflow_id` | `string` | optional | active workflow | Override target workflow |
| `items` | `{ wave_number, title?, status?, pr_branch?, pr_url?, tasks? }[]` | optional (batch mode) | — | Batch wave writes |

**Examples:**

```json
// Create/update a wave with tasks
goop_write_wave({ wave_number: 2, title: "Batch args", status: "in_progress", tasks: [{ task_index: 1, description: "Add items[]", agent: "goop-executor-medium", status: "in_progress" }] })

// Update one task status
goop_write_wave({ wave_number: 2, task_update: { task_index: 1, status: "complete" } })

// Bulk update several task statuses
goop_write_wave({ wave_number: 2, task_updates: [{ task_index: 1, status: "complete" }, { task_index: 2, status: "complete" }] })
```

**Batch guidance:** Use `task_updates` for multiple status changes on the same wave, and `items` when creating or updating multiple waves at once.

---

### `goop_read_waves`

Read wave metadata, task lists, and completion ratios.

**Args:**

| Name | Type | Required | Default | Notes |
|---|---|---|---|---|
| `wave_number` | `number` | optional (single mode) | — | Read one wave |
| `wave_numbers` | `number[]` | optional (batch mode) | — | Read several waves at once |
| `status` | `string` | optional | — | Filter waves by status |
| `workflow_id` | `string` | optional | active workflow | Override target workflow |

**Example:**

```json
goop_read_waves({ wave_numbers: [1, 2, 3] })
```

**Batch guidance:** Need progress on several waves? Use `wave_numbers: [1, 2, 3]` in one call, not three separate `goop_read_waves` calls.

---

### `goop_write_traceability`

Write or update a requirement-to-wave/task traceability row.

**Args:**

| Name | Type | Required | Default | Notes |
|---|---|---|---|---|
| `requirement_key` | `string` | required (single mode) | — | Requirement identifier, e.g. `MH14` |
| `wave_number` | `number` | optional | — | Wave number |
| `task_index` | `number` | optional | — | Task index within the wave |
| `status` | `string` | optional | — | Traceability status |
| `workflow_id` | `string` | optional | active workflow | Override target workflow |
| `items` | `{ requirement_key, wave_number?, task_index?, status? }[]` | optional (batch mode) | — | Batch traceability rows |

**Example:**

```json
goop_write_traceability({ requirement_key: "MH2", wave_number: 2, task_index: 1, status: "covered" })
```

**Batch guidance:** When mapping several requirements at once, use `items` to write all rows in a single call.

---

### `goop_query_decisions`

Query structured decisions captured from the Automated Decision Log.

**Args:**

| Name | Type | Required | Default | Notes |
|---|---|---|---|---|
| `rule` | `number` | optional (single mode) | — | Filter by single rule number |
| `rules` | `number[]` | optional (batch mode) | — | Filter by any of several rule numbers (OR) |
| `type` | `string` | optional (single mode) | — | Filter by single decision type |
| `types` | `string[]` | optional (batch mode) | — | Filter by any of several decision types (OR) |
| `workflow_id` | `string` | optional | — | Omit to search across all workflows |
| `limit` | `number` | optional | `50` | Max results |

**Example:**

```json
goop_query_decisions({ rules: [2, 3], types: ["deviation", "observation"], limit: 20 })
```

**Batch guidance:** When reviewing multiple ADL rule categories or decision types, use `rules` and `types` together instead of repeated single-filter calls.

---

### `goop_record_verification`

Record the result of a verification check (typecheck, test, lint, custom).

**Args:**

| Name | Type | Required | Default | Notes |
|---|---|---|---|---|
| `check_name` | `"typecheck" \| "test" \| "lint" \| "custom"` | required (single mode) | — | Verification check name |
| `status` | `"pass" \| "fail" \| "skip"` | required (single mode) | — | Check status |
| `wave_id` | `number` | optional | — | Associate with a wave |
| `detail` | `string` | optional | — | Details about the result |
| `workflow_id` | `string` | optional | active workflow | Override target workflow |
| `items` | `{ check_name, status, wave_id?, detail?, workflow_id? }[]` | optional (batch mode) | — | Batch verification records |

**Example:**

```json
goop_record_verification({ check_name: "test", status: "pass", wave_id: 2, detail: "1300 tests passed" })
```

**Batch guidance:** After running multiple verification checks, use `items` to record them all in one call.

```json
goop_record_verification({
  items: [
    { check_name: "typecheck", status: "pass", wave_id: 2 },
    { check_name: "test", status: "pass", wave_id: 2 },
    { check_name: "lint", status: "pass", wave_id: 2 }
  ]
})
```

---

### `goop_read_verifications`

Read verification check results for a workflow.

**Args:**

| Name | Type | Required | Default | Notes |
|---|---|---|---|---|
| `wave_id` | `number` | optional (single mode) | — | Filter by one wave ID |
| `wave_ids` | `number[]` | optional (batch mode) | — | Filter by several wave IDs (OR) |
| `workflow_id` | `string` | optional | active workflow | Override target workflow |

**Example:**

```json
goop_read_verifications({ wave_ids: [1, 2, 3] })
```

**Batch guidance:** Checking verifications for multiple waves? Use `wave_ids` in one call, not repeated single `wave_id` calls.

---

### `goop_blocker`

Open, resolve, or list workflow blockers.

**Args:**

| Name | Type | Required | Default | Notes |
|---|---|---|---|---|
| `action` | `"open" \| "resolve" \| "list"` | required (single mode) | — | Blocker action |
| `description` | `string` | required for `open` | — | Optional passthrough for `resolve` |
| `severity` | `"low" \| "medium" \| "high"` | optional for `open` | `"medium"` | Blocker severity |
| `wave_id` | `number` | optional | — | Associate with a wave |
| `id` | `number` | required for `resolve` | — | Blocker ID to resolve |
| `resolution` | `string` | optional for `resolve` | — | Resolution text |
| `status` | `"open" \| "resolved"` | optional for `list` | — | Filter list by status |
| `workflow_id` | `string` | optional | active workflow | Override target workflow |
| `items` | `{ action, description?, severity?, wave_id?, id?, resolution?, status?, workflow_id? }[]` | optional (batch mode) | — | Batch blocker actions |

**Examples:**

```json
goop_blocker({ action: "open", description: "CI token expired", severity: "high", wave_id: 2 })
goop_blocker({ action: "resolve", id: 7, resolution: "Rotated token" })
goop_blocker({ action: "list", status: "open" })
```

**Batch guidance:** When opening or resolving several blockers, use `items` to process them in a single call.

---

## Project view tools

### `goop_timeline`

Render a unified chronological audit trail for a workflow.

**Args:**

| Name | Type | Required | Default | Notes |
|---|---|---|---|---|
| `workflow_id` | `string` | optional | active workflow | Override target workflow |
| `limit` | `number` | optional | — | Max timeline entries |

**Example:**

```json
goop_timeline({ workflow_id: "goopspec-orchestration-upgrade", limit: 50 })
```

---

### `goop_dashboard`

Render a cross-workflow project board with phase, wave progress, blockers, and activity.

**Args:**

| Name | Type | Required | Default | Notes |
|---|---|---|---|---|
| `workflow_id` | `string` | optional | active workflow | Override target workflow |

**Example:**

```json
goop_dashboard({})
```

---

## Field Note tools

### `goop_save_note`

Save a Field Note to the global knowledge base.

**Args:**

| Name | Type | Required | Default | Notes |
|---|---|---|---|---|
| `title` | `string` | required (single mode) | — | Brief summary |
| `body` | `string` | required (single mode) | — | Full markdown content |
| `tags` | `string[]` | required (single mode) | — | Categorization tags |
| `source_agent` | `string` | required (single mode) | — | Agent name saving the note |
| `importance` | `number` | optional | `5` | Importance 1-10 |
| `workflow_id` | `string` | optional | — | Originating workflow |
| `project_id` | `string` | optional | — | Originating project |
| `items` | `{ title, body, tags, source_agent, importance?, workflow_id?, project_id? }[]` | optional (batch mode) | — | Batch note saves |

**Example:**

```json
goop_save_note({ title: "SQLite FTS5 tokenization", body: "...", tags: ["sqlite", "fts5"], source_agent: "goop-researcher", importance: 8 })
```

**Batch guidance:** When persisting multiple findings, use `items` to save them all in one call.

---

### `goop_search_notes`

Search Field Notes with hybrid FTS5 + tag matching, with optional full-body retrieval and direct fetch-by-ID.

**Args:**

| Name | Type | Required | Default | Notes |
|---|---|---|---|---|
| `query` | `string` | optional | — | FTS query. Optional when `note_id` is provided |
| `tags` | `string[]` | optional | — | Filter by tags |
| `project_id` | `string` | optional | — | Scope to project |
| `workflow_id` | `string` | optional | — | Scope to workflow |
| `limit` | `number` | optional | `10` | Max search results, capped at 50 |
| `full` | `boolean` | optional | `false` | Return full note body instead of 200-char snippet |
| `body_offset` | `number` | optional | `0` | Character offset into the body |
| `body_limit` | `number` | optional | `0` | Max body chars to return; `0` means unbounded |
| `note_id` | `string` | optional | — | Direct fetch by exact `fn_...` ID; bypasses search and returns full body |

**Examples:**

```json
// Direct fetch by ID (preferred when ID is known)
goop_search_notes({ note_id: "fn_20260716_0v28qlej" })

// Full body on re-query
goop_search_notes({ query: "WAL mode", full: true })

// Character-range slice
goop_search_notes({ query: "WAL mode", body_offset: 0, body_limit: 500 })
```

**Batch guidance:** `note_id` is the cheapest path to a full note body. When a search snippet reveals a relevant note, fetch it by `note_id` rather than re-querying with narrowing terms. `body_offset` and `body_limit` are named distinctly from the top-level `limit` arg so there is no ambiguity between result-count and body-slice limits.

---

## State and workflow tools

### `goop_state`

Safe, atomic state operations for GoopSpec workflows. Never edit `state.json` directly.

**Args:**

| Name | Type | Required | Default | Notes |
|---|---|---|---|---|
| `action` | `string` | required | — | See actions list below |
| `phase` | `string` | optional | — | Required for `transition` |
| `mode` | `string` | optional | — | Required for `set-mode` |
| `depth` | `string` | optional | — | Required for `set-depth` |
| `autopilot` | `boolean` | optional | — | Required for `set-autopilot` |
| `lazy` | `boolean` | optional | `false` | Makes autopilot lazy |
| `currentWave` | `number` | optional | — | Required for `update-wave` |
| `totalWaves` | `number` | optional | — | Required for `update-wave` |
| `workflowId` | `string` | optional | — | Required for `set-active-workflow` and `create-workflow` |
| `force` | `boolean` | optional | `false` | Force phase transition |
| `activate` | `boolean` | optional | `false` | For `create-workflow`: also switch to the new workflow |

**Actions:**

- `get` — read current state
- `transition` — change phase (requires `phase`)
- `complete-interview` / `reset-interview`
- `lock-spec` / `unlock-spec`
- `confirm-acceptance` / `reset-acceptance`
- `set-mode` (requires `mode`)
- `set-depth` (requires `depth`)
- `set-autopilot` (requires `autopilot`)
- `update-wave` (requires `currentWave`, `totalWaves`)
- `reset` — reset active workflow to idle
- `list-workflows`
- `set-active-workflow` (requires `workflowId`)
- `create-workflow` (requires `workflowId`, optional `activate`)

**Examples:**

```json
goop_state({ action: "create-workflow", workflowId: "my-feature", activate: true })
goop_state({ action: "update-wave", currentWave: 3, totalWaves: 9 })
goop_state({ action: "set-autopilot", autopilot: true, lazy: true })
```

**Batch guidance:** `create-workflow` with `activate: true` collapses the two-call create-then-activate pattern into one call. Use it instead of a separate `set-active-workflow` call.

---

### `goop_status`

Show current workflow state, phase, progress, and next-step guidance.

**Args:**

| Name | Type | Required | Default | Notes |
|---|---|---|---|---|
| `verbose` | `boolean` | optional | `false` | More detailed status output |

**Example:**

```json
goop_status({ verbose: true })
```

---

### `goop_checkpoint`

Save, load, or list execution checkpoints for resuming work later.

**Args:**

| Name | Type | Required | Default | Notes |
|---|---|---|---|---|
| `action` | `"save" \| "load" \| "list"` | required | — | Checkpoint action |
| `id` | `string` | optional | — | Required for `save` and `load` |
| `context` | `Record<string, unknown>` | optional | — | Arbitrary context attached to checkpoint |

**Example:**

```json
goop_checkpoint({ action: "save", id: "before-refactor", context: { branch: "feat/tool-reference" } })
```

---

### `goop_setup`

GoopSpec configuration and setup actions.

**Args:**

| Name | Type | Required | Default | Notes |
|---|---|---|---|---|
| `action` | `string` | required | — | `detect`, `init`, `plan`, `apply`, `verify`, `reset`, `models`, `status` |
| `projectName` | `string` | optional | — | Project name for init |
| `defaultModel` | `string` | optional | — | Default model |
| `agentModels` | `Record<string, string>` | optional | — | Per-role model overrides |
| `memoryEnabled` | `boolean` | optional | — | Enable memory |
| `gitignoreGoopspec` | `boolean` | optional | — | Add `.goopspec/` to gitignore |
| `preserveData` | `boolean` | optional | — | Preserve data on reset |
| `confirmed` | `boolean` | optional | — | Confirm destructive reset |
| `scope` | `"global" \| "project" \| "both"` | optional | — | Reset scope |

**Example:**

```json
goopspec({ action: "verify" })
```

---

### `goop_spec`

Read, list, or validate `SPEC.md` and `BLUEPRINT.md` files for GoopSpec phases.

**Args:**

| Name | Type | Required | Default | Notes |
|---|---|---|---|---|
| `action` | `"read" \| "list" \| "validate"` | required | — | Action |
| `file` | `"spec" \| "plan" \| "both"` | optional | `"both"` | Which file(s) for `read` |
| `phase` | `string` | optional | — | Phase context |

**Example:**

```json
goop_spec({ action: "validate" })
```

---

## Memory tools

### `memory_save`

Save structured information to persistent memory.

**Args:**

| Name | Type | Required | Default | Notes |
|---|---|---|---|---|
| `title` | `string` | required | — | Brief summary, max 100 chars |
| `content` | `string` | required | — | Detailed content |
| `type` | `"observation" \| "decision" \| "note" \| "todo"` | optional | `"observation"` | Memory type |
| `concepts` | `string[]` | optional | — | Tags for search |
| `facts` | `string[]` | optional | — | Atomic facts |
| `importance` | `number` | optional | type-dependent | 1-10; values 0-1 scaled to 1-10 |
| `sourceFiles` | `string[]` | optional | — | Related file paths |
| `reasoning` | `string` | optional | — | For `type: "decision"` |
| `alternatives` | `string[]` | optional | — | For `type: "decision"` |

**Example:**

```json
memory_save({ title: "bun:sqlite FTS5 requires explicit tokenizer", content: "...", type: "observation", concepts: ["bun", "sqlite", "fts5"], importance: 8 })
```

---

### `memory_search`

Search persistent memory with keyword and semantic matching.

**Args:**

| Name | Type | Required | Default | Notes |
|---|---|---|---|---|
| `query` | `string` | required | — | Natural language search query |
| `limit` | `number` | optional | `5` | Max results, capped at 20 |
| `types` | `string[]` | optional | — | Filter by memory types |
| `concepts` | `string[]` | optional | — | Filter by concept tags |
| `minImportance` | `number` | optional | — | Minimum importance 1-10 |

**Example:**

```json
memory_search({ query: "SQLite FTS5", concepts: ["sqlite", "fts5"], limit: 10 })
```

---

### `memory_forget`

Delete memories by ID or query.

**Args:**

| Name | Type | Required | Default | Notes |
|---|---|---|---|---|
| `id` | `number` | optional | — | Specific memory ID to delete |
| `query` | `string` | optional | — | Search query for bulk deletion |
| `confirm` | `boolean` | optional | `false` | Required to confirm query-based deletion |

**Example:**

```json
memory_forget({ id: 42 })
```

---

## Reference and command tools

### `goop_reference`

Load reference documents or templates. Supports multi-load and section extraction.

**Args:**

| Name | Type | Required | Default | Notes |
|---|---|---|---|---|
| `name` | `string` | optional (single mode) | — | Single reference name |
| `names` | `string[]` | optional (multi mode) | — | Multiple references in one call |
| `type` | `"reference" \| "template"` | optional | — | Filter by resource type |
| `list` | `boolean` | optional | `false` | List available references |
| `section` | `string` | optional | — | Extract a specific `##` heading |

**Example:**

```json
goop_reference({ names: ["core-protocol", "git-workflow", "field-notes-protocol"] })
```

**Batch guidance:** Use `names` to load multiple references in one call. This is the reference-tool counterpart to `doc_types` on `goop_read_db`.

---

### `slashcommand`

Resolve a GoopSpec slash command to its markdown instructions.

**Args:**

| Name | Type | Required | Default | Notes |
|---|---|---|---|---|
| `command` | `string` | required | — | Command name, e.g. `"/goop-plan"` or `"goop-plan"` |

**Example:**

```json
slashcommand({ command: "/goop-execute" })
```

---

## Utility tools

### `goop_adl`

Read or append to the Automated Decision Log.

**Args:**

| Name | Type | Required | Default | Notes |
|---|---|---|---|---|
| `action` | `"read" \| "append"` | required | — | Read or append |
| `type` | `"decision" \| "deviation" \| "observation"` | optional | — | Required for `append` |
| `description` | `string` | optional | — | Required for `append` |
| `entry_action` | `string` | optional | — | Required for `append` |
| `rule` | `number` | optional | — | Associated rule number |
| `files` | `string[]` | optional | — | Affected files |

**Example:**

```json
goop_adl({ action: "append", type: "deviation", description: "Bypassed code-review gate", entry_action: "Escalated to user", rule: 4, files: ["src/auth.ts"] })
```

---

### `goop_get_global_config`

Read the global GoopSpec config from the OpenCode config directory.

**Args:** none

**Example:**

```json
goop_get_global_config({})
```

---

### `goop_create_pr`

Create a GitHub PR with a GoopSpec terminology sanitizer gate.

**Args:**

| Name | Type | Required | Default | Notes |
|---|---|---|---|---|
| `title` | `string` | required | — | PR title |
| `body` | `string` | required | — | PR body |
| `branch` | `string` | required | — | Source branch |
| `base` | `string` | optional | `"main"` | Target branch |
| `draft` | `boolean` | optional | `false` | Create as draft |

**Example:**

```json
goop_create_pr({ title: "fix(db): prevent section shadowing", body: "...", branch: "feat/section-tool-hardening", base: "main" })
```

---

### `goop_infer_intent`

Classify a raw voice transcript into a GoopSpec command intent.

**Args:**

| Name | Type | Required | Default | Notes |
|---|---|---|---|---|
| `transcript` | `string` | required | — | Voice or free-text input |
| `workflowPhase` | `string` | optional | — | Current workflow phase |
| `hasActiveWorkflow` | `boolean` | optional | — | Whether a workflow is active |

**Example:**

```json
goop_infer_intent({ transcript: "create a plan for the auth refactor", hasActiveWorkflow: false })
```

---

*Tool Reference v1.0 — GoopSpec Reference*
