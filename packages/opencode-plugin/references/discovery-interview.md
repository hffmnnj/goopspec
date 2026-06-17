# Discovery Interview

Mandatory gate before planning. Captures six categories of requirements so the contract is built on a solid foundation.

## Core Principle

> No planning without discovery. The interview ensures we build the right thing.

## When to Run

- Triggered by `/goop-discuss`.
- Required before `/goop-plan`.
- Output: `.goopspec/<workflowId>/REQUIREMENTS.md`.
- State update: `interview_complete: true`.

## The Six Questions

### 1. Vision (The What)

- What problem does this solve?
- Who is this for?
- What does success look like?

Good answer: "A JWT-based auth system that lets users sign up, log in, and access protected resources."
Bad answer: "Auth stuff."

### 2. Must-Haves (The Contract)

- What MUST be delivered for this to be complete?
- What are the acceptance criteria?

Every must-have must be specific, testable, and traced to tasks in the blueprint.

### 3. Constraints (The Boundaries)

- Stack, frameworks, versions.
- Performance or scale targets.
- Timeline and resources.
- Existing code to integrate with.

### 4. Out of Scope (The Guardrails)

- Features deferred to later phases.
- Approaches explicitly avoided.

If out of scope is empty, scope creep is inevitable.

### 5. Assumptions (The Baseline)

- Existing functionality being relied on.
- Decisions already made.
- External dependencies treated as stable.

For each assumption, capture the impact if it turns out to be false.

### 6. Risks (The Unknowns)

- What could go wrong or block work?
- What dependencies are uncertain?

Every risk needs impact, likelihood, and mitigation.

## Interview Flow

1. **Setup**: check state, detect existing docs, offer branch creation, set research depth and autopilot mode.
2. **Workflow ID creation**: infer a kebab-case `workflowId` from the vision, create and bind it via `goop_state` before writing any docs.
3. **Open-ended discovery**: ask broad questions about intent and users.
4. **Structured questioning**: use the `question` tool for each category, with practical option seeds and a custom-answer path.
5. **Probe for specifics**: convert vague answers into concrete targets.
6. **Summarize and confirm**: present the six answers back to the user.
7. **Lock discovery**: write `REQUIREMENTS.md`, set `interview_complete: true`, save to memory.

## Structured Question Policy

- All short-answer interactions during discovery MUST use the `question` tool.
- Use free-form text only for open-ended detail and follow-up probing.
- Mark exactly one option as `(Recommended)` per `question` call.
- Present 10 or fewer options per `question` call; split large lists into batched calls with `(1 of N)` headers.
- Use `multiple: true` for collecting must-haves, risks, constraints, and out-of-scope items.

## Memory-Aware Questioning

Before asking anything:

1. `memory_search({ query: "[topic] preference" })`
2. If high-confidence memory exists, recall it lightly: "I see you prefer X. Still true?"
3. If no memory exists, ask and save the answer with `memory_note` or `memory_save`.

## Lazy Autopilot Interview Behavior

When `workflow.lazyAutopilot == true`:

- Skip the interactive six-question interview.
- Infer all six categories directly from the user's initial prompt.
- Do not use the `question` tool.
- Infer a `feat/kebab-case` branch name and create it silently.
- Generate `REQUIREMENTS.md` directly.
- Proceed to `/goop-plan` immediately without a confirmation gate.

## REQUIREMENTS.md Template

```markdown
# REQUIREMENTS: [Feature Name]

**Generated:** [date]
**Status:** Locked

## Vision
[What and why]

## Must-Haves
- [ ] [Requirement 1]
- [ ] [Requirement 2]

## Constraints
### Technical
- [Constraint 1]

### Practical
- [Timeline, budget, resources]

## Out of Scope
- [Item 1] — [reason/future phase]

## Assumptions
- [Assumption 1] — If false: [Impact]

## Risks & Mitigations
| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| [Risk 1] | H/M/L | H/M/L | [Plan] |

*Discovery interview completed. Ready for /goop-plan.*
```

## Validation Rules

The interview is not complete if:

- Vision is vague (< 2 sentences).
- Must-haves is empty.
- Out of scope is empty.
- No risks are identified.

## Skip Conditions

Discovery may be skipped only for:

- `/goop-quick` small tasks (single file, < 30 min).
- Bug fixes with clear reproduction steps.
- Documentation-only changes.

## Anti-Patterns

- Rushing through with one-sentence answers.
- Leaving out of scope undefined.
- Claiming there are no risks.
- Asking in plain text without the `question` tool.

---

*Discovery Interview v1.0 — GoopSpec Reference*
