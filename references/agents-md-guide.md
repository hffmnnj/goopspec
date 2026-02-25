---
name: agents-md-guide
description: Guide to evaluating and auto-updating AGENTS.md files for GoopSpec projects
phase: accept
---

# AGENTS.md Guide

How to evaluate, write, and auto-update AGENTS.md files. Load this reference during the accept phase to update a project's AGENTS.md with verified milestone learnings.

---

## 1. Purpose & Philosophy

AGENTS.md is the always-loaded instruction file for AI coding agents. It tells agents the things they **cannot reliably infer from code alone**: verification commands, workflow contracts, non-obvious constraints, and sharp edges.

### Core Principles

- **Conciseness over completeness.** A bloated instruction file leads to instruction dilution — agents ignore rules buried in noise. Keep it short enough that every line gets read.
- **Repo-specific beats generic.** If a rule is true in any repository ("write clean code", "handle errors"), delete it. Only keep facts unique to *this* repo.
- **Verification-first.** The highest-leverage content is "how to verify work." Agents that can run tests, typecheck, and lint iterate faster and produce better results.
- **Enforcement over documentation.** Hard constraints belong in hooks or CI, not prose. AGENTS.md is for advisory guidance and orientation — things that benefit from context but don't need deterministic enforcement.

*Source: Anthropic Claude Code best-practices.md, memory.md*

---

## 2. Essential Sections

What belongs in a great AGENTS.md, ordered by impact.

### A. Verification Commands (Highest ROI — First-Class)

Agents do better when they can verify their own work. This is the single highest-leverage section.

Include:

- Primary commands: `test`, `typecheck`, `lint`, `build`, `dev`
- Fast-path variants: single-file test, pattern filter, watch mode
- Required local services or environment variables needed to run verification
- Any non-obvious setup steps (codegen, migrations, seed data)

*Source: Anthropic Claude Code best-practices.md — "Give Claude a way to verify its work"*

### B. Workflow Contract

A predictable flow reduces wasted effort and dangerous shortcuts.

Include:

- Expected workflow: explore → plan → implement → verify → commit
- When to use plan-only analysis vs direct edits
- Commit message format and branch naming conventions
- PR expectations and review process
- Safety expectations (avoid destructive commands unless explicitly requested)

*Source: Anthropic Claude Code best-practices.md*

### C. Repo-Specific Constraints (Non-Negotiables)

Things agents must not violate, even if they seem reasonable to change.

Include:

- Non-negotiable stack choices, versions, and package managers
- Architectural guardrails (where to place new code, public API boundaries)
- Security rules that are easy to violate accidentally (e.g., "never commit secrets", "always validate input server-side")
- Forbidden actions with rationale

*Source: Anthropic Claude Code memory.md, best-practices.md*

### D. Project Map (Minimal, Link-Heavy)

Agents waste tokens and time rediscovering structure. But keep this short — a map, not a tour.

Include:

- Top 5–10 directories/files with one-line descriptions
- Entry points and where to add new code
- Links or `@imports` to longer architectural docs

*Source: Anthropic Claude Code best-practices.md — keep always-loaded file concise*

### E. Gotchas & Sharp Edges (Highest ROI Content)

Behaviors that **appear correct but break in this repo**. This is where AGENTS.md earns its keep.

Examples:

