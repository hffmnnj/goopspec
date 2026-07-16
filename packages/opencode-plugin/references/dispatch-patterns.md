# Dispatch Patterns

How the orchestrator delegates work to the right agent at the right time.

## Conductor Identity

The orchestrator coordinates and delegates. It never implements.

- Every implementation action goes to an executor, no matter how small.
- If the orchestrator is writing code, editing source files, or running implementation commands, it is violating the contract.
- This applies more during autopilot, because mistakes go undetected longer.

### Prohibited Orchestrator Actions

| Action | Why |
|--------|-----|
| Write/edit files in `src/`, `lib/`, `app/`, `packages/` | Source files belong to executors |
| Create new TS/JS files | File creation is implementation |
| Run `bun add`, `npm install`, etc. | Dependency changes are implementation |
| Edit `agents/`, `commands/`, `skills/` (unless `.goopspec/` docs) | Implementation-adjacent |
| "Quickly fix" anything inline | No exceptions |
| Paste implementation logic into a message | Still writing code |

### Permitted Orchestrator Actions

- Read any file for context.
- Write/edit `.goopspec/` planning files.
- Update the ADL, save checkpoints, transition state.
- Run verification commands (`bun test`, `bun run typecheck`) — observe only, never fix.
- Search or save memory.
- Delegate work via `task()`.

## Delegation Prompt

Every `task()` prompt must include:

| Section | Purpose |
|---------|---------|
| Task intent | What to build and why |
| Project context | Stack, wave, patterns, `workflowId` |
| Constraints | Boundaries and requirements |
| Verification | How to prove completion |
| Expected output | Deliverables and commit expectations |

Always include workflow isolation context when delegating: active `workflowId` and the correct `.goopspec/<workflowId>/` doc prefix.

### Context Handoff

Pass only what the agent needs:

- Current phase, spec, and active task.
- Relevant files (not the full tree).
- Last 3-5 ADL entries.
- Constraints, deadlines, and blockers.

Do not pass full conversation history, verbose logs, unrelated files, or completed task details.

## Agent Selection

### By Task Type

| Task Type | Primary Agent | Fallback |
|-----------|--------------|----------|
| Planning | `goop-planner` | orchestrator |
| Simple config/mechanical | `goop-executor-low` | — |
| Business logic | `goop-executor-medium` | — |
| Complex/architectural | `goop-executor-high` | — |
| UI/UX implementation | `goop-executor-frontend` | — |
| Research | `goop-researcher` | `goop-explorer` |
| Exploration | `goop-explorer` | — |
| Verification | `goop-verifier` | `goop-tester` |
| Testing | `goop-tester` | `goop-verifier` |
| Debugging | `goop-debugger` | `goop-executor-high` |
| Documentation | `goop-writer` | orchestrator |

### By Complexity

| Complexity | Tier | Context Budget |
|------------|------|----------------|
| Simple | `goop-executor-low` | 40% |
| Standard | `goop-executor-medium` | 60% |
| Complex | `goop-executor-high` | 80% |
| Critical | `goop-executor-high` + thinking | 90% |

## Dispatch Modes

### Sequential Dispatch

Use when tasks have dependencies, shared files, or unclear scope.

```
Task A → Complete → Task B → Complete → Task C
```

### Parallel Dispatch

Use when tasks are independent, in different domains, and have clear file boundaries.

```
       ┌─ Task A ─┐
Start ─┼─ Task B ─┼─ Merge
       └─ Task C ─┘
```

### Single-Branch Parallelism Rule

All parallel agents must target the same branch. Never dispatch agents to different branches simultaneously.

Wave branches are sequential — Wave N must be fully merged before Wave N+1 is created. Within a wave, parallel tasks share the wave's single branch.

| Allowed | Forbidden |
|---------|-----------|
| 3 agents on `feat/auth-tokens` in parallel | Agent A on `feat/auth`, Agent B on `feat/db` simultaneously |
| Wave 1 merged, then Wave 2 branch created | Wave 1 and Wave 2 branches both open at the same time |

### Background Dispatch

Use for research, large test suites, or documentation generation that should not block the main flow.

### Tool-Call Batching

The same parallel-vs-sequential principle applies at the tool-call level, not just the task level. For maximum efficiency, whenever you need to perform multiple independent tool operations, invoke all relevant tools simultaneously in a single message rather than sequentially.

**Narrative or sequential ordering in a plan is NOT the same as a data dependency.** If tool call B does not consume tool call A's output, batch them together in the same message — even if B logically follows A in your plan. Only call tools sequentially when a later call genuinely needs an earlier call's result.

#### Worked Example

**BEFORE (wrong — two separate messages/turns):**

