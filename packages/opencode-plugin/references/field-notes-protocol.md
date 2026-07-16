# Field Notes Protocol

A global, cross-project knowledge base that compounds research across all projects over time.

## What Field Notes Are

Field Notes are persistent knowledge entries stored in the GoopSpec database. Unlike per-workflow `RESEARCH.md` files, notes survive workflow completion and are searchable across every project the plugin has ever touched. Agents get smarter over time because prior research, patterns, and gotchas accumulate in a single queryable store.

Every note is a first-class DB record with full-text search, tag filtering, and importance ranking.

## Note ID Format

Every Field Note receives a unique ID on creation:

```
fn_YYYYMMDD_<8 random alphanumeric chars>
```

Examples:

- `fn_20260618_a3b7f2k9`
- `fn_20260615_xm4p9q2w`

Always record the returned ID when you save a note. You can retrieve it later with `goop_search_notes`.

## Tools

| Tool | Purpose |
|------|---------|
| `goop_save_note(title, body, tags, source_agent, importance, workflow_id?, project_id?)` | Save a new Field Note |
| `goop_search_notes(query, tags?, project_id?, workflow_id?, limit?, full?, body_offset?, body_limit?, note_id?)` | Search notes with FTS + tag matching; supports full-body retrieval and direct fetch-by-ID |

These tools replace direct reads and writes to `RESEARCH.md`.

## When to Save Notes

Bias toward saving. Storage is cheap; lost knowledge is expensive.

Save a note after:

- Completing any research task or exploration.
- Discovering a pattern, convention, or gotcha in a codebase.
- Fixing a non-obvious bug (capture the root cause and fix).
- Making an architectural or design decision with rationale.
- Finding a useful library, API quirk, or version-specific behavior.
- Encountering a contradiction between documentation and reality.

Do not save notes for routine status updates or trivial observations that have no future retrieval value.

## Tag Conventions

Tags are the primary retrieval signal. Use specific, reusable tags that describe the subject matter.

Good tags:

```json
["sqlite", "fts5", "performance"]
["bun", "esm", "import-resolution"]
["opencode-sdk", "hook-api", "breaking-change"]
```

Bad tags:

```json
["research", "notes"]
["important", "todo"]
["misc"]
```

Guidelines:

- Use lowercase, hyphenated terms.
- Prefer technology and domain terms over process terms.
- Include the library or framework name when relevant.
- Three to five tags per note is typical; one is too few, ten is too many.

## Search Patterns

### Targeted retrieval

```
goop_search_notes("FTS5 performance tuning", { tags: ["sqlite", "fts5"] })
```

Combines full-text search on the query with tag filtering for precision.

### Tag-only browsing

```
goop_search_notes("", { tags: ["bun", "esm"] })
```

Empty query with tag filters returns all notes matching those tags, ordered by importance.

### Global search

```
goop_search_notes("JWT token rotation")
```

No filters searches across all projects and workflows.

### Scoped search

```
goop_search_notes("state migration", { project_id: "goopspec", workflow_id: "goopdb-state-engine" })
```

Narrows results to a specific project or workflow context.

## Enhanced Retrieval: `full`, `body_offset`, `body_limit`, `note_id`

`goop_search_notes` supports four optional arguments that give you fine-grained control over how much of a note body is returned. The default behavior (all four absent) returns a 200-character snippet — this is the norm for most searches and keeps token usage low.

### `note_id: string` — Direct fetch by ID (preferred when ID is known)

When you already have a note's `fn_...` ID from a prior search result, pass it as `note_id` to retrieve the **complete body** of that single note in one call. This bypasses FTS ranking and query parsing entirely — it is the cheapest, most direct path to a full note body.

```
goop_search_notes({ note_id: "fn_20260716_0v28qlej" })
```

When `note_id` is provided, `query` is optional and ignored if both are supplied. The returned note always includes its full body (equivalent to `full: true` for that one note).

### `full: boolean` — Full body on re-query

When re-issuing a search query and a snippet from the initial result indicates relevance but insufficient detail, add `full: true` to return the complete body for every matching note.

```
goop_search_notes({ query: "WAL mode", full: true })
```

### `body_offset: number` and `body_limit: number` — Character-range slicing

Slice a note body by character range. `body_offset` (default 0) is the starting character position; `body_limit` (default 0, meaning unbounded within the body) is the maximum characters to return. These are only applied when at least one of `full`, `body_offset`, or `body_limit` is set.

