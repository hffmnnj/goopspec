# GoopSpec

<p align="center">
  <img src=".github/assets/banner.png" alt="GoopSpec - Spec-Driven Development for AI" width="100%" />
</p>

**Stop the AI chaos. Ship what you actually want.**

[![Version](https://img.shields.io/badge/version-1.0.0-blue?style=for-the-badge)](https://github.com/hffmnnj/opencode-goopspec)
[![Bun](https://img.shields.io/badge/Bun-1.0+-f97316?style=for-the-badge&logo=bun&logoColor=white)](https://bun.sh)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178c6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tests](https://img.shields.io/badge/tests-1660%20passing-22c55e?style=for-the-badge)](./TEST-SUMMARY.md)
[![License](https://img.shields.io/badge/license-MIT-22c55e?style=for-the-badge)](./LICENSE)

---

You've been there. You ask an AI to build a feature. It starts coding immediately, misses half your requirements, forgets context mid-conversation, and delivers something that... works? But isn't what you wanted.

**GoopSpec fixes this.**

It's a spec-driven workflow plugin for [OpenCode](https://opencode.ai) that forces clarity *before* code. You describe what you want, GoopSpec interviews you to uncover the edge cases, locks a specification you both agree on, then executes against that contract.

No more "that's not what I meant." No more scope creep. No more AI amnesia.

```
Discuss → Plan (confirm+lock) → Execute → Accept (verify it)
```

---

## Philosophy

- **Ask, Don't Assume** — Interview first, code second
- **Spec as Contract** — Lock requirements before execution
- **Memory-First** — Learn from every project
- **Scale to the Task** — Quick fixes skip gates, big features get the full workflow

---

## The Workflow

```
  DISCUSS        PLAN         EXECUTE        AUDIT        CONFIRM
 ┌────────┐    ┌────────┐    ┌────────┐    ┌────────┐    ┌────────┐
 │  What  │    │  How   │    │ Build  │    │ Verify │    │ Accept │
 │   do   │ ─> │  will  │ ─> │   it   │ ─> │   it   │ ─> │   it   │
 │  you   │    │   we   │    │        │    │        │    │        │
 │ want?  │    │ do it? │    │        │    │        │    │        │
 └────────┘    └────────┘    └────────┘    └────────┘    └────────┘
      |              |             |             |             |
   Interview     Create       Waves of      Check vs.    You sign
   to uncover    locked       atomic        the spec     off on it
   requirements  spec         commits
                    |                                          |
                    └──────── CONTRACT GATE ───────────────────┘
                           (You confirm before and after)
```

### Phase 1: Discuss
GoopSpec interviews you like a product manager. It asks questions, uncovers edge cases, and makes sure it actually understands what you want before touching any code.

### Phase 2: Plan
Your requirements become a locked specification (SPEC.md) and execution blueprint (BLUEPRINT.md). This is the contract — both sides agree on what will be delivered.

### Phase 3: Execute
Wave-based implementation. Tasks run in ordered waves, each with atomic commits. Progress tracked in real-time. Pause and resume anytime.

### Phase 4: Audit
The Verifier agent checks every requirement against the actual implementation. Did we build what we said we'd build? Tests run, code reviewed.

### Phase 5: Confirm
You verify the results and accept the work. The AI can't declare itself done — you have to sign off.

---

## Quick Start

**60 seconds to your first spec-driven feature.**

### 1. Install

Add GoopSpec to your OpenCode config (`opencode.json`):

```json
{
  "plugins": ["@goopspec/opencode-plugin"]
}
```

For local development, point to the built package.

GoopSpec 1.0.0 requires OpenCode with plugin support (`@opencode-ai/plugin ^1.17.0`).

### 2. Configure

Inside OpenCode, run the interactive setup wizard:

```
/goop-setup
```

### 3. Start Building

```
/goop-discuss "Add dark mode to the settings page"
```

GoopSpec interviews you, creates a locked spec, executes in waves, and asks you to verify. Done.

---

## Commands Reference

Nine commands. That's it.

### Workflow Commands

| Command | Description |
|---------|-------------|
| `/goop-discuss` | Start discovery interview — capture requirements |
| `/goop-plan` | Create SPEC.md and BLUEPRINT.md from requirements |
| `/goop-execute` | Begin wave-based implementation |
| `/goop-accept` | Verify and accept the work (acceptance gate) |

### Task Mode Commands

| Command | Description |
|---------|-------------|
| `/goop-quick [task]` | Fast-track a small, bounded task (skips discovery/spec gates) |
| `/goop-amend [change]` | Propose a change to a locked spec |

### Utility Commands

| Command | Description |
|---------|-------------|
| `/goop-status` | Show current workflow state |
| `/goop-setup` | Configure models, project name, enforcement |
| `/goop-help` | Show available commands and phase guide |

### Auto-Delegation

Research and debug don't need slash commands in 1.0.0. The orchestrator detects intent and routes you automatically:

- "I need to investigate the best auth library for this project" → auto-routes to `goop-researcher`
- "debug why login fails" → auto-routes to `goop-debugger`

Just describe the problem naturally.

---

## The Agents

GoopSpec uses an orchestrator + specialist model. The Orchestrator (**The Conductor**) never writes code — it coordinates work by delegating to 12 specialized agents.

Each agent has a default model optimized for its task. **All models are configurable via `/goop-setup`.**

### The Orchestrator

**goop-orchestrator** — *The Conductor*

- Coordinates all work through delegation
- Maintains clean context across tasks
- Tracks progress in CHRONICLE.md
- Applies deviation rules automatically
- Presents contract gates for your confirmation

The Conductor never writes implementation code. It directs specialists.

### The Specialists

| Agent | Alias | What They Do |
|-------|-------|--------------|
| `goop-executor-low` | The Builder (Low) | Mechanical tasks: config, renaming, markdown, scaffolding |
| `goop-executor-medium` | The Builder (Medium) | Business logic, utilities, tests, refactoring |
| `goop-executor-high` | The Builder (High) | Architecture, complex algorithms, security-sensitive work |
| `goop-executor-frontend-low` | The Builder (Frontend Low) | UI markup, simple styling, copy |
| `goop-executor-frontend-high` | The Builder (Frontend High) | Design-sensitive UI, components, UX, accessibility |
| `goop-planner` | The Architect | Creates SPEC.md and BLUEPRINT.md |
| `goop-researcher` | The Scholar | Deep domain research |
| `goop-explorer` | The Scout | Fast codebase mapping |
| `goop-verifier` | The Auditor | Verifies against spec |
| `goop-debugger` | The Detective | Scientific debugging |
| `goop-tester` | The Guardian | Test writing, coverage |
| `goop-writer` | The Scribe | Documentation |

### Executor Tier System

GoopSpec routes implementation work through five executor tiers so each task gets the right model for the job. This improves cost efficiency on simple tasks while preserving quality on complex and frontend-heavy work.

#### Tier Overview

| Tier | Scope | Example Tasks |
|------|-------|---------------|
| `goop-executor-low` | Config files, simple edits, renaming, dependency updates, markdown, boilerplate | Rename files, update config flags, scaffold command docs |
| `goop-executor-medium` | Business logic, utilities, middleware, data transforms, tests, refactoring | Add service logic, write unit tests, refactor utilities |
| `goop-executor-high` | Architecture, complex algorithms, DB schemas, API design, security | Design API contracts, implement auth flow, optimize core algorithms |
| `goop-executor-frontend-low` | UI markup, styling tweaks, copy updates, simple layouts | Adjust spacing, update labels, scaffold a form |
| `goop-executor-frontend-high` | Components, UX, responsive design, accessibility, visual polish | Build a design system component, implement keyboard navigation, refactor a complex interaction |

#### Default Models

| Tier | Default Model |
|------|---------------|
| `goop-executor-low` | `anthropic/claude-sonnet-4-6` |
| `goop-executor-medium` | `anthropic/claude-sonnet-4-6` |
| `goop-executor-high` | `anthropic/claude-opus-4-6` |
| `goop-executor-frontend-low` | `anthropic/claude-sonnet-4-6` |
| `goop-executor-frontend-high` | `anthropic/claude-opus-4-6` |

#### Tier Classification Quick Reference

| If the task is mostly... | Use this tier |
|--------------------------|---------------|
| Mechanical edits, setup, docs, and simple file changes | `goop-executor-low` |
| Typical application logic, middleware, data processing, and tests | `goop-executor-medium` |
| Architecture, security, schema/API design, or high-complexity logic | `goop-executor-high` |
| Simple UI markup, styling, or copy | `goop-executor-frontend-low` |
| Complex components, UX, accessibility, or design-sensitive work | `goop-executor-frontend-high` |

#### Configuration via Setup

Run `/goop-setup` to select models for each executor tier. The setup wizard saves your selections to `.goopspec/config.json`.

```json
{
  "agents": {
    "goop-executor-low": { "model": "anthropic/claude-sonnet-4-6" },
    "goop-executor-medium": { "model": "anthropic/claude-sonnet-4-6" },
    "goop-executor-high": { "model": "anthropic/claude-opus-4-6" },
    "goop-executor-frontend-low": { "model": "anthropic/claude-sonnet-4-6" },
    "goop-executor-frontend-high": { "model": "anthropic/claude-opus-4-6" }
  }
}
```

---

## Planning Files

GoopSpec stores project state in **GoopSpecDB** (`.goopspec/goopspec.db`). Markdown files under `.goopspec/<workflowId>/` are rendered sidecars from the DB — human-readable, but the DB is the source of truth.

| File | Purpose |
|------|---------|
| `SPEC.md` | Locked specification with must-haves |
| `BLUEPRINT.md` | Execution plan with waves and tasks |
| `CHRONICLE.md` | Journey log tracking progress |
| `REQUIREMENTS.md` | Captured requirements from discovery |
| `ADL.md` | Automated Decision Log |
| `RETROSPECTIVE.md` | Post-completion analysis |
| `LEARNINGS.md` | Extracted patterns and insights |

### Directory Structure

```
.goopspec/
├── goopspec.db           # Source of truth (SQLite)
├── memory.db             # Episodic memory
├── config.json           # Project configuration
├── <workflow-id>/        # One dir per workflow
│   ├── SPEC.md           # Rendered sidecar
│   ├── BLUEPRINT.md      # Rendered sidecar
│   ├── CHRONICLE.md      # Rendered sidecar
│   ├── ADL.md            # Rendered sidecar
│   └── REQUIREMENTS.md   # Rendered sidecar
└── PROJECT_KNOWLEDGE_BASE.md
```

---

## Deviation Rules

GoopSpec uses a 4-rule system for handling unexpected situations:

### Rule 1: Auto-Fix Bugs
Fix immediately without asking:
- Type errors, logic bugs, runtime errors
- Security vulnerabilities (SQL injection, XSS)
- Memory leaks, race conditions

### Rule 2: Auto-Add Critical Functionality
Add immediately without asking:
- Error handling (try-catch, promise rejection)
- Input validation and sanitization
- Authentication/authorization checks

### Rule 3: Auto-Fix Blocking Issues
Fix immediately without asking:
- Missing dependencies
- Broken import paths
- Configuration errors

### Rule 4: Ask About Architectural Changes
**STOP and ask** before:
- Database schema changes
- Framework/library switches
- Breaking API changes
- New infrastructure

All deviations are logged to the Automated Decision Log (ADL).

---

## Memory System

GoopSpec remembers everything important:

### Automatic Capture
- Decisions and their reasoning
- Patterns that worked well
- Gotchas and pitfalls encountered
- User preferences discovered

### Recall

Just ask naturally:

```
How did we handle auth before?
```

GoopSpec searches past projects and surfaces relevant learnings.

### Field Notes

GoopSpec includes a global Field Notes system. Agents save important research findings as Field Notes to a persistent, searchable store that persists across projects. This means learnings compound over time — an agent that solved a problem in one project surfaces that knowledge automatically in the next.

### Archive-to-Memory Pipeline
When milestones complete:
1. Generate RETROSPECTIVE.md
2. Extract LEARNINGS.md (patterns, decisions, gotchas)
3. Persist learnings to memory with semantic concepts
4. Future projects benefit from past experience

---

## Known Limitations

- GoopSpec 1.0.0 requires OpenCode with plugin support (`@opencode-ai/plugin ^1.17.0`)

---

## Contract Gates

Two points where you must confirm. This is what makes GoopSpec different — the AI can't just declare itself done.

### Contract Gate (End of Plan, Before Execution)

```
+-------------------------------------------------------+
|  CONTRACT GATE                                        |
+-------------------------------------------------------+
|  MUST-HAVES:           | OUT OF SCOPE:                |
|  • Login with email    | • OAuth (future)             |
|  • Session persistence | • Password reset             |
|  • Error messages      |                              |
+-------------------------------------------------------+
|  Type "confirm" to lock. Changes require /goop-amend. |
+-------------------------------------------------------+
```

Once locked, this is the contract. Both you and the AI know exactly what will be built.

### Accept Gate (After Execution)

```
+-------------------------------------------------------+
|  ACCEPTANCE GATE                                      |
+-------------------------------------------------------+
|  VERIFIED:                                            |
|  ✓ Login with email       (test: auth.test.ts:15)    |
|  ✓ Session persistence    (test: session.test.ts:42) |
|  ✓ Error messages         (manual check)             |
|                                                       |
|  Tests: 24/24 | Build: OK                             |
+-------------------------------------------------------+
|  Type "accept" to confirm completion.                 |
+-------------------------------------------------------+
```

The AI can't mark itself done. You verify, you accept.

---

## Example: Building a Feature

Here's what it actually looks like to build a feature with GoopSpec.

**You want:** Add user notifications to your app.

### Step 1: Discuss

```
/goop-discuss "Add user notifications"
```

GoopSpec asks questions:
```
> What triggers notifications? (new messages, mentions, system alerts?)
> How should they be delivered? (in-app, email, push?)
> Do users need to configure notification preferences?
> What happens when a notification is clicked?
```

You answer. GoopSpec builds understanding.

### Step 2: Plan

```
/goop-plan
```

GoopSpec creates:
- **SPEC.md** — Must-haves and out-of-scope
- **BLUEPRINT.md** — Waves of tasks with acceptance criteria

### Step 3: Plan Contract Gate

```
+--------------------------------------------------------+
|  CONTRACT GATE                                          |
+--------------------------------------------------------+
|  MUST-HAVES:                                            |
|  • In-app notification badge on header                  |
|  • Notification dropdown with mark-as-read              |
|  • User preferences page for notification types         |
|                                                         |
|  OUT OF SCOPE: Email notifications, push notifications  |
+--------------------------------------------------------+
|  Type "confirm" to lock this specification.             |
+--------------------------------------------------------+
```

You type `confirm`. The spec is now locked.

### Step 4: Execute

```
/goop-execute
```

GoopSpec executes in waves:
```
Wave 1: Foundation (DB schema, types)
  ✓ Task 1.1: Create notifications table
  ✓ Task 1.2: Add TypeScript interfaces

Wave 2: Core (business logic)
  ✓ Task 2.1: Notification service
  ✓ Task 2.2: Mark-as-read endpoint

Wave 3: UI (components)
  ✓ Task 3.1: NotificationBadge component
  ✓ Task 3.2: NotificationDropdown component
  ✓ Task 3.3: Preferences page
```

Each task gets an atomic commit.

### Step 5: Accept (Acceptance Gate)

```
+--------------------------------------------------------+
|  ACCEPTANCE GATE                                        |
+--------------------------------------------------------+
|  VERIFIED:                                              |
|  ✓ In-app notification badge — test: header.test.ts    |
|  ✓ Notification dropdown — test: dropdown.test.ts      |
|  ✓ User preferences page — manual verification          |
|                                                         |
|  Tests: 12/12 passing | Build: Successful               |
+--------------------------------------------------------+
|  Type "accept" to confirm completion.                   |
+--------------------------------------------------------+
```

You type `accept`. Done.

---

## Other Use Cases

### Quick Bug Fix

```
/goop-quick "Fix the date formatting bug in the dashboard"
```

Skips gates, ships fast, still makes atomic commit.

### Major Refactor

```
/goop-discuss "v2.0 Database Migration"
```

Full workflow with deep research, locked spec with rollback plan, multi-wave execution, and archived learnings.

### Brownfield Project

```
Research the codebase structure and the patterns this project uses.
```

GoopSpec auto-delegates to the explorer agent to map existing stack, patterns, and integration points.

### Systematic Debugging

```
Users are getting logged out randomly. Debug it.
```

GoopSpec auto-delegates to the debugger agent: hypothesis → experiment → analyze → iterate.

---

## Configuration

Configure via `.goopspec/config.json` after running `/goop-setup`. Key settings:

- **agents.{name}.model** — Model for specific agents
- **enforcement** — `assist`, `warn`, or `strict`
- **memory.enabled** — Persistent memory on/off

Memory runs in-process via `bun:sqlite` — no separate worker or service to configure.

---

## Contributing

We welcome contributions! Please read our [Contributing Guide](./CONTRIBUTING.md) for details.

### Development

```bash
# Install dependencies
bun install

# Run tests
bun test

# Type check
bun run typecheck

# Build
bun run build
```

### Project Structure

```
goopspec/
├── packages/
│   └── opencode-plugin/    # @goopspec/opencode-plugin
│       ├── agents/         # 13 agent markdown definitions
│       ├── commands/       # 9 slash command definitions
│       ├── references/     # 13 consolidated reference documents
│       ├── templates/      # File templates
│       └── src/
│           ├── core/       # Types, config, resolver
│           ├── features/   # Feature modules (memory, state, db, routing, model-routing)
│           ├── hooks/      # OpenCode plugin hooks
│           ├── shared/     # Utilities (logger, paths)
│           └── tools/      # MCP tool implementations
└── .github/                # CI workflows, issue templates
```

---

## License

MIT License. See [LICENSE](./LICENSE) for details.

---

## Acknowledgments

GoopSpec builds on ideas from:
- [OpenCode](https://opencode.ai) - The AI coding assistant platform
- Structured task execution and spec-driven development patterns

---

<div align="center">

**Built with care by developers, for developers.**

[Issues](https://github.com/hffmnnj/opencode-goopspec/issues)

</div>
