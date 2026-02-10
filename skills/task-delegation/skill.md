---
name: task-delegation
description: Patterns for delegating tasks to specialized agents
category: core
triggers:
  - delegate
  - spawn
  - subagent
  - task
version: 0.2.6
requires:
  - goop-core
---

# Task Delegation Skill

## When to Delegate

Delegate when:
- Task requires specialized expertise (testing, security, documentation)
- Context is getting bloated (>70% usage)
- Task can run in parallel with other work
- Fresh perspective needed

Don't delegate when:
- Task is trivial (<5 minutes)
- Heavy context sharing required
- Sequential dependency on current work

## Delegation Patterns

### Sequential Delegation

```json
{
  "mode": "sequential",
  "tasks": [
    { "agent": "planner", "task": "Create plan" },
    { "agent": "executor", "task": "Implement plan" },
    { "agent": "verifier", "task": "Verify implementation" }
  ]
}
```

### Parallel Delegation

```json
{
  "mode": "parallel",
  "max_concurrent": 3,
  "tasks": [
    { "agent": "executor", "task": "Implement feature A" },
    { "agent": "executor", "task": "Implement feature B" },
    { "agent": "tester", "task": "Write tests" }
  ]
}
```

### Background Delegation

```json
{
  "mode": "background",
  "agent": "researcher",
  "task": "Research best practices",
  "notify_on_complete": true
}
```

## Agent Selection

| Task Type | Agent | Model Tier |
|-----------|-------|------------|
| Planning | goop-planner | quality |
| Implementation | goop-executor-{tier} | balanced |
| Verification | goop-verifier | quality |
| Research | goop-researcher | balanced |
| Documentation | goop-writer | budget |
| Testing | goop-tester | balanced |
| Debugging | goop-debugger | quality |
| Security | goop-verifier | quality |

## Context Handoff

When delegating, pass:
1. **Essential state:** Current phase, spec, todos
2. **Relevant files:** Only files the agent needs
3. **Recent decisions:** Last 3-5 ADL entries
4. **Constraints:** Boundaries, deadlines, blockers

Don't pass:
- Full conversation history
- Verbose logs
- Unrelated file contents
- Completed task details

## Two-Step Delegation (CRITICAL)

Delegation in GoopSpec uses **two distinct tools** with different purposes:

### Step 1: `goop_delegate` — Prompt Engineering

This tool **prepares** a rich, production-ready prompt by:
- Loading the agent's definition (skills, references, model)
- Injecting team awareness context
- Adding memory protocols
- Checking for file conflicts with other agents

```typescript
goop_delegate({
  agent: "goop-executor-high",
  prompt: "Implement user authentication",
  context: "Stack: Next.js + NextAuth"
})
```

**Output**: A structured prompt package with the exact `task()` call to execute.

### Step 2: `task` — Agent Execution

This tool **spawns** the subagent with the engineered prompt:

```typescript
task({
  subagent_type: "goop-executor-high",
  description: "Implement auth",
  prompt: `[Copy composedPrompt from goop_delegate output]`
})
```

### When to Use Each Pattern

| Situation | Recommended Pattern |
|-----------|---------------------|
| Complex task needing skills/refs | `goop_delegate` → `task` |
| Task needing team awareness | `goop_delegate` → `task` |
| Simple, well-defined task | `task` directly |
| Quick exploration | `task` directly |

### Available subagent_types

| subagent_type | Use For |
|---------------|---------|
| `goop-executor-low` | Simple implementation, config updates, mechanical fixes |
| `goop-executor-medium` | Business logic, refactors, and standard implementation tasks |
| `goop-executor-high` | Complex implementation, architecture-sensitive changes, critical code paths |
| `goop-executor-frontend` | UI/UX implementation, styling, responsive frontend work |
| `goop-explorer` | Fast codebase mapping, pattern detection |
| `goop-researcher` | Deep domain research, technology evaluation |
| `goop-planner` | Architecture design, blueprint creation |
| `goop-verifier` | Verification against spec, security audit |
| `goop-debugger` | Bug investigation, scientific debugging |
| `goop-tester` | Test writing, coverage analysis |
| `goop-designer` | UI/UX design, component architecture |
| `goop-writer` | Documentation, technical writing |
| `goop-librarian` | Code/docs search, information retrieval |
| `general` | Fallback for any task |

### Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Using `goop_delegate` without `task` | Prompt is prepared but agent never runs | Always follow `goop_delegate` with `task` |
| Using `delegate` instead | Different system, not GoopSpec agents | Use `task` for GoopSpec agents |
| Skipping `goop_delegate` for complex tasks | Miss skills/refs/team context | Use full two-step for complex work |

### Full Example

```typescript
// Step 1: Engineer the prompt
goop_delegate({
  agent: "goop-executor-high",
  prompt: "Implement password reset flow",
  context: `
    Stack: Next.js 14, Prisma, Resend
    Task from BLUEPRINT.md Wave 2, Task 3
    Must follow existing auth patterns in src/auth/
  `
})

// Step 2: Execute (copy the task call from goop_delegate output)
task({
  subagent_type: "goop-executor-high",
  description: "Implement password reset",
  prompt: `[The full composedPrompt from goop_delegate]`
})
```

## Error Handling

If delegated task fails:
1. Check error type (timeout, crash, assertion)
2. Save partial progress as checkpoint
3. Decide: retry, reassign, or escalate
4. Log failure to ADL if significant

## Best Practices

1. **Clear instructions:** Specific, unambiguous task descriptions
2. **Scoped context:** Only relevant information
3. **Defined success:** Clear verification criteria
4. **Timeout limits:** Set reasonable time bounds
5. **Progress tracking:** Monitor via todos/checkpoints
