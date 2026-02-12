# REQUIREMENTS: {{feature_name}}

**Generated:** {{generated_date}}
**Interview Status:** {{interview_status}}
**Ready for Planning:** {{ready_for_planning}}

---

## Vision

{{vision_statement}}

**Problem Solved:** {{problem_solved}}

**Why Now:** {{why_now}}

---

## Must-Haves (The Contract)

These are non-negotiable. The feature is incomplete without ALL of these:

{{#must_haves}}
- [ ] **{{id}}**: {{title}}
  - {{description}}
  - **Acceptance:** {{acceptance_criteria}}
{{/must_haves}}

---

## Nice-to-Haves

These enhance the deliverable but are not required for acceptance:

{{#nice_to_haves}}
- [ ] **{{id}}**: {{title}}
  - {{description}}
  - **Defer if:** {{defer_condition}}
{{/nice_to_haves}}

---

## Out of Scope

Explicitly excluded from this work:

{{#out_of_scope}}
- **{{item}}**: {{reason}}
{{/out_of_scope}}

---

## Constraints

### Technical Constraints
{{#technical_constraints}}
- {{.}}
{{/technical_constraints}}

### Practical Constraints
{{#practical_constraints}}
- {{.}}
{{/practical_constraints}}

### Integration Constraints
{{#integration_constraints}}
- **{{system}}:** {{constraint}}
{{/integration_constraints}}

---

## Assumptions

We are assuming the following to be true:

{{#assumptions}}
- **{{assumption}}**
  - If false: {{impact}}
{{/assumptions}}

---

## Risks & Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
{{#risks}}
| {{risk}} | {{impact}} | {{likelihood}} | {{mitigation}} |
{{/risks}}

---

## Open Questions

Questions that need answers before or during planning:

{{#open_questions}}
- [ ] **Q{{number}}:** {{question}}
  - Status: {{status}}
  - Answer: {{answer}}
{{/open_questions}}

---

## Interview Checklist

| Question | Answered |
|----------|----------|
| Vision defined | {{vision_answered}} |
| Must-haves listed | {{must_haves_answered}} |
| Constraints documented | {{constraints_answered}} |
| Out of scope defined | {{out_of_scope_answered}} |
| Assumptions listed | {{assumptions_answered}} |
| Risks identified | {{risks_answered}} |

**Interview Complete:** {{interview_complete}}

---

*Discovery interview output - GoopSpec v0.2.7*
*Run `/goop-plan` when ready for planning.*
