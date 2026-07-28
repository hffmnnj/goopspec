# GoopSpec

<p align="center">
  <img src=".github/assets/banner.png" alt="GoopSpec - Spec-Driven Development for AI" width="100%" />
</p>

<p align="center">
  <a href="https://github.com/hffmnnj/opencode-goopspec"><img src="https://img.shields.io/badge/version-1.0.0-blue?style=for-the-badge" alt="Version" /></a>
  <a href="https://bun.sh"><img src="https://img.shields.io/badge/Bun-1.0+-f97316?style=for-the-badge&logo=bun&logoColor=white" alt="Bun" /></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.8-3178c6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" /></a>
  <img src="https://img.shields.io/badge/tests-1956%20passing-22c55e?style=for-the-badge" alt="Tests" />
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-22c55e?style=for-the-badge" alt="License" /></a>
</p>

---

You ask for a feature. The model starts editing files within ten seconds, guesses at four decisions you never made, forgets the third requirement by the time it reaches the seventh, and hands you something that runs but isn't the thing you asked for. Then you spend an hour explaining what you meant, and it rewrites the wrong half.

GoopSpec is an [OpenCode](https://opencode.ai) plugin that puts a contract in front of that. You describe what you want. It interviews you, researches the codebase, writes a specification, and shows it to you. Nothing gets built until you say yes. Nothing gets marked done until you say yes again.

```
discuss  -->  plan  -->  execute  -->  accept
   |           |                        |
   |           |                        |
interview   you lock                you sign off
            the spec
```

Underneath that loop sits a SQLite state engine, 14 specialised agents, 35 tools, a memory system that compounds across projects, and a set of runtime hooks that stop the orchestrator from writing code even when it wants to.

---

## Table of Contents

- [Install](#install)
- [The Four Phases](#the-four-phases)
- [The Two Gates](#the-two-gates)
- [Agents and Delegation](#agents-and-delegation)
- [Waves, Tasks, and Atomic Commits](#waves-tasks-and-atomic-commits)
- [State: GoopSpecDB](#state-goopspecdb)
- [Memory and Field Notes](#memory-and-field-notes)
- [The Tool Surface](#the-tool-surface)
- [Structural Code Tools](#structural-code-tools)
- [Image Generation](#image-generation)
- [Deviation Rules](#deviation-rules)
- [Autopilot](#autopilot)
- [Loop Detection](#loop-detection)
- [Thinking Levels](#thinking-levels)
- [Configuration](#configuration)
- [Multi-Workflow](#multi-workflow)
- [Command Reference](#command-reference)
- [How It Plugs In](#how-it-plugs-in)
- [A Real Run](#a-real-run)
- [Development](#development)

---

## Install

Add the plugin to your project's `opencode.json`:

```json
{
  "plugins": ["@goopspec/opencode-plugin"]
}
```

Then, inside OpenCode:

```
/goop-setup
```

The wizard detects your project, creates `.goopspec/`, initialises the SQLite database, writes a config file, and offers to gitignore the directory. Pick your models or take the defaults.

Start working:

```
/goop-discuss "Add dark mode to the settings page"
```

**Requirements:** Bun 1.0 or newer, and OpenCode with `@opencode-ai/plugin ^1.18.0`.

For local development against a checkout, point at the package directory instead:

```json
{
  "plugins": ["/path/to/goopspec/packages/opencode-plugin"]
}
```

---

## The Four Phases

Every workflow moves through four phases plus an `idle` resting state. Transitions are validated, so you can't jump from `discuss` straight to `execute`.

| From | Can go to |
|------|-----------|
| `idle` | `discuss`, `plan` |
| `discuss` | `plan`, `idle` |
| `plan` | `execute`, `discuss`, `idle` |
| `execute` | `accept`, `plan` |
| `accept` | `idle` |

### 1. Discuss

The orchestrator runs a structured discovery interview. It asks about your vision, must-haves, hard constraints, what's explicitly out of scope, the assumptions it's making, and the risks it can see. It also asks whether you want atomic pull requests per wave.

You get `REQUIREMENTS.md` at the end. Every discussion creates a fresh workflow, so parallel efforts never collide.

### 2. Plan

Before any planning happens, a research gate fires. The orchestrator dispatches the researcher (and the explorer alongside it for multi-domain work) to ground the plan in what's actually in your codebase. Findings land in the Field Notes store as `fn_` records, get filtered by importance, and are folded into the planner's brief.

Small workflows skip research: two files or fewer, no new libraries, no architectural decisions, ten requirement bullets or fewer. Every skip is logged to the decision log with its justification.

The planner then produces two documents. `SPEC.md` is the contract: must-haves, nice-to-haves, out of scope, and a traceability matrix mapping each requirement to the wave and task that satisfies it. `BLUEPRINT.md` is the execution plan: risk assessment, deviation protocol, verification criteria, handoff protocol.

Waves and tasks are written to database rows, not prose, so progress can be queried instead of parsed out of markdown.

### 3. Execute

Waves run in order. Each task is dispatched to a specialised executor chosen by scope and blast radius, and each task produces at least one atomic commit. A wave with five tasks yields at least five commits.

Between waves, the orchestrator can dispatch fresh research when a wave surfaced unknowns. It can also compact its own context to reclaim tokens, capturing a handoff snapshot first so the next turn knows exactly where it was.

The orchestrator never writes implementation code. That isn't a guideline in a prompt file; a `permission.ask` hook denies the write at the SDK level if it tries.

### 4. Accept

The verifier audits the implementation against the locked spec, requirement by requirement. Tests run. The acceptance audit tool pulls blockers, verification records, and wave status into one report.

Then it stops and waits for you. The AI cannot mark its own work complete.

When you accept a milestone, the archive pipeline moves the workflow documents aside, generates a retrospective, extracts the learnings, and writes them into memory with semantic concepts attached, so the next project starts smarter than this one did.

---

## The Two Gates

### Contract gate (end of plan)

```
+-------------------------------------------------------+
|  CONTRACT GATE                                        |
+--------------------------+----------------------------+
|  MUST-HAVES              |  OUT OF SCOPE              |
|  - Login with email      |  - OAuth                   |
|  - Session persistence   |  - Password reset          |
|  - Inline error messages |                            |
+--------------------------+----------------------------+
|  Type "confirm" to lock. Changes require /goop-amend. |
+-------------------------------------------------------+
```

In `strict` enforcement, the spec has to carry all five sections before it can lock: vision, must-haves, out of scope, risks, and constraints. An empty section blocks the lock.

Once locked, the spec is read-only to every executor. Changing it takes `/goop-amend`, which runs an impact analysis, logs the change, and adjusts the affected waves.

### Acceptance gate (end of execute)

```
+-------------------------------------------------------+
|  ACCEPTANCE GATE                                      |
+-------------------------------------------------------+
|  [x] Login with email        auth.test.ts:15          |
|  [x] Session persistence     session.test.ts:42       |
|  [x] Inline error messages   manual check             |
|                                                       |
|  Tests: 24/24   Typecheck: clean   Blockers: 0        |
+-------------------------------------------------------+
|  Type "accept" to confirm completion.                 |
+-------------------------------------------------------+
```

Neither gate can be bypassed. Autopilot doesn't relax them. There is no config flag that turns them off.

---

## Agents and Delegation

One orchestrator, thirteen specialists. The orchestrator coordinates and never implements.

| Agent | What it does | Default model |
|-------|--------------|---------------|
| `goop-orchestrator` | Coordinates every task, enforces the gates, tracks progress | `claude-opus-4-6` |
| `goop-planner` | Spec, blueprint, wave decomposition, traceability matrix | `claude-opus-4-6` |
| `goop-executor-high` | Architecture, complex algorithms, security, API design | `claude-opus-4-6` |
| `goop-executor-medium` | Business logic, utilities, tests, refactors, bug fixes | `claude-sonnet-4-6` |
| `goop-executor-low` | Config, renaming, scaffolding, markdown, boilerplate | `claude-sonnet-4-6` |
| `goop-executor-frontend-high` | Design systems, accessibility, animation, visual polish | `claude-opus-4-6` |
| `goop-executor-frontend-medium` | Component work, state wiring, moderate UI refactors | `claude-sonnet-4-6` |
| `goop-executor-frontend-low` | Markup, design tokens, copy, simple styling | `claude-sonnet-4-6` |
| `goop-researcher` | Domain research, technology evaluation, synthesis | `claude-sonnet-4-6` |
| `goop-explorer` | Codebase mapping, pattern detection, reconnaissance | `claude-sonnet-4-6` |
| `goop-verifier` | Verification against the spec, security audit, trusts nothing | `claude-sonnet-4-6` |
| `goop-tester` | Test authoring, coverage, edge cases | `claude-sonnet-4-6` |
| `goop-debugger` | Hypothesis-driven root cause analysis | `claude-sonnet-4-6` |
| `goop-writer` | Documentation and technical writing | `claude-sonnet-4-6` |

### Six executor tiers

Work is routed by weight, not by whatever model happens to be cheapest.

| Tier | Route here when the task is |
|------|------------------------------|
| `low` | Mechanical and pattern-following: config edits, renames, scaffolding, docs |
| `medium` | Standard application work: business logic, tests, most refactors, most bug fixes |
| `high` | Architecture-sensitive, security-sensitive, or wide blast radius |
| `frontend-low` | UI mechanics: markup, spacing, copy, design tokens |
| `frontend-medium` | Components, state wiring, moderate refactors inside existing patterns |
| `frontend-high` | Design judgment: component architecture, a11y, interaction design |

Medium is the default on both tracks. High is for work that genuinely warrants it.

### Auto-delegation

Research and debugging need no slash command. Intent detection routes them:

```
"compare the auth libraries that fit this stack"   →  goop-researcher
"debug why sessions drop after 15 minutes"         →  goop-debugger
"map how the payment flow is wired"                →  goop-explorer
```

### Response contract

Every subagent returns the same five sections: `STATUS`, `SUMMARY`, `ARTIFACTS`, `VERIFICATION`, `NEXT`. The orchestrator routes on status. `complete` continues, `partial` resumes, `blocked` triggers the deviation rules, `checkpoint` writes a handoff document.

---

## Waves, Tasks, and Atomic Commits

A blueprint decomposes into ordered waves. Waves run sequentially; tasks inside a wave can run in parallel when they don't overlap.

```
Wave 1  Foundation                                    [done]
  1.1  notifications table + migration     executor-high    [x]
  1.2  TypeScript interfaces               executor-low     [x]

Wave 2  Core                                          [done]
  2.1  notification service                executor-medium  [x]
  2.2  mark-as-read endpoint               executor-medium  [x]

Wave 3  Interface                                  [running]
  3.1  NotificationBadge                   frontend-medium  [~]
  3.2  NotificationDropdown                frontend-high    [ ]
  3.3  preferences page                    frontend-medium  [ ]
```

Commit rules are strict. One commit per task minimum, conventional format, and no reference to GoopSpec internals in the message. Reviewers reading your history should see clean engineering, not workflow metadata.

If you opt into atomic pull requests during discovery, each wave gets a branch and a PR. `goop_create_pr` runs a terminology gate first, scanning the title, body, and branch name against 17 internal terms. "Wave" becomes "phase", "chronicle" becomes "change log". Error-severity matches block the PR outright.

---

## State: GoopSpecDB

Everything lives in one SQLite database at `.goopspec/goopspec.db` (schema version 6, WAL mode, FTS5 indexes). Markdown files on disk are rendered sidecars, readable by humans and regenerated on every write. The database is the truth.

### Tables

| Table | Holds |
|-------|-------|
| `workflows` | Per-workflow persisted state |
| `documents` | Spec, blueprint, chronicle, ADL, handoff, requirements, research |
| `doc_sections` | Structured sections, so agents patch a section instead of rewriting a file |
| `waves` | Wave metadata: number, title, status, PR branch, PR URL |
| `wave_tasks` | Tasks within a wave: index, description, assigned agent, status |
| `traceability` | Requirement → wave → task mapping with status |
| `verifications` | Per-wave check results: typecheck, test, lint, custom |
| `blockers` | Open and resolved blockers with severity |
| `decisions` | Structured decision log, queryable by rule and type |
| `chronicle_events` | Timestamped progress log |
| `events` | Append-only workflow event stream |
| `field_notes` | Cross-project knowledge base |

Two views (`v_wave_progress`, `v_workflow_summary`) roll those up. Three FTS5 virtual tables index documents, sections, and field notes with a porter tokenizer and prefix search.

### Durability

State mutations run inside transactions. Before mutating, the state manager re-reads the persisted row and applies cached changes on top, so a stale in-memory snapshot can't clobber a concurrent write.

A regression check rejects any snapshot that would erase durable progress: switching the active workflow, moving a phase backwards, unsetting `interviewComplete`, `specLocked`, or `acceptanceConfirmed`, or lowering the wave counter.

### On disk

```
.goopspec/
├── goopspec.db                 # source of truth
├── memory.db                   # episodic + semantic memory
├── config.json                 # project config written by /goop-setup
├── generated-images/           # generate_image output
├── PROJECT_KNOWLEDGE_BASE.md   # stack, conventions, gotchas
└── <workflow-id>/
    ├── SPEC.md                 # rendered sidecar
    ├── BLUEPRINT.md
    ├── CHRONICLE.md
    ├── REQUIREMENTS.md
    ├── ADL.md
    ├── HANDOFF.md
    └── checkpoints/
```

---

## Memory and Field Notes

Two stores with different jobs.

### Memory

Project-scoped episodic memory in `.goopspec/memory.db`, running in-process on `bun:sqlite`. No worker, no daemon, no port to configure.

Search is multi-signal. BM25 relevance across a weighted FTS5 index (title 10, content 5, facts 2, concepts 2) gets multiplied by importance, then by an exponential recency decay, then by a concept and fact overlap boost worth up to 30%.

```typescript
memory_save({
  type: "decision",
  title: "Chose jose over jsonwebtoken",
  content: "jsonwebtoken has no clean ESM path under Bun.",
  concepts: ["auth", "jwt", "esm"],
  facts: ["jose is ESM-native", "jsonwebtoken requires CJS interop"],
  importance: 8
})
```

Pass `deduplicate: true` and the save path checks 20 FTS candidates for a near-duplicate using bounded token-overlap F1. Above 0.85 similarity it reinforces the existing entry (taking the higher importance, refreshing the timestamp) instead of adding a row. Nothing is ever deleted silently.

Types are `observation`, `decision`, `note`, and `todo`, with importance defaults of 5, 7, 4, and 4 respectively.

### Field Notes

Field Notes are global. They live in the shared database, carry an optional project and workflow scope, and survive across every repository you use GoopSpec in. When the researcher solves a hard problem in one project, the next project inherits the answer.

Notes are IDed as `fn_YYYYMMDD_xxxxxxxx` and searched through FTS5 with tag matching. Retrieval supports snippet mode by default, full bodies on request, and offset-based slicing for long notes.

Injection is automatic. On every system transform, notes scoped to the current workflow with importance 8 or higher are pulled, budgeted to roughly 300 tokens, and injected as a `<goopspec_field_notes>` block. Memory gets its own block under a separate token budget. Both are session-cached with a 30-second TTL so the query doesn't run on every keystroke.

`memory_search` can fuse both stores with reciprocal rank fusion by passing `includeFieldNotes: true`.

---

## The Tool Surface

35 tools, registered once and available under both plugin contracts.

### Workflow and state

| Tool | Purpose |
|------|---------|
| `goop_status` | Current phase, gates, wave progress, next command |
| `goop_state` | The only sanctioned state mutation boundary (16 actions) |
| `goop_boot` | State, documents, notes, memory, and references in one call |
| `goop_compact` | Trigger session compaction with a handoff snapshot |
| `goop_checkpoint` | Save, load, and list execution checkpoints |
| `goop_setup` | Setup and configuration wizard |
| `goop_get_global_config` | Read the global config file |
| `goop_reference` | Load reference documents and templates |
| `slashcommand` | Execute a GoopSpec slash command |

### Documents

| Tool | Purpose |
|------|---------|
| `goop_read_db` / `goop_write_db` | Read and write whole workflow documents |
| `goop_read_section` / `goop_write_section` | Read and write structured sections |
| `goop_append_chronicle` | Append a chronicle entry, optionally with an ADL entry and memory in the same call |
| `goop_search_docs` | Full-text search across every workflow's documents |
| `goop_spec` | Read, list, or validate spec and blueprint |

### Waves and tracking

| Tool | Purpose |
|------|---------|
| `goop_write_wave` / `goop_read_wave` | Wave and task rows, verifications, traceability |
| `goop_blocker` | Open, resolve, and list blockers |
| `goop_adl` | Read and append the Automated Decision Log |
| `goop_query_decisions` | Query structured decisions by rule or type, across workflows |
| `goop_acceptance_audit` | One-call acceptance gate report |
| `goop_timeline` | Chronological audit trail for a workflow |
| `goop_dashboard` | Cross-workflow board with phases, progress, and blockers |

### Knowledge

`goop_save_note`, `goop_search_notes`, `memory_save`, `memory_search`, `memory_forget`.

### Everything else

`goop_create_pr`, `goop_infer_intent` (voice transcript classification), `ast_grep`, `difftastic`, `scip`, `generate_image`.

### Batch mode

Five write tools take an `items[]` array to collapse a multi-write turn into one transaction: `goop_write_db`, `goop_write_section`, `goop_write_wave`, `goop_save_note`, and `goop_blocker`. `goop_append_chronicle` takes `entries[]`. Read tools take plural filters (`doc_types`, `section_keys`, `wave_numbers`) for the same reason.

---

## Structural Code Tools

Three tools that reason about syntax trees instead of lines. Each resolves its binary from `PATH` first, then from `binaryPaths` in your config. A missing binary degrades to an install hint instead of throwing.

**`ast_grep`** finds and rewrites by AST pattern. Dry-run by default; pass `apply: true` to write.

```
pattern: "console.log($$$ARGS)"
rewrite: "logger.debug($$$ARGS)"
language: "typescript"
```

**`difftastic`** diffs structurally and returns a `meaningfully_changed` boolean. The verifier uses it to skip re-reviewing diffs that are pure formatting.

**`scip`** answers definitions, references, and implementations from a SCIP index, and can generate one via `scip-typescript`. Useful for impact analysis before a refactor.

---

## Image Generation

`generate_image` runs on `gpt-image-2` through your existing ChatGPT OAuth credentials. No API key. Credentials resolve from an explicit `authFile`, then environment variables, then XDG config paths, then `~/.codex/` and `~/.gpt-image/`.

Output defaults to `.goopspec/generated-images/`. Pass `out` to place it anywhere. Up to five reference images can condition an edit or variation, and `count` generates up to four at once.

Transparency is the interesting part. The API has no transparent background mode, so `background: "transparent"` injects a green-screen instruction into the prompt and then keys the green out locally with `pngjs`. That keying always encodes PNG, so a non-`.png` output path gets rejected during validation, before you've burned a generation on it. Green subjects are preserved beyond the key tolerance so a green jacket doesn't become a hole.

`dryRun: true` returns the constructed request with the bearer token redacted.

Orchestrator access is scoped: image generation is allowed during `discuss` and `plan` for mockups and concept boards, and nowhere else. It grants no other write authority.

---

## Deviation Rules

When an executor hits something unexpected mid-task, four rules decide what happens.

| Rule | Trigger | Action |
|------|---------|--------|
| 1 | Logic, type, runtime, or security bugs | Fix it, log it |
| 2 | Missing validation, error handling, auth checks, rate limiting | Add it, log it |
| 3 | Broken imports, missing dependencies, config errors | Unblock it, log it |
| 4 | Schema changes, framework swaps, breaking APIs, new infrastructure | Stop and ask |

Unsure which applies? Default to Rule 4. Every application writes rule number, issue, action taken, and affected files to the decision log, and `goop_query_decisions` can search that log across every workflow you've run.

### Boundaries

Three tiers, enforced by hooks and config:

```json
{
  "boundaries": {
    "always":    ["run_tests_before_commit"],
    "ask_first": ["schema_changes", "new_dependencies"],
    "never":     ["commit_secrets"]
  }
}
```

---

## Autopilot

Two levels, both bounded by the same two gates.

**Regular autopilot** advances phases without asking. It stops for Rule 4 architectural decisions, credentials, and destructive operations.

**Lazy autopilot** goes further: it skips the discovery interview and infers requirements from your prompt, skips in-flight questions, and skips the contract-gate confirmation pause. It stops only for credentials and destructive operations.

Neither touches the acceptance gate. That one is absolute.

### The nudge

Prose in a prompt file doesn't reliably stop a model from pausing to ask permission it doesn't need. So lazy autopilot has runtime enforcement. When a session goes idle during `execute`, a nudge fires telling the agent to keep going.

Defaults: `enabled: true`, `cap: 5`, `cooldownMs: 30000`.

Nine guards suppress it:

| Guard | Suppressed because |
|-------|--------------------|
| G1 | Lazy autopilot is off |
| G2 | Phase isn't `execute` |
| G3 | A compaction is queued or in flight |
| G4 | Acceptance hasn't been confirmed |
| G5 | An open high or critical blocker exists |
| G6 | The last assistant message matched a credentials or destructive-action pattern |
| G7 | The last message came from the user, not the assistant |
| G8 | Cap reached or cooldown active |
| G9 | The config kill switch is off |

Progress is fingerprinted as `<phase>|<currentWave>|<task-status-digest>`, where the digest lists `task_index:status` for every task in the current wave. The consecutive counter resets only when that fingerprint changes, so five nudges against identical state means the loop is going nowhere.

At the cap, the system abandons deliberately and tells you why, then writes a chronicle event and an ADL observation. Set `lazyAutopilotNudge.enabled: false` to switch it off entirely.

---

## Loop Detection

Separate from the nudge, and pointed the other way. A hook watches tool executions and catches agents repeating identical calls with identical arguments and identical output.

| Setting | Default | Effect |
|---------|---------|--------|
| `enabled` | `true` | Master switch |
| `tier1Threshold` | `3` | Identical calls before the output is rewritten with a stop directive |
| `tier2Threshold` | `4` | Count before a soft warning is appended |
| `windowSize` | `5` | History window used for classification |

Tier 1 also denies repeated permission requests, which is how a stuck agent usually manifests.

---

## Thinking Levels

Reasoning effort is configured per role with plain text labels, resolved against the live model catalog instead of a hard-coded budget table.

Five levels: `none`, `low`, `medium`, `high`, `xhigh`. `none` is a real variant, not a budget of zero.

```json
{
  "agentThinkingLevels": {
    "explorer": "medium",
    "executor-low": "low",
    "executor-high": "xhigh",
    "orchestrator": "high"
  }
}
```

Defaults: `explorer` and `researcher` get `medium`, the other twelve roles get `high`.

Resolution walks the V2 catalog first (reading `model.variants[]` for the exact supported id plus the provider request body), falls back to the V1 provider catalog, and finally preserves the provider default. Providers differ (`reasoningEffort`, `reasoning.effort`, `thinking.budgetTokens`, `thinkingConfig`, `reasoningConfig`) and the resolver maps to whichever the target model actually accepts.

If a configured label isn't supported, GoopSpec preserves the provider default and warns. It never silently downgrades `xhigh` to `high`, and it never fails a dispatch over a reasoning setting.

Legacy numeric `agentThinkingBudgets` still works. When a role has both, the label wins.

---

## Configuration

### Precedence

Three sources, deep-merged per key:

```
goopspec.json                          (project root, highest)
  └─ .goopspec/config.json             (written by /goop-setup)
      └─ ~/.config/opencode/goopspec.json   (global, lowest)
```

Scalars overwrite. Maps (`agentModels`, `agentThinkingLevels`, `binaryPaths`, `loopDetection`, `lazyAutopilotNudge`) merge key by key, so a project can override one role and inherit the rest.

Set `GOOPSPEC_GLOBAL_CONFIG_PATH` to relocate the global file.

### Every key

| Key | Type | Default | Does |
|-----|------|---------|------|
| `projectName` | string | directory name | Name shown in workflow documents and status |
| `defaultModel` | string | unset | Blanket model for all 14 roles, below per-role overrides |
| `enforcement` | `assist` / `warn` / `strict` | unset | How hard phase rules are applied |
| `adlEnabled` | boolean | unset | Decision log tracking |
| `memoryEnabled` | boolean | `true` | In-process memory |
| `gitignoreGoopspec` | boolean | unset | Whether setup added `.goopspec/` to `.gitignore` |
| `agentModels` | map | `{}` | Per-role model, keyed by bare role name |
| `agentThinkingLevels` | map | `{}` | Per-role reasoning label |
| `agentThinkingBudgets` | map | `{}` | Legacy numeric budgets, superseded by labels |
| `binaryPaths` | map | `{}` | Paths for `ast-grep`, `difft`, `scip`, `scip-typescript` |
| `loopDetection` | object | see above | Loop detection thresholds |
| `lazyAutopilotNudge` | object | see above | Nudge cap, cooldown, kill switch |

```json
{
  "projectName": "my-app",
  "enforcement": "strict",
  "memoryEnabled": true,
  "agentModels": {
    "orchestrator": "anthropic/claude-opus-4-6",
    "executor-medium": "anthropic/claude-sonnet-4-6",
    "executor-frontend-high": "anthropic/claude-opus-4-6"
  },
  "agentThinkingLevels": {
    "executor-low": "low",
    "planner": "xhigh"
  },
  "binaryPaths": {
    "ast-grep": "/usr/local/bin/ast-grep",
    "difft": "/usr/local/bin/difft"
  },
  "lazyAutopilotNudge": { "enabled": true, "cap": 5, "cooldownMs": 30000 }
}
```

The older `agents` block (goop-prefixed keys with `{ model, temperature }`) still parses, along with `orchestrator.model` and `orchestrator.thinkingBudget`. When both old and new forms are present, `agentModels` wins.

### Hot reload

A watcher tracks the project-root `goopspec.json` with a 100ms debounce. It watches the parent directory so atomic file replacement doesn't break it, and validates the parsed JSON before delivery.

Under V2, a reload re-runs the agent and catalog transform pipeline immediately. Under V1, future turns pick up the new options but the agent menu itself needs a restart.

### Modes and depth

| Mode | Behaviour |
|------|-----------|
| `quick` | Skips the interview and the contract gate. Single file, under 30 minutes, no architectural decisions. |
| `standard` | Full workflow. The default. |
| `comprehensive` | Full workflow plus deep research and parallel agents. |
| `milestone` | Full workflow plus archive, retrospective, and a git tag. |

Depth (`shallow`, `standard`, `deep`) is surfaced to agents as a rigor signal rather than a mechanical constraint.

---

## Multi-Workflow

Workflows are independent. Each has its own phase, spec lock, wave counter, documents, and checkpoints. `/goop-discuss` creates a new one every time, so a refactor and a feature can be in flight at once without stepping on each other.

Named workflows get their own directory under `.goopspec/<workflow-id>/`. The default workflow writes to the `.goopspec/` root. Every database row carries a `workflow_id`, so the shared tables stay partitioned.

The active workflow ID is persisted in a metadata row. If it ever points at something missing, the state manager rebinds to the most recently updated workflow instead of failing.

`goop_dashboard` shows every workflow at once: phase, wave progress, open blockers, recent activity. `goop_timeline` drills into one workflow with a merged chronological trail of phase transitions, wave completions, decisions, and chronicle entries.

---

## Command Reference

| Command | What it does |
|---------|--------------|
| `/goop-discuss` | Discovery interview; creates a workflow and `REQUIREMENTS.md` |
| `/goop-plan` | Research gate, spec, blueprint, contract gate, spec lock |
| `/goop-execute` | Wave-based implementation through delegated executors |
| `/goop-accept` | Verification matrix, PR merge, acceptance gate, archive |
| `/goop-quick` | Small bounded task; skips discovery and spec gates |
| `/goop-amend` | Change a locked spec with impact analysis and decision logging |
| `/goop-status` | Phase, gates, blockers, suggested next command |
| `/goop-setup` | Configuration wizard |
| `/goop-help` | Commands, phases, agent roster |

Guards: `/goop-plan` needs a completed interview. `/goop-execute` needs a locked spec. `/goop-accept` needs every wave complete. `/goop-amend` needs a locked spec to amend.

---

## How It Plugs In

### One export, two plugin contracts

GoopSpec ships a single default export that satisfies both the legacy OpenCode plugin contract and the V2 contract:

```typescript
const goopspec: Plugin = async (input) => { /* V1 setup */ };
const v2Plugin = V2Plugin.define({ id: "goopspec", async setup(ctx) { /* V2 */ } });
export default Object.assign(goopspec, v2Plugin);
```

The V1 loader calls the function. The V2 loader reads `.id` and `.setup` off the same object. No config flag, no env var, no runtime heuristic.

All tools and hooks are defined once in the V1 source. V2 adapters iterate over those definitions programmatically, converting Zod argument schemas to JSON Schema and registering them through the V2 runtime. Adding a tool means touching one file, and it appears under both contracts.

### Hooks

Thirteen hook factories run the enforcement that prompts alone can't guarantee.

| Hook | Binds to | Does |
|------|----------|------|
| Agent registration | `config`, `chat.params` | Injects 14 agents and 9 commands; applies model and thinking overrides |
| System transform | `experimental.chat.system.transform` | Injects state, phase rules, document inventory, memory, and field notes |
| Chat message | `chat.message` | Tracks activity, clears stale checkpoints, distils significant prompts to memory |
| Comment checker | `tool.execute.*` | Flags excessive comment ratios and low-value comments on writes |
| Command processor | `command.execute.before` | Syncs the session's workflow binding before any `goop-*` command |
| Orchestrator enforcement | `permission.ask` | Denies orchestrator writes to implementation paths |
| Tool lifecycle | `tool.execute.*` | Timing plus non-blocking memory distillation of significant events |
| Loop detection | `tool.execute.after`, `permission.ask` | Two-tier repeated-call intervention |
| Lazy autopilot nudge | `experimental.chat.system.transform` | Fallback nudge delivery when `promptAsync` is unavailable |
| Auto-progression | `tool.execute.after` | Advances execute to accept when the last wave completes |
| Event handler | `event` | Routes session lifecycle events to the session manager |
| Compaction | `experimental.session.compacting` | Rebuilds workflow context on the far side of a compaction |
| Compaction halt | transform + `tool.execute.after` | Redirects agents that keep working past a queued compaction |

A few of these depend on hook events V2 doesn't expose yet (config, chat message, command, permission, event, and compaction). Under V2 they log the limitation once at startup and stay inert. Everything else adapts.

### Context compaction

Long sessions bleed context. `goop_compact` reclaims it deliberately, and it's orchestrator-only.

Before queuing, it flushes in-memory state to the database and compares the two, warning about any divergent fields. It captures a handoff snapshot holding the full workflow identity, the git branch, and a required `next_step` string describing exactly what happens after the compaction. The survival hook reads that snapshot on the other side, rebinds the workflow if the live binding drifted, and rebuilds context. The snapshot is consumed once, then deleted.

Sensible call points: right after the spec locks, right before acceptance verification, and every three to five waves depending on how heavy they were.

---

## A Real Run

You want notifications in your app.

```
/goop-discuss "Add user notifications"
```

It asks what triggers them, how they should be delivered, whether users configure preferences, what happens on click, and whether you want a PR per wave. You answer. `REQUIREMENTS.md` is written.

```
/goop-plan
```

The researcher maps your existing notification-adjacent code and saves what it finds as Field Notes. The planner turns requirements into a spec with a traceability matrix and a blueprint with three waves. The contract gate shows you must-haves and out-of-scope. You type `confirm`, and the spec locks.

```
/goop-execute
```

Wave 1 lands the schema and types with two commits. Wave 2 adds the service and endpoint. Wave 3 builds the interface, routing the badge to `frontend-medium` and the dropdown to `frontend-high`. Each task commits atomically. The chronicle records what happened; the wave rows record status.

```
/goop-accept
```

The verifier walks the spec line by line, tests run, the acceptance audit pulls blockers and verification records together. You read it. You type `accept`. The milestone archives, the retrospective generates, and the learnings go into memory tagged with concepts that'll surface next time you build something similar.

### Other shapes

```
/goop-quick "Fix the date formatting bug on the dashboard"
```
Skips the gates, still commits atomically, still verifies, still logs the bypass.

```
Users get logged out at random. Find out why.
```
Auto-routes to the debugger. Hypothesis, experiment, analyse, iterate.

```
Map how this codebase handles background jobs.
```
Auto-routes to the explorer.

---

## Development

```bash
bun install

bun run --cwd packages/opencode-plugin build
bun run --cwd packages/opencode-plugin typecheck
bun run --cwd packages/opencode-plugin test
bun run --cwd packages/opencode-plugin lint
```

Targeted test runs:

```bash
bun test packages/opencode-plugin/src/tools/goop-status/index.test.ts
bun test -t "goop_status"
bun test --changed=main            # only tests affected by your diff
bun test --bail=3 --timeout=10000
```

Current suite: **1956 tests, 5140 assertions, 109 files, roughly 13 seconds.**

### Layout

```
packages/opencode-plugin/
├── agents/           # 14 agent definitions
├── commands/         # 9 slash commands
├── references/       # 19 reference documents
├── templates/        # 12 document templates
└── src/
    ├── core/         # types, constants, V1/V2 seams and adapters
    ├── features/     # 16 modules: db, memory, state-manager, setup,
    │                 #   thinking, routing, enforcement, archive,
    │                 #   pr-sanitizer, session, resolver, and more
    ├── hooks/        # 13 hook factories
    ├── shared/       # logger, path resolution
    ├── tools/        # 35 MCP tools, tests co-located
    └── index.ts      # dual V1/V2 export
```

### Conventions

ES2022, NodeNext modules, strict TypeScript with `noUnusedLocals`, `noUnusedParameters`, and `noImplicitReturns`. Local imports carry the `.js` extension. Files are kebab-case, types are PascalCase, constants are UPPER_SNAKE_CASE. Errors log and degrade instead of throwing, because a crashed plugin takes the whole session with it. Tests sit beside the code they cover and use the shared mock factories in `test-utils.ts`.

Read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening a PR. `AGENTS.md` carries the full working guide for AI agents in this repository.

---

## License

MIT. See [LICENSE](./LICENSE).

---

<p align="center">
  <a href="https://github.com/hffmnnj/opencode-goopspec/issues">Issues</a>
  ·
  <a href="https://opencode.ai">OpenCode</a>
</p>
