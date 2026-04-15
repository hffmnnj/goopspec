# Agent Dispatch Patterns

GoopSpec supports multiple patterns for spawning and coordinating specialized agents. Choose the right pattern based on task characteristics.

## Direct Task Delegation

GoopSpec uses the native `task` tool for all agent delegation. The orchestrator constructs rich, context-aware prompts that include task intent, project context, constraints, and verification expectations.

### Task Delegation Pattern

For all delegation, use the `task` tool with a well-constructed prompt:

```typescript
task({
  subagent_type: "goop-executor-high",
  description: "Implement user authentication",
  prompt: `
## TASK
Implement user authentication with JWT tokens.

## PROJECT CONTEXT
- Stack: Next.js 14 + NextAuth
- Wave 2, Task 3 from BLUEPRINT.md
- Follow patterns in src/auth/

## CONSTRAINTS
- Use existing session management
- Must support OAuth providers
- Token expiry: 24 hours

## VERIFICATION
- Run: bun test src/auth/
- Manual: Test login/logout flow
- Check: No hardcoded secrets

## EXPECTED OUTPUT
- src/auth/service.ts - JWT generation
- src/auth/middleware.ts - Route protection
- Atomic commit with verification evidence
  `
})
```

### Prompt Construction Requirements

Every delegation prompt MUST include:

| Section | Purpose | Example |
|---------|---------|---------|
| **Task Intent** | What to build and why | "Implement JWT auth to secure API endpoints" |
| **Project Context** | Stack, wave, patterns | "Stack: Next.js 14, Wave 2 Task 3, follow src/auth/ patterns" |
| **Constraints** | Boundaries and requirements | "Use existing session management, support OAuth" |
| **Verification** | How to prove completion | "Run bun test src/auth/, manual login test" |
| **Expected Output** | Deliverables | "service.ts, middleware.ts, atomic commit" |

### Agent Selection by Task Type

| Task Type | Agent | When to Use |
|-----------|-------|-------------|
| Simple config/mechanical | `goop-executor-low` | Config updates, renames, boilerplate |
| Business logic | `goop-executor-medium` | Standard features, refactors |
| Complex/architectural | `goop-executor-high` | Critical paths, architecture-sensitive |
| UI/UX work | `goop-executor-frontend` | Styling, responsive design |
| Research | `goop-researcher` | Technology evaluation, deep research |
| Verification | `goop-verifier` | Spec compliance, security audit |

### Common Mistakes

| Mistake | Symptom | Fix |
|---------|---------|-----|
| Vague prompt | Agent lacks context | Include all 5 required sections |
| Wrong agent tier | Quality mismatch | Match agent to task complexity |
| Missing verification | Can't prove completion | Always specify verification commands |
| No project context | Agent guesses patterns | Include stack, wave, existing patterns |

## Dispatch Modes

### Sequential Dispatch

**When:** Tasks have strict dependencies, order matters.

**Pattern:**
```
Task A → Complete → Task B → Complete → Task C
```

**Use for:**
- Database migrations before schema-dependent code
- Build before deploy
- Test before commit
- Setup before configuration

**Example:**
```json
{
  "mode": "sequential",
  "agents": [
    { "agent": "planner", "task": "Create migration plan" },
    { "agent": "executor", "task": "Run migrations" },
    { "agent": "verifier", "task": "Verify schema" }
  ]
}
```

### Parallel Dispatch

**When:** Tasks are independent, can run concurrently.

**Pattern:**
```
       ┌─ Task A ─┐
Start ─┼─ Task B ─┼─ Merge
       └─ Task C ─┘
```

**Use for:**
- Independent feature implementations
- Multiple test suites
- Documentation + implementation
- Research across different domains

**Example:**
```json
{
  "mode": "parallel",
  "max_concurrent": 3,
  "agents": [
    { "agent": "executor", "task": "Implement auth module" },
    { "agent": "executor", "task": "Implement user module" },
    { "agent": "tester", "task": "Write integration tests" }
  ]
}
```

### Background Dispatch

**When:** Long-running tasks that shouldn't block main flow.

**Pattern:**
```
Main Flow ───────────────────────────────►
              ↓
         Background Task ──────► Notify on complete
```

**Use for:**
- Research tasks
- Large test suites
- Documentation generation
- Code analysis

**Example:**
```json
{
  "mode": "background",
  "agent": "researcher",
  "task": "Research authentication best practices",
  "notify_on_complete": true
}
```

## Agent Selection

### By Task Type

| Task Type | Primary Agent | Fallback |
|-----------|--------------|----------|
| Planning | goop-planner | goop-orchestrator |
| Implementation | goop-executor-{tier} | goop-orchestrator |
| Verification | goop-verifier | goop-tester |
| Research | goop-researcher | goop-explorer |
| Documentation | goop-writer | goop-orchestrator |
| Debugging | goop-debugger | goop-executor-high |
| UI/UX | goop-designer | goop-executor-frontend |
| Testing | goop-tester | goop-verifier |

### By Complexity

| Complexity | Model Profile | Context Budget |
|------------|--------------|----------------|
| Simple | budget | 40% |
| Standard | balanced | 60% |
| Complex | quality | 80% |
| Critical | quality + thinking | 90% |

## Wave Execution

Plans are grouped into waves for efficient parallel execution:

```
Wave 1: Foundation (sequential dependencies)
  ├─ Plan A (infrastructure)
  └─ Plan B (database setup)

Wave 2: Features (parallel, depends on Wave 1)
  ├─ Plan C (auth feature)
  ├─ Plan D (user feature)
  └─ Plan E (API feature)

Wave 3: Integration (depends on Wave 2)
  └─ Plan F (integration tests)
```

### Wave Metadata

Each plan specifies its wave in frontmatter:
```yaml
---
wave: 2
depends_on: [plan-a, plan-b]
autonomous: true
---
```

## Fresh Context Strategy

**When to spawn fresh agents:**
1. Context usage exceeds 70%
2. Switching to different task domain
3. Starting a new phase
4. After checkpoint restoration

**Context handoff:**
- Pass essential state (phase, spec, todos)
- Include recent ADL decisions
- Summarize previous progress
- Exclude verbose logs

## Error Handling

### On Agent Failure

1. Log failure to state
2. Save checkpoint
3. Attempt recovery:
   - Retry with fresh context
   - Fallback to different agent
   - Escalate to user

### On Timeout

1. Check for partial progress
2. Save checkpoint with partial state
3. Notify user with options:
   - Resume from checkpoint
   - Retry task
   - Skip and continue
