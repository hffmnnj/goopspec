# Sub-Agent Response Format (MH17)

Every GoopSpec sub-agent returns a single markdown-structured response to the orchestrator: five canonical sections, no XML, no nested metadata tables.

## Section Contract

Response sections, in order:

```markdown
## STATUS
## SUMMARY
## ARTIFACTS
## VERIFICATION
## NEXT
```

Each is a top-level `## ` header. No extra prose, banners, or decorative separators outside these sections.

### `## STATUS`

One of:

- `complete` — task finished and verified.
- `partial` — progress made; needs continuation.
- `blocked` — cannot continue without a decision or missing information.

### `## SUMMARY`

One to three sentences describing what was accomplished (or why it is blocked). Include the agent role and outcome. Do not restate status or list every file.

### `## ARTIFACTS`

One-line bullets for created or modified files:

```markdown
- src/auth/service.ts — added JWT signing helpers
- src/auth/service.test.ts — added signing tests
```

If no files changed: `- none`.

### `## VERIFICATION`

One line stating what was checked and the result. Prefer exact commands:

```markdown
bun test packages/core/src/auth/ — 12 passed, 0 failed
bun run typecheck — no errors
```

If not applicable: `n/a`.

### `## NEXT`

Concise handoff. When `complete`, state the next task or delegate. When `blocked`, list blockers and what is needed. When `partial`, state what remains.

## Rules

- All five sections must be present, even if empty (`none` or `n/a`).
- One line per artifact, one line per verification, one to three lines for NEXT.
- No introductions, conclusions, or explanations outside the sections.
- No XML tags, tables, or code fences for metadata.
- Fixed section order; markdown headers only.
- Functional em-dashes only; no emojis.

## Orchestrator Parsing Guidance

Parse by top-level markdown headers matching:

```regex
^## (STATUS|SUMMARY|ARTIFACTS|VERIFICATION|NEXT)
```

The body is everything up to the next matching `## ` header or end-of-response.

- Extract `STATUS` to route the workflow.
- Detect `blocked` immediately to trigger Rule 4 escalation.
- Read `ARTIFACTS` to update the work log.
- Read `VERIFICATION` to decide if acceptance checks are satisfied.
- Read `NEXT` to determine the next action or unblock requirement.

A regex-based splitter reconstructs the envelope without an XML parser.

## Example: Executor Task (Code Change)

## STATUS
complete

## SUMMARY
Implemented the in-process memory manager using `bun:sqlite` with FTS5. Saves, searches, and deletes entries without a worker process.

## ARTIFACTS
- src/features/memory/index.ts — memory manager with save/search/forget
- src/features/memory/schema.ts — SQLite table and FTS5 definitions
- src/features/memory/index.test.ts — manager unit tests

## VERIFICATION
bun test packages/opencode-plugin/src/features/memory/ — 9 passed, 0 failed

## NEXT
Continue to Wave 4 Task 4.5: build memory_search and memory_save tools using this manager.

## Example: Researcher Task (Findings)

## STATUS
complete

## SUMMARY
Compared the stable and beta OpenCode SDK hook APIs. Two hooks changed signatures and one event was renamed; the rest are viable unchanged.

## ARTIFACTS
- .research/sdk-divergence-report.md — stable-vs-beta diff with migration notes
- .research/hook-feasibility-report.md — per-hook viability verdicts

## VERIFICATION
n/a

## NEXT
Hand to Wave 5 planner to redesign the two changed hooks before hook implementation begins.

## Writing for Clarity

- Write for the orchestrator, not general readers.
- One idea per sentence.
- Use active voice.
- Avoid filler, emojis, and decorative separators.
- Proofread before returning.

## Why This Replaces XML

XML carried heavy tag tax, nested elements, and duplicated state fields. Markdown headers preserve the same semantics with less structural overhead and remain regex-parseable over `## ` headers.

---

*Sub-Agent Response Format v1.0 — GoopSpec Reference*
