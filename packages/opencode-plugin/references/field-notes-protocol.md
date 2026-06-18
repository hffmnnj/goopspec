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
| `goop_search_notes(query, tags?, project_id?, workflow_id?, limit?)` | Search notes with FTS + tag matching |

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
