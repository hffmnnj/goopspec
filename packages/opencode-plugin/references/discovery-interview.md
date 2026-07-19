# Discovery Interview

Mandatory gate before `/goop-plan`. Captures vision, must-haves, constraints, out-of-scope, assumptions, risks, and atomic-PR preference.

## When to Run

- Triggered by `/goop-discuss`.
- Output: `requirements` document via `goop_write_db({ doc_type: "requirements", content: "..." })`.
- State update: `interview_complete: true`.

## The Seven Questions

### 1. Vision
- What problem does this solve?
- Who is this for?
- What does success look like?

Good: "A JWT-based auth system that lets users sign up, log in, and access protected resources."
Bad: "Auth stuff."

### 2. Must-Haves
- What MUST be delivered?
- What are the acceptance criteria?

Every must-have must be specific, testable, and traced to wave tasks recorded via `goop_write_wave`.

### 3. Constraints
- Stack, frameworks, versions.
- Performance or scale targets.
- Timeline and resources.
- Existing code to integrate with.

### 4. Out of Scope
- Features deferred to later phases.
- Approaches explicitly avoided.

If out of scope is empty, scope creep is inevitable.

### 5. Assumptions
- Existing functionality being relied on.
- Decisions already made.
- External dependencies treated as stable.

Capture the impact if each assumption turns out false.

### 6. Risks
- What could go wrong or block work?
- What dependencies are uncertain?

Every risk needs impact, likelihood, and mitigation.

### 7. Atomic PR Strategy
- Prefer atomic PRs? One PR per wave, merged before the next begins.
- Options: `Yes, one PR per wave (Recommended)` / `No, single PR for all work` / `Custom`.
- Written to REQUIREMENTS.md under `## Atomic PR Strategy`.
- `Yes`: planner records `**PR:**` and `**Branch:**` for every wave via `goop_write_wave`. BLUEPRINT.md no longer carries per-wave PR/branch fields.
- `No`: all work lands in one branch and one PR.

## Interview Flow

1. Setup: check state, detect existing docs, set research depth and autopilot mode.
2. Create workflow: infer a kebab-case `workflowId` from the vision, create and bind it via `goop_state` before writing docs.
3. Open-ended discovery: ask broad questions about intent and users.
4. Structured questioning: use the `question` tool per category, with practical options and a custom-answer path.
5. Probe for specifics: convert vague answers into concrete targets.
6. Summarize and confirm: present the six answers back to the user.
7. Lock discovery: write REQUIREMENTS.md, set `interview_complete: true`, save to memory.

## Structured Question Policy

- All short-answer discovery interactions MUST use the `question` tool.
- Use free-form text only for open-ended detail and follow-up probing.
- Mark exactly one option as `(Recommended)` per call.
- Present ≤10 options per call; split larger lists into batched calls with `(1 of N)` headers.
- Use `multiple: true` for must-haves, risks, constraints, and out-of-scope items.

## Memory-Aware Questioning

Before asking:

1. `memory_search({ query: "[topic] preference" })`
2. If high-confidence memory exists, recall it lightly: "I see you prefer X. Still true?"
3. If no memory exists, ask and save the answer with `memory_save` or `memory_note`.

## Lazy Autopilot Interview Behavior

When `workflow.lazyAutopilot == true`:

- Skip the interactive interview and the `question` tool.
- Infer all six categories from the user's initial prompt.
- Infer a `feat/kebab-case` branch name and create it silently.
- Default atomic PR preference to `Yes` unless the user explicitly opts out.
- Write REQUIREMENTS.md directly.
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

## Atomic PR Strategy
[Yes — one PR per wave / No — single PR / Custom]

*Discovery interview completed. Ready for /goop-plan.*
```

## Validation Rules

The interview is incomplete if:

- Vision is vague (< 2 sentences).
- Must-haves is empty.
- Out of scope is empty.
- No risks are identified.
- `## Atomic PR Strategy` section is missing.

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
