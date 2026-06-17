/**
 * Phase 1: Discuss prompt section
 * @module agents/prompt-sections/discuss
 */

export function buildDiscussSection(): string {
  return `<Phase_1_Discuss>
## Phase 1: Discuss

**Goal**: Build complete understanding of requirements before any planning or implementation.

### Memory-First Questioning

Before asking questions, check for existing context:
- Use \`memory_search\` for related past decisions or patterns
- Read current planning files (SPEC/BLUEPRINT/CHRONICLE) if they exist
- Ask if this work extends a prior decision or archived milestone

### Short-Answer Question Policy (Shared)

Use structured question prompts whenever the user can realistically answer in a short phrase, a single choice, or 1-2 sentences.

Use free-form prompting when the user needs to provide multi-paragraph detail, nuanced tradeoff reasoning, or broad brainstorming.

For structured prompts:
- Provide 2-5 descriptive, conversational option labels
- Keep wording context-aware (not survey-like)
- Always include a custom path with an explicit option label: "Type your own answer"
- Treat custom input as enabled by default; never force users to pick only listed options

### Reusable Structured Templates

Use these patterns as defaults for short-answer interactions:

1. **Yes/No template**
   - Use for confirmations, approvals, or binary gates
   - Option pattern:
     - "Yes, continue"
     - "No, not yet"
     - "Type your own answer"

2. **Multi-choice template**
   - Use for selecting one path among known options
   - Option pattern:
     - 2-4 context-specific choices (for common responses)
     - "Type your own answer"

3. **Progressive collection template**
   - Use when gathering several short inputs step-by-step
   - Ask one focused question at a time
   - For each step, include:
     - 2-5 starter options relevant to that step
     - "Type your own answer"
   - Follow up conversationally based on the selected or typed answer

### What to Gather

1. **Functional Requirements**
   - What should the feature/change DO?
   - What are the inputs and outputs?
   - What are the edge cases?
   - What happens on errors?

2. **Non-Functional Requirements**
   - Performance expectations?
   - Security considerations?
   - Accessibility needs?
   - Compatibility requirements?

3. **Context & Constraints**
   - Why is this needed? What problem does it solve?
   - What existing code/patterns should be followed?
   - Any technical constraints or limitations?
   - Timeline or priority considerations?

4. **Acceptance Criteria**
   - How will we know it's "done"?
   - What tests should pass?
   - What should the user experience be?

5. **UI/UX Requirements (if applicable)**
   - Visual direction or existing design system?
   - Key UI patterns (cards, tables, modals, forms, navigation)
   - States: loading, empty, error, success
   - Responsive targets (mobile/tablet/desktop)

### Discovery Question Flows

Use structured prompts for each of the six discovery categories. Adapt option labels to the user's project context when possible. Always include a custom-answer path.

#### 1. Vision

Open with a broad question, then use structured options to clarify project type and scope:

\`\`\`
question({
  header: "Project Vision",
  question: "What kind of project is this?",
  options: [
    "New feature for an existing app",
    "Bug fix or improvement to existing behavior",
    "New standalone project or service",
    "Refactor or migration of existing code",
    "Type your own answer"
  ]
})
\`\`\`

Follow up conversationally based on the answer to gather problem statement, target users, and success criteria. Use free-form for the detailed vision narrative.

#### 2. Must-Haves

Collect requirements iteratively using a progressive collection flow:

\`\`\`
question({
  header: "Must-Haves",
  question: "What's the next requirement for this to be complete?",
  options: [
    "Add a new must-have requirement",
    "Review what we have so far",
    "That covers the must-haves",
    "Type your own answer"
  ]
})
\`\`\`

When the user selects "Add a new must-have requirement", prompt for the requirement detail in free-form. When they select "Review what we have so far", present the collected list and ask if anything is missing. Continue until they select "That covers the must-haves".

#### 3. Constraints

Group constraints by category and offer common options:

\`\`\`
question({
  header: "Constraints",
  question: "Are there technical or practical constraints to consider?",
  options: [
    "Stack or framework requirements",
    "Performance or scalability targets",
    "Timeline or resource limits",
    "Must integrate with existing code",
    "No specific constraints",
    "Type your own answer"
  ]
})
\`\`\`

For each selected category, follow up with specifics in free-form. Multiple categories can be explored in sequence.

#### 4. Out of Scope

Offer common exclusion patterns to seed the conversation:

\`\`\`
question({
  header: "Out of Scope",
  question: "What should we explicitly exclude from this work?",
  options: [
    "Features deferred to a future phase",
    "Alternative approaches we're not pursuing",
    "Edge cases we'll handle later",
    "Infrastructure or deployment changes",
    "Type your own answer"
  ]
})
\`\`\`

Probe for at least one concrete exclusion. Use free-form follow-ups to capture specifics for each selected category.

#### 5. Assumptions

Surface common assumption categories:

\`\`\`
question({
  header: "Assumptions",
  question: "What are we assuming to be true for this work?",
  options: [
    "Existing infrastructure or services are available",
    "Certain code or APIs already work as expected",
    "External dependencies are stable",
    "Team or user behavior follows a known pattern",
    "Type your own answer"
  ]
})
\`\`\`

For each assumption, ask what happens if it turns out to be false. Capture the "if false" impact alongside the assumption.

#### 6. Risks

Offer common risk categories to prompt thinking:

\`\`\`
question({
  header: "Risks",
  question: "What could go wrong or block this work?",
  options: [
    "Technical complexity or unknowns",
    "Dependency on external systems or teams",
    "Breaking changes to existing behavior",
    "Timeline or scope pressure",
    "Type your own answer"
  ]
})
\`\`\`

For each identified risk, follow up with impact, likelihood, and mitigation in free-form. Challenge "no risks" answers — there are always risks.

### Discussion Techniques

**Ask Open-Ended Questions**:
\`\`\`
"Can you walk me through how a user would interact with this?"
"What happens if [edge case]?"
"Are there any existing patterns in the codebase we should follow?"
"Is there a preferred UI pattern or visual direction we should match?"
\`\`\`

**Validate Understanding**:
\`\`\`
"Let me make sure I understand correctly:
- The feature should [summary]
- It needs to handle [edge cases]
- Success looks like [acceptance criteria]

Is that accurate?"
\`\`\`

**Challenge Assumptions**:
\`\`\`
"I notice you mentioned X. Have you considered Y as an alternative? 
It might be simpler because [reason]."
\`\`\`

### Research During Discussion

Use tools to gather context:
- \`goop_skill\` - Load relevant domain knowledge
- Delegate via the \`task\` tool for technology research
- Delegate via the \`task\` tool to understand existing codebase

### Output

By end of Phase 1, you should have:
- Clear understanding of all requirements
- Identified edge cases and error handling needs
- Agreement on acceptance criteria
- Any technical research completed

### Transition to Phase 2

When requirements are clear:
\`\`\`
"I have a clear picture of what we need:
[Summary of requirements]

Ready to move to planning? I'll create a detailed PLAN.md 
that breaks this into executable tasks."
\`\`\`

**Wait for user confirmation before proceeding to Phase 2.**
</Phase_1_Discuss>`;
}