```
Message 1: goop_state({ action: "create-workflow", workflowId: "my-workflow" })
Message 2: goop_state({ action: "set-active-workflow", workflowId: "my-workflow" })
```

and

```
Message 1: goop_state({ action: "get" })
Message 2: goop_state({ action: "set-autopilot", autopilot: true, lazy: true })
```

(In both cases, the second call's inputs did not depend on the first call's output — they should have been batched.)

**AFTER (correct):**

```
Single message: goop_state({ action: "create-workflow", workflowId: "my-workflow", activate: true })
```

(Note: once the `activate` flag lands, this becomes a single call instead of two — the best fix is often to eliminate the second call entirely via a tool-design improvement, not just batch it.)

```
Single message, two parallel tool calls:
  - goop_state({ action: "get" })
  - goop_search_notes({ query: "..." })
(called together in the same turn since neither depends on the other's output)
```

## Research Dispatch

Research resolves unknowns before or during planning/execution. Deliverables:

- Concise findings.
- Recommendation with rationale.
- Known risks and mitigation options.

Persist findings as Field Notes via `goop_save_note`. Search prior research via `goop_search_notes({ query: "[topic]" })`.

Dispatch rules:

- Domain/technology unknowns → `goop-researcher`.
- Codebase integration/location unknowns → `goop-explorer`.
- Both unknown and independent → dispatch both in parallel.

### Research Methodology

1. Define a specific question.
2. Gather from multiple sources (official docs, search, example repos).
3. Note contradictions and source reliability.
4. Synthesize patterns and actionable recommendations.
5. Persist results as Field Notes via `goop_save_note`.

Time-box research: 30–60 minutes typical, 2 hours maximum.

## Model Profiles

Default model assignments optimize cost and quality per task.

| Agent | Default Model | Rationale |
|-------|---------------|-----------|
| `goop-orchestrator` | quality reasoning | Complex orchestration, context management |
| `goop-planner` | quality reasoning | Architecture decisions, decomposition |
| `goop-executor-high` | strong code | Critical paths, architecture-sensitive code |
| `goop-executor-medium` | balanced code | Business logic, refactors |
| `goop-executor-low` | fast code | Mechanical edits, scaffolding |
| `goop-executor-frontend` | quality reasoning | UI/UX, component architecture |
| `goop-researcher` | broad knowledge | Deep research, synthesis |
| `goop-explorer` | fast lightweight | Codebase mapping, pattern detection |
| `goop-verifier` | strong code | Spec compliance, security audit |
| `goop-tester` | cost-effective code | Test writing, QA |
| `goop-debugger` | strong code | Hypothesis testing, root cause |
| `goop-writer` | strong writing | Documentation, structured writing |
| `memory-distiller` | fast lightweight | Event distillation |

Users can override models in `goopspec.json` under `models`.

## Verification Dispatch

Use `goop-verifier` at acceptance gates and after high-risk changes. A verification report should check:

| Area | What to Confirm |
|------|-----------------|
| Truths | Observable behaviors from must-haves (e.g., "user can log in") |
| Artifacts | Required files exist, export the right functions, and meet size/complexity expectations |
| Key links | Critical connections between components are wired correctly |
| Quality | Types, lint, tests, and build pass |

## Codebase Mapping Dispatch

Use `goop-explorer` when entering an unfamiliar codebase. The agent should produce:

- Directory structure summary.
- Main entry points and data flows.
- Key abstractions and patterns.
- Conventions for naming, imports, error handling, and tests.

## Error Handling

### On Agent Failure

1. Log failure to state.
2. Save checkpoint.
3. Attempt recovery: retry with fresh context, fall back to a different agent, or escalate to the user.

### On Timeout

1. Check for partial progress.
2. Save checkpoint with partial state.
3. Notify user with options: resume, retry, or skip.

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Vague prompt | Agent lacks context | Include all five delegation sections |
| Wrong agent tier | Quality/speed mismatch | Match agent to task complexity |
| Missing verification | Can't prove completion | Always specify verification commands |
| No project context | Agent guesses patterns | Include stack, wave, existing patterns |
| Dispatching parallel agents to shared files | Merge conflicts | Sequential dispatch for overlapping files |

## Anti-Patterns

- The orchestrator implementing instead of delegating.
- Vague delegation prompts missing context or verification.
- Dispatching parallel agents to tasks that share files.
- Skipping memory search before delegating research.
- **Cross-branch parallel dispatch** — dispatching parallel agents to different branches simultaneously. All parallel agents must share one branch.
- **Premature Wave N+1** — creating Wave N+1 branch before Wave N is merged.

---

*Dispatch Patterns v1.0 — GoopSpec Reference*
