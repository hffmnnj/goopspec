# Architecture and Failure Modes

Plugin architecture overview plus reusable failure-mode patterns for architecture review.

## Plugin Architecture

### Design Philosophy

- **Memory-first**: search before acting, save after completing.
- **State-aware**: check phase and gates before executing.
- **Phase enforcement**: actions are validated against workflow state.
- **Context injection**: relevant memory is injected into LLM calls.

### Design Principles

- **Separation of concerns**: each module has a single, well-defined responsibility.
- **Dependency inversion**: depend on abstractions, not concretions.
- **Open/closed**: open for extension, closed for modification.
- **Single source of truth**: each piece of data has one authoritative owner.

### Workflow Phases

```
idle → plan → research → specify → execute → accept → archive
```

### Key Directories

| Directory | Purpose |
|-----------|---------|
| `.goopspec/` | State, specs, blueprints, chronicles |
| `src/tools/` | MCP tool implementations |
| `src/hooks/` | Lifecycle event handlers |
| `src/features/` | Feature modules (memory, state, enforcement, routing, archive) |

### Feature Modules

| Feature | Purpose |
|---------|---------|
| State Manager | Workflow persistence: phases, waves, ADL, checkpoints |
| Memory System | Persistent semantic memory with SQLite + vector storage |
| Enforcement | Phase-based validation, file write blocking, required docs |
| Parallel Research | Concurrent multi-agent research orchestration |
| Mode Detection | Suggests quick/standard/comprehensive mode |
| Routing | Maps task descriptions to agent categories |
| Archive | Milestone archival, learnings extraction, retrospectives |
| Workflow Memory | Phase-specific memory retrieval optimization |
| Setup | Environment detection, config management, MCP setup |

### Common Architecture Patterns

| Pattern | Use |
|---------|-----|
| **Repository** | Abstract data access behind a collection-like interface |
| **Service layer** | Coordinate application operations and transactions |
| **Factory** | Encapsulate object creation logic (e.g., validation-contract gate) |
| **Observer** | React to state changes without tight coupling |
| **Strategy** | Swap algorithms without changing callers |

### Project Structure

Prefer feature-based organization:

```
src/
├── features/
│   ├── auth/
│   │   ├── login.ts
│   │   └── auth.test.ts
│   └── users/
│       ├── create-user.ts
│       └── users.test.ts
├── shared/
│   ├── database/
│   └── utils/
└── index.ts
```

### Hook System

| Hook | Trigger | Effect |
|------|---------|--------|
| `chat.message` | User sends message | Updates activity, captures prompts to memory |
| `tool.execute.before` | Before tool runs | Caches args, tracks file states |
| `tool.execute.after` | After tool completes | Phase transitions, memory capture, enforcement, auto-progression |
| `permission.ask` | File permission request | Blocks orchestrator from writing implementation files |
| `system.transform` | Before LLM call | Injects phase rules and memories into system prompt |

### Critical Behaviors

- `tool.execute.after` auto-progresses phases when conditions are met.
- `permission.ask` enforces the orchestrator/executor boundary.
- `system.transform` injects a `<goopspec_context>` block with state, phase rules, and memories.

### Integration Patterns

- **Memory-first**: `memory_search` → work → `memory_save`/`memory_decision`.
- **State-aware**: `goop_status` → read state → check phase allows action.
- **Delegation lifecycle**: orchestrator builds rich prompt → `task()` → subagent executes → structured response → orchestrator updates state.

## Codebase Analysis

### Convention Detection

When entering a codebase, detect:

1. Naming conventions (files, variables, types, constants).
2. Code organization (features vs layers, import ordering).
3. Style rules (indentation, quotes, semicolons, line length).
4. Patterns (error handling, logging, testing, comments).

Check config files first (`biome.json`, `.eslintrc`, `.prettierrc`, `tsconfig.json`), then sample 5–10 representative files.

### Pattern Extraction

When documenting patterns:

1. Select representative files.
2. Identify recurring structures.
3. Validate consistency across the codebase.
4. Document intent, structure, example, when to use, and acceptable variations.
5. Note counter-examples and why they differ.

## Debugging & Scientific Method

Apply systematic debugging for complex failures:

1. **Observe** — gather symptoms, error messages, and recent changes.
2. **Hypothesize** — form a testable, falsifiable theory.
3. **Predict** — define outcomes that would confirm or refute the theory.
4. **Experiment** — change one variable at a time and measure.
5. **Analyze** — interpret the result and iterate or fix.

Useful tactics:

- **Binary search** — eliminate half the problem space each step.
- **Minimal reproduction** — reduce the failing case to the smallest input.
- **Git bisect** — find the commit that introduced the bug.
- **Strategic logging** — trace execution flow without flooding output.

## Failure Modes

Reusable patterns for architecture and system design analysis.

### 1. Cascading Failures

A failure in one component propagates to dependents.

Mitigations: circuit breakers, bulkhead isolation, timeout budgets, graceful degradation.

### 2. Thundering Herd

Many clients retry simultaneously after a failure, overwhelming recovery.

Mitigations: jittered exponential backoff, cache stampede protection, rate limiting, gradual admission.

### 3. Split Brain

Distributed components disagree on system state.

Mitigations: quorum consensus, leader election with fencing tokens, CRDTs, explicit conflict resolution.

### 4. Data Corruption Propagation

Bad data enters and spreads before detection.

Mitigations: schema validation at write boundaries, immutable event logs, checksums, anomaly detection.

### 5. Resource Exhaustion

System runs out of memory, connections, disk, or file descriptors.

Mitigations: resource limits, health checks, automatic restart, load shedding.

### 6. Poison Message

A single malformed message blocks a queue or pipeline.

Mitigations: dead-letter queues, per-message timeout, schema validation, DLQ monitoring.

### 7. Clock and Ordering Assumptions

System assumes ordered events or synchronized clocks.

Mitigations: logical/vector clocks, sequence numbers, idempotency keys, explicit happens-before relationships.

### 8. Configuration Drift

Production config diverges from tested config.

Mitigations: infrastructure as code, drift detection, immutable deployments, config validation on startup.

## Risk Assessment

### Likelihood

| Signal | Likelihood |
|--------|-----------|
| Has happened before in similar systems | High |
| Requires specific but documented conditions | Medium |
| Theoretically possible but rare | Low |

### Impact

| Signal | Impact |
|--------|--------|
| Data loss or corruption affecting users | High |
| Extended service unavailability | High |
| Degraded performance or partial loss | Medium |
| Cosmetic or non-critical feature affected | Low |

### Prioritization

1. High likelihood + high impact — mitigate before shipping.
2. Low likelihood + high impact — have a recovery plan.
3. High likelihood + low impact — fix when convenient, monitor always.
4. Low likelihood + low impact — document and accept.

## Edge-Case Scanning Checklist

Use when reviewing any proposed architecture:

- [ ] Empty/null inputs
- [ ] 100x expected load
- [ ] Partial failure
- [ ] Network partition
- [ ] Clock skew
- [ ] Concurrent writes
- [ ] Schema evolution
- [ ] Rollback safety
- [ ] Cold start
- [ ] Dependency unavailability for 1 hour
- [ ] Disk full / resource exhaustion
- [ ] Poison data

---

*Architecture and Failure Modes v1.0 — GoopSpec Reference*