```
goop_search_notes({ query: "WAL mode", body_offset: 0, body_limit: 200 })
```

### Guidance

| Situation | Recommended Approach |
|-----------|---------------------|
| ID already known from a prior snippet result | `note_id: "fn_..."` — direct, cheapest, always returns full body |
| Snippet indicates relevance but you need the full text | Re-issue with `full: true` |
| You only need a specific portion of a long note | `body_offset` + `body_limit` |
| Routine search, snippet is enough | Default (no extra args) — keeps token usage low |

**Keep default snippet mode as the norm.** These are opt-in enhancements, not the default behavior. Only use `full`, `note_id`, or body-range args when a snippet is genuinely insufficient.

### Live-Trace Example: Before and After

**BEFORE (anti-pattern — 6 sequential calls, still can't get full body):**

An agent searches for a note about SQLite WAL mode. Each call returns a truncated snippet, so the agent keeps narrowing the query and adding `limit: 1`, hoping for a different truncation — but the 200-char limit is structural, not query-dependent.

```
Call 1: goop_search_notes({ query: "SQLite WAL mode" })
         → snippet truncated at 200 chars, no full body

Call 2: goop_search_notes({ query: "SQLite WAL mode performance" })
         → same snippet, still truncated

Call 3: goop_search_notes({ query: "SQLite WAL mode", limit: 1 })
         → one result, still truncated

Call 4: goop_search_notes({ query: "WAL mode benefits SQLite", limit: 1 })
         → one result, still truncated

Call 5: goop_search_notes({ query: "SQLite WAL mode benefits", limit: 1 })
         → one result, still truncated

Call 6: goop_search_notes({ query: "fn_20260618_sqlite01", limit: 1 })
         → one result, still truncated (query is FTS, not ID lookup)
```

**Result:** 6 tool calls, zero full bodies retrieved. The agent wasted tokens and turns because no direct-fetch path existed.

**AFTER (correct — 2 calls, full body retrieved):**

```
Call 1: goop_search_notes({ query: "SQLite WAL mode" })
         → returns snippet with note_id: "fn_20260618_sqlite01"

Call 2: goop_search_notes({ note_id: "fn_20260618_sqlite01" })
         → returns the complete note body immediately
```

**Result:** 2 tool calls. The agent notes the `fn_...` ID from the first search's snippet, then makes one follow-up call with `note_id` to get the complete body. No repeated narrowing queries, no wasted turns.

## Importance Scale

| Range | Meaning | Examples |
|-------|---------|----------|
| 1-3 | Routine observations | Minor code style notes, trivial findings |
| 4-6 | Useful patterns | Reusable solutions, library quirks, convention discoveries |
| 7-8 | Key decisions or architectural findings | Design rationale, migration strategies, performance benchmarks |
| 9-10 | Critical gotchas or must-reads | Breaking changes, data loss risks, security findings |

Default to 5 when uncertain. Reserve 9-10 for findings that would cause real damage if missed by a future agent.

## Agent Responsibilities

### All agents

- Search notes in boot sequence before starting work: `goop_search_notes` replaces reading `RESEARCH.md`.
- Use `goop_save_note` instead of writing to `RESEARCH.md`.

### Researchers and explorers

- Save notes before returning a response. Every research task should produce at least one note.
- Include enough context in the body that a future agent can act on the note without re-doing the research.

### Executors

- Search notes before making implementation decisions. Prior research may already answer the question.
- Save notes when encountering unexpected behavior or non-obvious solutions.

### Orchestrators

- Search notes when planning new workflows. Prior project knowledge may inform task decomposition.

## Provenance

Always set these fields for traceability:

| Field | Value |
|-------|-------|
| `source_agent` | Your agent name (e.g. `"goop-researcher"`, `"goop-executor-medium"`) |
| `workflow_id` | The active workflow ID, if the note is workflow-specific |
| `project_id` | The project identifier, if the note is project-specific |

Omit `workflow_id` and `project_id` for truly global knowledge (e.g. a library behavior that applies everywhere).

## Anti-Patterns

- Saving notes without tags. Untagged notes are nearly impossible to find later.
- Using vague titles like "Research findings" or "Notes". Be specific: "bun:sqlite FTS5 requires explicit tokenizer config on Linux".
- Setting importance to 10 for everything. Reserve high importance for genuinely critical findings.
- Duplicating the same finding across multiple notes. Search first, then save.

---

*Field Notes Protocol v1.0 — GoopSpec Reference*
