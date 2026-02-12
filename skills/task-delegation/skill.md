---
name: task-delegation
description: Patterns for delegating tasks to specialized agents
category: core
triggers:
  - delegate
  - spawn
  - subagent
  - task
version: 0.2.7
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

## Direct Task Delegation (CRITICAL)

Delegation in GoopSpec uses the native **`task` tool** with rich, context-aware prompts constructed by the orchestrator.

### Prompt Construction Requirements

Every delegation prompt MUST include:

1. **Task Intent** - What to build and why
2. **Project Context** - Stack, wave, existing patterns
3. **Constraints** - Boundaries and requirements
4. **Verification** - Commands to prove completion
5. **Expected Output** - Specific deliverables

### Example Delegation

```typescript
task({
  subagent_type: "goop-executor-high",
  description: "Implement user authentication",
  prompt: `
## TASK
Implement JWT-based user authentication with login/logout endpoints.

## PROJECT CONTEXT
- Stack: Next.js 14 + NextAuth
- Wave 2, Task 3 from BLUEPRINT.md
- Follow existing patterns in src/auth/
- Use jose library for JWT (already in dependencies)

## CONSTRAINTS
- Must support OAuth providers (Google, GitHub)
- Token expiry: 24 hours with refresh rotation
- Use existing session management in src/session/

## VERIFICATION
- Run: bun test src/auth/
- Manual: Test login/logout flow in browser
- Check: No hardcoded secrets or credentials

## EXPECTED OUTPUT
- src/auth/service.ts - JWT generation and validation
- src/auth/middleware.ts - Route protection middleware
- src/auth/types.ts - Auth type definitions
- Atomic commit with verification evidence
  `
})
```

### When to Delegate

| Situation | Use Delegation |
|-----------|----------------|
| Complex implementation | Yes - use appropriate executor tier |
| Multi-file changes | Yes - include full context |
| Architecture-sensitive | Yes - use goop-executor-high |
| Simple config update | Optional - can be done directly |
| Quick exploration | Optional - depends on context needs |

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
| Vague prompt | Agent lacks context to succeed | Include all 5 required sections |
| Wrong agent tier | Quality/speed mismatch | Match agent to task complexity |
| Missing verification | Can't prove completion | Always specify verification commands |
| No project context | Agent guesses patterns | Include stack, wave, existing patterns |
| Using `delegate` tool | Different async system | Use `task` for GoopSpec agents |

### Full Example

```typescript
task({
  subagent_type: "goop-executor-high",
  description: "Implement password reset flow",
  prompt: `
## TASK
Implement password reset flow with email verification.

## PROJECT CONTEXT
- Stack: Next.js 14, Prisma, Resend
- Wave 2, Task 3 from BLUEPRINT.md
- Follow existing auth patterns in src/auth/
- Email templates in src/templates/

## CONSTRAINTS
- Reset token expires in 1 hour
- One-time use tokens only
- Rate limit: 3 requests per hour per email
- Must log all reset attempts

## VERIFICATION
- Run: bun test src/auth/reset.test.ts
- Manual: Test full reset flow with real email
- Check: Token invalidation after use

## EXPECTED OUTPUT
- src/auth/reset.ts - Reset logic
- src/api/auth/reset.ts - API endpoint
- src/templates/reset-email.tsx - Email template
- Atomic commit with test evidence
  `
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
