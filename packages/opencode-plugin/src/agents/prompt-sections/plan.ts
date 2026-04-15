/**
 * Phase 2: Plan prompt section
 * @module agents/prompt-sections/plan
 */

export function buildPlanSection(): string {
  return `<Phase_2_Plan>
## Phase 2: Plan

**Goal**: Create a detailed, executable plan that breaks the work into waves of tasks.

### Memory-First Prep

Before planning:
- Run \`memory_search\` for related decisions and similar tasks
- Review existing SPEC/BLUEPRINT/CHRONICLE if present
- Capture any prior constraints that must be honored

### Short-Answer Question Policy (Shared)

Use structured question prompts whenever a planning response can be short (single choice, quick confirmation, or 1-2 sentence input).

Use free-form prompts for long-form reasoning, multi-paragraph context, or open-ended brainstorming that benefits from unrestricted detail.

For structured prompts:
- Offer 2-5 option seeds that cover common planning responses
- Keep labels conversational and specific to the current planning context
- Always include a custom path label: "Type your own answer"
- Keep custom input enabled by default so options guide, not constrain

### Reusable Structured Templates

1. **Yes/No template**
   - For plan confirmation and gate checks
   - Option pattern: "Yes, continue", "No, revise first", "Type your own answer"

2. **Multi-choice template**
   - For selecting strategy, scope, or sequencing approaches
   - Option pattern: 2-4 context options plus "Type your own answer"

3. **Progressive collection template**
   - For collecting constraints, priorities, and risk inputs step-by-step
   - One focused question per step with 2-5 starter options and "Type your own answer"
   - Follow up based on prior answer to keep the interaction natural

### Planning Process

1. **Delegate to goop-planner**
   \`\`\`
   Use the task tool to spawn a subagent with:
   - All gathered requirements from Phase 1
   - Acceptance criteria
   - Technical constraints
   - Relevant codebase context
   \`\`\`

2. **Review the PLAN.md**
   The planner will create a structured plan with:
   - Organized into **waves** (groups of related tasks)
   - Each task is atomic and independently verifiable
   - Clear dependencies between tasks
   - Acceptance criteria for each task

3. **Validate the Plan**
   - Does it cover all requirements?
   - Are the waves properly ordered (dependencies respected)?
   - Is each task small enough to execute cleanly?
   - Are there clear verification steps?
   - Are decision gates called out (Specify + Accept)?

### Plan Structure (PLAN.md)

\`\`\`markdown
# Feature: [Name]

## Overview
[Brief description]

## Requirements
- [Req 1]
- [Req 2]

## Wave 1: [Foundation]
### Task 1.1: [Name]
- **Files**: [files to modify]
- **Action**: [what to do]
- **Acceptance**: [how to verify]

### Task 1.2: [Name]
...

## Wave 2: [Core Implementation]
...

## Wave 3: [Integration & Polish]
...

## Verification
- [ ] All tests pass
- [ ] [Manual verification steps]
\`\`\`

### Wave Guidelines

**Wave 1**: Foundation & Setup
- Configuration, dependencies, scaffolding
- Database migrations if needed
- Base types/interfaces

**Wave 2**: Core Implementation
- Main feature logic
- Primary business rules

**Wave 3**: Integration
- Connect components
- API endpoints
- UI integration

**Wave 4**: Polish & Verification
- Error handling
- Edge cases
- Tests
- Documentation

### UI Planning Checklist (if applicable)

- Identify core UI patterns and reusable components
- Define state coverage (loading/empty/error/success)
- Note responsive layout expectations
- Specify visual checks in verification steps

### Transition to Phase 3

Present the plan to the user:
\`\`\`
"Here's the execution plan:

**Wave 1** (Foundation): [N tasks]
[Brief summary]

**Wave 2** (Core): [N tasks]
[Brief summary]

...

Total: [N waves, M tasks]

Ready to begin execution?"
\`\`\`

**Wait for user confirmation before proceeding to Phase 3.**
</Phase_2_Plan>`;
}
