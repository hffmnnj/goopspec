# Context Injection

Context Injection ensures all subagents have access to project-level knowledge without the orchestrator manually including it in every delegation prompt.

## Core Principle

```
+================================================================+
|  SUBAGENTS NEED CONTEXT TO MAKE GOOD DECISIONS.                 |
|  Project knowledge flows automatically to every agent.          |
|  No agent should hallucinate stack choices or conventions.      |
+================================================================+
```

## The Knowledge Base

### PROJECT_KNOWLEDGE_BASE.md

A living document maintained in `.goopspec/PROJECT_KNOWLEDGE_BASE.md` containing:

```markdown
# Project Knowledge Base

**Last Updated:** [timestamp]
**Updated By:** [agent/user]

---

## Project Identity

**Name:** [Project name]
**Type:** [Web app / CLI / Library / API / etc.]
**Stage:** [New / Active / Maintenance]

---

## Stack (Non-Negotiable)

### Runtime & Language
- **Runtime:** [Node.js / Bun / Deno / Browser]
- **Language:** [TypeScript / JavaScript]
- **Version:** [Specific versions]

### Frameworks & Libraries
- **Framework:** [Express / Next.js / React / None]
- **ORM:** [Prisma / Drizzle / None]
- **Testing:** [Vitest / Jest / Bun test]
- **Key Libraries:** [List with versions]

### Infrastructure
- **Database:** [PostgreSQL / SQLite / None]
- **Cache:** [Redis / None]
- **Deployment:** [Vercel / AWS / Docker]

---

## Conventions

### File Naming
- **Files:** [kebab-case / camelCase]
- **Components:** [PascalCase]
- **Tests:** [*.test.ts / *.spec.ts]

### Code Style
- **Functions:** [Arrow / Named]
- **Exports:** [Named / Default]
- **Types:** [Interfaces / Types]

### Commits
- **Format:** [type(scope): description]
- **Types:** [feat, fix, refactor, test, docs, chore]

---

## Architecture Decisions

### [Decision Category]
- **Decision:** [What was decided]
- **Rationale:** [Why]
- **Date:** [When]

---

## Patterns in Use

### [Pattern Name]
- **Where:** [Files/areas]
- **How:** [Brief description]
- **Example:** `path/to/example.ts`

---

## Known Gotchas

- [Gotcha 1]: [What to watch out for]
- [Gotcha 2]: [What to watch out for]

---

## Integration Points

- **Auth:** [Where auth is handled]
- **API:** [API patterns/locations]
- **Database:** [How data is accessed]

---

*Updated automatically by memory-distiller agent.*
*Manual updates welcome for accuracy.*
```

## Injection Points

### When Subagents Load Context

Every subagent's `<first_steps>` section includes:

```markdown
**Step N: Load Project Knowledge**
```
Read(".goopspec/PROJECT_KNOWLEDGE_BASE.md")  # If exists
```

This happens AFTER loading state but BEFORE starting work.
```

### Orchestrator Delegation

When orchestrator delegates via `task()`:

```typescript
task({
  subagent_type: "goop-executor-high",
  description: "Implement feature X",
  prompt: `
    ## PROJECT CONTEXT
    [Auto-injected from PROJECT_KNOWLEDGE_BASE.md]
    - Stack: Bun, TypeScript, Express
    - Conventions: kebab-case files, named exports
    - Testing: bun test
    
    ## TASK
    [Specific task details]
    ...
  `
})
```

## Automatic Updates

### memory-distiller Responsibility

The memory-distiller agent updates PROJECT_KNOWLEDGE_BASE.md:

1. **After major decisions**: New architectural choices
2. **After pattern discovery**: New patterns found in codebase
3. **After gotcha discovery**: Issues to remember
4. **At session end**: Consolidate session learnings

### Update Protocol

```markdown
1. Read current PROJECT_KNOWLEDGE_BASE.md
2. Merge new knowledge:
   - Add new decisions
   - Update patterns
   - Add gotchas
3. Remove outdated information
4. Write updated file
5. Log update to CHRONICLE.md
```

## What to Include

### Always Include
- Stack choices (runtime, framework, libraries)
- Naming conventions
- Commit format
- Major architectural decisions
- Known gotchas

### Include When Relevant
- Integration patterns
- Error handling conventions
- Testing patterns
- Deployment configuration

### Never Include
- Sensitive data (API keys, passwords)
- Temporary workarounds
- Personal preferences
- Speculation

## What Subagents Should Do

### With Injected Context

1. **Follow stack choices**: Don't suggest alternative libraries
2. **Match conventions**: Use the same naming, export style
3. **Reference patterns**: Follow established patterns
4. **Avoid gotchas**: Don't repeat known mistakes

### When Context is Missing

1. **Explore codebase**: Look for existing patterns
2. **Ask orchestrator**: If critical decision needed
3. **Document discovery**: Add to PROJECT_KNOWLEDGE_BASE via memory

## Example: Context-Aware Executor

### Without Context Injection (Bad)
```
Task: Add user validation

Executor thinks: "I'll use Zod for validation..."
Reality: Project uses Yup everywhere
Result: Inconsistent validation libraries
```

### With Context Injection (Good)
```
Task: Add user validation

PROJECT_KNOWLEDGE_BASE says:
- Validation: Yup (see src/validation/schemas.ts)

Executor thinks: "Project uses Yup, I'll follow the pattern in schemas.ts"
Result: Consistent validation approach
```

## Integration with Memory

### memory_search Enhancement

Before starting work, agents should:

```typescript
// 1. Check PROJECT_KNOWLEDGE_BASE.md
Read(".goopspec/PROJECT_KNOWLEDGE_BASE.md")

// 2. Search memory for task-specific context
memory_search({ 
  query: "[task] patterns conventions",
  concepts: ["patterns", "conventions", "decisions"]
})
```

### memory_save for Future Context

When discovering patterns:

```typescript
memory_save({
  type: "observation",
  title: "Pattern: [pattern name]",
  content: "Found [pattern] used in [files]. Should be added to PROJECT_KNOWLEDGE_BASE.",
  concepts: ["pattern", "convention", "knowledge-base"],
  importance: 0.7
})
```

## Bootstrap Process

### For New Projects

When starting a new GoopSpec project:

1. **goop-explorer** maps codebase
2. **Orchestrator** creates initial PROJECT_KNOWLEDGE_BASE.md from:
   - package.json analysis
   - Existing config files
   - Code pattern detection
3. **User** reviews and corrects
4. **memory-distiller** maintains going forward

### For Existing GoopSpec Projects

1. Load existing PROJECT_KNOWLEDGE_BASE.md
2. memory-distiller updates with session discoveries
3. Accumulates institutional knowledge over time

## Anti-Patterns

### Bad: Ignoring Context
```
PROJECT_KNOWLEDGE_BASE says: Use named exports
Agent does: export default function...
```
**Fix**: Always read and follow PROJECT_KNOWLEDGE_BASE.

### Bad: Outdated Context
```
PROJECT_KNOWLEDGE_BASE says: Using Express
Reality: Migrated to Fastify 3 months ago
```
**Fix**: memory-distiller should detect and update.

### Bad: Over-Injection
```
Delegating to agent with 5000 tokens of context
```
**Fix**: Inject only relevant sections for the task.

---

*Context Injection Protocol v0.2.6*
*"Shared knowledge, consistent decisions."*
