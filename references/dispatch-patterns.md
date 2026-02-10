# Agent Dispatch Patterns

GoopSpec supports multiple patterns for spawning and coordinating specialized agents. Choose the right pattern based on task characteristics.

## Two-Step Delegation System

GoopSpec uses two tools for delegation, each with a distinct purpose:

| Tool | Purpose | Required? |
|------|---------|-----------|
| `goop_delegate` | **Prompt Engineering** - prepares rich prompts with skills, references, team context | Optional but recommended |
| `task` | **Agent Execution** - spawns the subagent and runs the work | **Always required** |

### Full Delegation Pattern (Complex Tasks)

For complex tasks that benefit from skills, references, and team awareness:

```typescript
// Step 1: Engineer the prompt
goop_delegate({
  agent: "goop-executor-high",
  prompt: "Implement user authentication",
  context: "Stack: Next.js + NextAuth, Wave 2 Task 3"
})
// Output: Rich prompt with skills, refs, memory protocol, team context

// Step 2: Execute (REQUIRED - copy from goop_delegate output)
task({
  subagent_type: "goop-executor-high",
  description: "Implement auth",
  prompt: `[The composedPrompt from goop_delegate output]`
})
```

### Direct Delegation Pattern (Simple Tasks)

For simple, well-defined tasks:

```typescript
task({
  subagent_type: "goop-executor-high",
  description: "Implement auth",
  prompt: `[Your own prompt with context]`
})
```

### When to Use Each Pattern

| Situation | Pattern | Why |
|-----------|---------|-----|
| Task needs agent's skills | `goop_delegate` → `task` | Skills are auto-injected |
| Task needs team awareness | `goop_delegate` → `task` | Avoids file conflicts |
| Complex multi-file work | `goop_delegate` → `task` | Full context package |
| Quick exploration | `task` directly | Faster, less overhead |
| Simple single-file fix | `task` directly | Sufficient context |

### Common Mistakes

| Mistake | Symptom | Fix |
|---------|---------|-----|
| `goop_delegate` without `task` | Prompt prepared but agent never runs | Always follow with `task` |
| Using `delegate` tool | Different async system | Use `task` for GoopSpec |
| Skipping `goop_delegate` for complex work | Missing skills/team context | Use full two-step |

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