- Flaky tests and how to rerun them
- Codegen steps that must run before build
- Migration pitfalls or ordering requirements
- Environment variables that must be set but aren't obvious
- Scripts that modify files outside git (checkpointing won't help)
- Race conditions in test suites

*Source: Anthropic Claude Code best-practices.md, checkpointing docs*

### F. When Instructions Should Be Hooks, Not Text

Hard constraints that must happen every time with zero exceptions belong in hooks, not documentation.

Include:

- A short list of "hard" rules and their enforcement mechanism (hook name, script path)
- Guidance: if you find yourself writing "NEVER do X" — consider a hook instead

*Source: Anthropic Claude Code hooks documentation*

### G. Where Additional Agent Context Lives

Point agents to modular, scoped documents instead of cramming everything into one file.

Include:

- Topic rules: `.claude/rules/*.md` (loaded automatically, support `paths` frontmatter for scoping)
- Reusable workflows: `.claude/skills/`
- Deterministic enforcement: hooks (`.claude/settings.json`)
- Subagents for noisy tasks (full test runs, wide codebase search)

*Source: Anthropic Claude Code memory.md, skills docs, sub-agents.md*

---

## 3. Content Quality Signals

Observable properties that correlate with agent success. Use these to evaluate an existing AGENTS.md.

| Signal | What to Look For |
|--------|-----------------|
| **Executable rules** | Every rule has a command to run or a test to verify. "Do X" comes with "verify by running Y." |
| **High repo-unique ratio** | Most content is specific to this repo. Generic advice is absent. |
| **Explicit defaults** | Preferred test runner, formatter, package manager, branch naming, and commit style are stated, not assumed. |
| **Clear precedence** | Global rules vs path-specific rules are distinguished. No contradictory guidance. |
| **Pointer-first organization** | The main file is an index + contracts. Deep detail lives in modular docs loaded on demand. |

*Source: Anthropic Claude Code best-practices.md, memory.md*

---

## 4. Anti-Patterns

What makes AGENTS.md actively unhelpful. If you see these, fix or remove them.

| Anti-Pattern | Why It Hurts |
|-------------|-------------|
| **Overlong "kitchen sink" doc** | Instruction dilution — agents ignore rules buried in noise. Claude Code explicitly warns against bloated instruction files. |
| **Rules that contradict code reality** | E.g., "use pnpm" while repo uses bun. Agents follow the doc and break workflows. |
| **Unverifiable standards** | "Write comprehensive tests" without naming which commands to run or which suites matter. |
| **Copy-pasted style guides** | Generic language norms add noise and push out repo-specific constraints. |
| **Mixing dynamic data into always-loaded context** | Putting "current incident status" or "today's deploy" in the core file guarantees staleness. |
| **Soft rules for hard constraints** | If "never run rm -rf" is critical, enforce via hooks — not a bullet point agents might skip. |

*Source: Anthropic Claude Code best-practices.md, hooks documentation*

---

## 5. Freshness Signals

How to detect that AGENTS.md is stale. Check these during the accept phase.

| Signal | How to Detect |
|--------|--------------|
| **Commands fail** | Test/build/lint scripts have changed; documented commands no longer work. |
| **Tooling mismatch** | Doc names a package manager, runtime, or test runner not present in `package.json` or lockfiles. |
| **Paths no longer exist** | Referenced directories or files have been removed or moved. |
| **Rules don't match patterns** | Doc says "default exports everywhere" but repo uses named exports. |
| **Known gotchas are missing** | Repeated failures show up in transcripts or CI but aren't captured. |
| **Last-updated older than last stack change** | Compare the `Last verified` timestamp against toolchain config edits. |

*Source: Anthropic Claude Code memory.md — periodic review, keep memory concise and up to date*

---

## 6. Section Ownership Model

AGENTS.md uses a **three-tier ownership model** to prevent auto-updates from overwriting human-curated content. Ownership is signaled by sentinel suffixes in section headings.

### Tier Definitions

| Tier | Heading Pattern | Rule |
|------|----------------|------|
| **Machine-owned** | `## Section Name (Auto)` | Safe to rewrite the entire section automatically. Keep the sentinel heading intact. |
| **Human-owned** | `## Section Name` *(no suffix)* | Read-only to auto-update. Never modify. |
| **Mixed** | `## Section Name (Human + Auto)` | Patch-only edits: append new items, remove obsolete items. Never reflow existing prose or reorder existing bullets. |

### Rules by Tier

**Machine-owned `(Auto)` sections:**
- Rewrite the entire section content on every update.
- Keep the sentinel heading exactly as-is (e.g., `## Commands (Auto)`).
- Content is derived entirely from verified evidence (see Section 7).
- Examples: `## Commands (Auto)`, `## Gotchas (Auto)`

**Human-owned sections (no suffix):**
- Never modify any content in these sections.
- Do not add, remove, or reorder bullets.
- Do not change wording, formatting, or structure.
- These sections reflect deliberate human decisions.
- Examples: `## Non-Negotiables`, `## Workflow`, `## Rules & Extensions`

**Mixed `(Human + Auto)` sections:**
- Append new items to the end of the section's list.
- Remove items only when there is clear evidence they no longer apply (path deleted, file removed).
- Preserve existing wording exactly — never rephrase, reorder, or reflow.
- Examples: `## Project Structure (Human + Auto)`, `## Pointers (Human + Auto)`

### Concrete Examples

**Machine-owned — before update:**
```markdown
## Commands (Auto)

- Install: `bun install`
- Build: `bun run build`
- Test: `bun test`
```

**Machine-owned — after update (new command discovered):**
```markdown
## Commands (Auto)

- Install: `bun install`
- Build: `bun run build`
- Typecheck: `bun run typecheck`
- Test: `bun test`
- Test single file: `bun test src/tools/goop-status/index.test.ts`
```

The entire section was rewritten with the current verified command set.

**Human-owned — never touched:**
```markdown
## Non-Negotiables

- Runtime: Bun (latest)
- Language: TypeScript strict, ES2022, ESM
- Package manager: bun (never npm/yarn/pnpm)
- Imports: always use `.js` extension for local ESM imports
```

This section is read-only. Even if the agent discovers additional constraints, it must not modify this section.

**Mixed — patch-only edit:**
```markdown
## Project Structure (Human + Auto)

- `src/core/` — Types, config, resolver
- `src/tools/` — MCP tool implementations
- `src/hooks/` — Claude Code plugin hooks
- `src/features/` — Feature modules (memory, state, routing)
- `src/agents/` — Agent definitions and prompt sections  ← existing, preserved
- `src/shared/` — Utilities (logger, paths, ui)            ← existing, preserved
- `references/` — Reference documentation (auto-discovered) ← new, appended
```

Only the new item was appended. Existing items were not touched.

### Fallback: AGENTS.md Without Sentinels

When an AGENTS.md has no sentinel suffixes in any heading:

1. **Treat ALL sections as human-owned.** Do not modify any existing content.
2. **Only append new `(Auto)` sections at the end of the file.**
3. **Never modify, reorder, or restructure existing sections.**

This ensures the auto-update system is safe by default and never damages a hand-written AGENTS.md.

---

## 7. Validation-Gated Update Rules

**Core rule: Only write what was verified. Never speculate.**

Auto-updates must be grounded in evidence from the current milestone. Assumptions, plans, and documentation are not evidence.

### Valid Evidence (Safe to Write)

| Evidence Type | Example |
|--------------|---------|
| Command ran successfully | `bun test` passed during this milestone's execution |
| Build succeeded with configuration | `bun run build` completed without errors |
| Pattern was used and verified | Agent used `createMockPluginContext()` in tests and tests passed |
| Gotcha was encountered and resolved | Discovered that `GOOPSPEC_DEBUG=true` is needed for debug logging |
| Path was created or confirmed to exist | `src/features/memory/` was created and contains working code |

### Invalid Evidence (Must Not Write)

| Evidence Type | Example | Why It's Invalid |
|--------------|---------|-----------------|
| Mentioned in the plan but not verified | BLUEPRINT.md says "use Vitest" but no Vitest tests were run | Plans describe intent, not reality |
| Assumed to work based on documentation | README says `npm run lint` works, but it wasn't executed | Documentation can be stale |
| Worked in a previous milestone but not tested this time | `bun run e2e` passed last month but wasn't run now | Environments change between milestones |
| Inferred from code structure | File exists at `src/utils/` so it's probably important | Existence doesn't confirm relevance or correctness |
| Copied from another project | "All Express apps need CORS middleware" | Generic advice, not repo-specific verified fact |

### Pruning Rules

Remove a pattern from AGENTS.md **only** when there is clear evidence it no longer applies:

- **Remove when:** Command no longer exists in `package.json` scripts. Path was deleted. Pattern was explicitly replaced by a different approach. Tool was uninstalled.
- **Do NOT remove when:** "We didn't use it this milestone." Absence of use is not evidence of obsolescence. The pattern may still be valid for other workflows.

### Decision Flowchart

```
Was this command/pattern/fact verified during this milestone?
├── YES → Was it executed successfully?
│   ├── YES → Safe to write to AGENTS.md
│   └── NO  → Do NOT write (failed evidence is not positive evidence)
└── NO  → Do NOT write (unverified = speculative)

Does an existing AGENTS.md entry have evidence it no longer applies?
├── YES (command removed, path deleted, pattern replaced) → Safe to prune
└── NO  → Keep the existing entry unchanged
```

---

## 8. Auto-Update Process

Step-by-step instructions for agents performing the AGENTS.md update during the accept phase.

### Step 1: Load This Guide

```
goop_reference({ name: "agents-md-guide" })
```

### Step 2: Read Current AGENTS.md

Read the project's `AGENTS.md` from the repository root. If no AGENTS.md exists, skip to Step 9 (create from template).

### Step 3: Gather Milestone Context

Collect evidence from the completed milestone:

```
# What was done and what commands were run
Read(".goopspec/archive/[milestone-slug]/CHRONICLE.md")

# What files were modified and what patterns were used
Read(".goopspec/archive/[milestone-slug]/BLUEPRINT.md")

# Architectural decisions made
Read(".goopspec/ADL.md")

# Recent commits for file change context
git log --oneline -20

# Optionally: file-level change summary
git diff HEAD~20 --stat
```

### Step 4: Identify Update Candidates

For each section type, identify what changed:

| Section | What to Look For |
|---------|-----------------|
| **Commands (Auto)** | Any commands verified during the milestone. Remove commands that no longer work (script removed from `package.json`). |
| **Gotchas (Auto)** | Sharp edges encountered: new env vars, flaky tests, codegen steps, ordering dependencies, race conditions. |
| **Project Structure (Human + Auto)** | New stable directories or files added. Patch-only: append new entries, remove entries for deleted paths. |
| **Non-Negotiables** | Human-owned — **never touch**. |
| **Workflow** | Human-owned — **never touch**. |
| **Rules & Extensions / Pointers** | Human-owned — **never touch**. |

### Step 5: Apply Section Ownership Rules

Follow the ownership model from Section 6 strictly:

1. Identify each section's tier by its heading suffix.
2. For `(Auto)` sections: rewrite with current verified content.
3. For `(Human + Auto)` sections: append new items, remove obsolete items only.
4. For unmarked sections: do not modify.
5. If no sentinels exist: treat all sections as human-owned; only append new `(Auto)` sections at the end.

### Step 6: Apply Validation Gate

For every piece of content you plan to write:

1. Confirm it was verified during this milestone (see Section 7).
2. If not verified, do not write it.
3. For pruning: confirm clear evidence the entry no longer applies.

### Step 7: Update Timestamp

If the AGENTS.md header contains a `**Last verified:**` line, update it:

```markdown
**Last verified:** 2026-02-25 (auto)
```

### Step 8: Write Updated AGENTS.md

Write the updated file to the project root.

### Step 9: Create From Template (If No AGENTS.md Exists)

If no AGENTS.md exists at the project root, create a minimal one using the template skeleton from Section 9. Populate only the `(Auto)` sections with verified content from this milestone. Leave human-owned sections with placeholder comments for the developer to fill in.

---

## 9. Template Skeleton

Recommended AGENTS.md structure optimized for auto-maintenance. Use this when creating a new AGENTS.md or as a reference for restructuring an existing one.

```markdown
# AGENTS

**Purpose:** High-signal, repo-specific instructions for AI coding agents.
**Last verified:** YYYY-MM-DD (auto)

## Quick Start

<!-- Human-owned: brief "clone and go" instructions -->

## Commands (Auto)

<!-- Machine-owned: verified commands from milestone execution -->
- Install: ...
- Build: ...
- Typecheck: ...
- Test: ...
- Test single file: ...
- Lint/format: ...

## Non-Negotiables

<!-- Human-owned: stack choices, forbidden actions, security rules -->
- Runtime/tooling: ...
- Package manager: ...
- Formatting/lint: ...
- Forbidden actions: ... (enforced by hooks when possible)

## Project Structure (Human + Auto)

<!-- Mixed: human sets initial structure, auto appends new stable paths -->
- Entry points: ...
- Key directories: ...
- Where to add new code: ...

## Workflow

<!-- Human-owned: how work should proceed -->
- Explore → Plan → Implement → Verify → Commit
- Commit message format: ...
- PR expectations: ...

## Gotchas (Auto)

<!-- Machine-owned: sharp edges, flaky tests, env vars, codegen steps -->

## Rules & Extensions

<!-- Human-owned: pointers to modular context -->
- Topic rules: `.claude/rules/` (scoped via `paths` frontmatter when needed)
- Reusable workflows: `.claude/skills/`
- Deterministic enforcement: hooks (`.claude/settings.json`)

## Pointers

<!-- Human-owned: links to deeper documentation -->
- Architecture: @docs/architecture.md
- Coding standards: @docs/style.md
```

---

## 10. When to Split

AGENTS.md should stay concise. When it grows, split content into modular documents.

| Trigger | Action |
|---------|--------|
| **A section exceeds ~150–300 lines** | Extract into `.claude/rules/<topic>.md` with appropriate `paths` frontmatter for scoping. |
| **Guidance is procedural and invoked occasionally** | Extract into a skill (`.claude/skills/<workflow>/`). Examples: release flow, migration recipe, deployment checklist. |
| **A rule needs deterministic enforcement** | Move to a hook in `.claude/settings.json`. Keep a one-line reference in AGENTS.md ("enforced by hook"). |
| **Content is path-specific** | Use `.claude/rules/<topic>.md` with `paths` frontmatter to scope it to relevant directories. |

The goal: AGENTS.md is an index and contract. Detail lives elsewhere, loaded on demand.

*Source: Anthropic Claude Code memory.md, skills documentation*

---

## 11. Community References

How other tools approach the same problem.

### Anthropic Claude Code

- **CLAUDE.md** is the primary instruction file, positioned as persistent project instructions.
- **`.claude/rules/*.md`** provide modular, scoped rules with optional `paths` frontmatter.
- **Hooks** (`.claude/settings.json`) enforce deterministic behavior — blocking dangerous commands, running formatters, validating output.
- **Skills** store reusable workflows loaded on demand.
- Best practice: keep CLAUDE.md concise; prune ruthlessly; move hard rules to hooks.

*Source: Anthropic Claude Code memory.md, best-practices.md, hooks documentation*

### Aider

- Uses a small markdown **conventions file** loaded read-only into the session.
- Auto-loaded via `.aider.conf.yml` configuration.
- Community maintains a shared repository of conventions files.
- Philosophy: minimal, read-only, focused on coding conventions.

*Source: Aider conventions documentation, .aider.conf.yml documentation*

---

*AGENTS.md Guide v1.0 — GoopSpec Reference*
*Load via: `goop_reference({ name: "agents-md-guide" })`*
