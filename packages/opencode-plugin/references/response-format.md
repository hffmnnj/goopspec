# Sub-Agent Response Format (MH17)

Every GoopSpec sub-agent returns a single markdown-structured response to the orchestrator. The format is intentionally lean: five canonical sections, no XML, no nested metadata tables.

## Section Contract

A response contains exactly these top-level sections, in this order:

```markdown
## STATUS
## SUMMARY
## ARTIFACTS
## VERIFICATION
## NEXT
```

Each section is introduced by a top-level markdown header `## `. Do not add extra prose, banners, or decorative separators outside these sections. The body under each header must stay terse.

### `## STATUS`

A single word/line, one of:

- `complete` — task finished and verified.
- `partial` — progress made; the task needs continuation.
- `blocked` — cannot continue without a decision or missing information.

### `## SUMMARY`

One to three plain-language sentences describing what was accomplished (or why it is blocked). Include the agent role and the task outcome. Do not restate status or list every file detail here.

### `## ARTIFACTS`

A bullet list of files created or modified. Each bullet is a single line with the relative path and a one-line note, separated by an em-dash or a dash.

```markdown
- src/auth/service.ts — added JWT signing helpers
- src/auth/service.test.ts — added signing tests
```

If no files changed, write exactly:

```markdown
- none
```

### `## VERIFICATION`

A single line stating what was checked and the result. Prefer exact commands.

```markdown
bun test packages/core/src/auth/ — 12 passed, 0 failed
bun run typecheck — no errors
```

If verification is not applicable (e.g., pure research), write:

```markdown
n/a
```

### `## NEXT`

A concise handoff to the orchestrator. When status is `complete`, state the next task or delegate. When status is `blocked`, list the blocker(s) and what is needed to unblock. When status is `partial`, state what remains.

## Rules

- Omit nothing: all five sections must be present, even if empty (`none` or `n/a`).
- Keep terse: one line per artifact, one line per verification, one to three lines for NEXT.
- No prose padding: do not write introductions, conclusions, or explanations outside the sections.
- No XML tags, tables, or code fences for metadata.
- Use markdown headers only; section order is fixed.
- Functional em-dashes only; do not use emojis.

## Orchestrator Parsing Guidance

Parse by top-level markdown headers. Match the regular expression:

```regex
^## (STATUS|SUMMARY|ARTIFACTS|VERIFICATION|NEXT)
```

The section body is everything up to the next matching `## ` header or end-of-response.

- Extract `STATUS` to route the workflow.
- Detect `blocked` immediately to trigger Rule 4 escalation.
- Read `ARTIFACTS` to update the work log.
- Read `VERIFICATION` to decide if acceptance checks are satisfied.
- Read `NEXT` to determine the following action or the unblock requirement.

Because sections are declared by simple headers, a regex-based splitter can reconstruct the envelope without an XML parser.

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

The response format is terse by design. Keep the same discipline in every agent output:

- Write for the orchestrator, not for general readers.
- One idea per sentence.
- Use active voice.
- Avoid filler, emojis, and decorative separators.
- Proofread before returning.

## Why This Replaces XML

The old XML envelope carried heavy tag tax, nested elements, and duplicated state fields. The markdown-header format preserves the same semantics — status, artifacts, verification, next steps — while dropping the structural overhead. It is still machine-parseable by regex over `## ` headers, easier to read in chat logs, and cheaper in token budget without arbitrary size caps.
