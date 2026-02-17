# SPEC: {{project_name}}

**Version:** {{version}}
**Created:** {{created_date}}
**Last Updated:** {{updated_date}}
**Status:** {{status}}
**Locked:** {{locked}}
{{#locked_at}}**Locked At:** {{locked_at}}{{/locked_at}}

---

## Vision

{{vision}}

**Why this matters:** {{why}}

**Target Users:** {{target_users}}

---

## Must-Haves (The Contract)

These are non-negotiable. The spec is not complete until ALL must-haves are delivered.

{{#must_haves}}
### MH{{number}}: {{title}}

{{description}}

**Acceptance Criteria:**
{{#acceptance_criteria}}
- [ ] {{.}}
{{/acceptance_criteria}}

**Traced To:** {{#traced_to}}Wave {{wave}}, Task {{task}}{{/traced_to}}{{^traced_to}}*Not yet mapped*{{/traced_to}}

---
{{/must_haves}}

## Nice-to-Haves

These enhance the deliverable but are not required for acceptance.

{{#nice_to_haves}}
- [ ] **NH{{number}}: {{title}}**: {{description}}
  - Defer if: {{defer_condition}}
{{/nice_to_haves}}

---

## Out of Scope

Explicitly excluded to prevent scope creep.

{{#out_of_scope}}
- **{{item}}** — {{reason}}
{{/out_of_scope}}

---

## Technical Constraints

### Stack (Non-Negotiable)
| Component | Technology | Version |
|-----------|------------|---------|
| Runtime | {{runtime}} | {{runtime_version}} |
| Language | {{language}} | {{language_version}} |
| Framework | {{framework}} | {{framework_version}} |
| Database | {{database}} | {{database_version}} |
| Testing | {{testing}} | {{testing_version}} |

### Conventions
| Aspect | Standard |
|--------|----------|
| Files | {{file_naming}} |
| Components | {{component_naming}} |
| Functions | {{function_naming}} |
| Commits | {{commit_format}} |

### Boundaries

**Always Do:**
{{#always}}
- {{.}}
{{/always}}

**Ask First:**
{{#ask_first}}
- {{.}}
{{/ask_first}}

**Never Do:**
{{#never}}
- {{.}}
{{/never}}

---

## Assumptions

We are assuming:

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

## Traceability Matrix

Every must-have maps to specific blueprint tasks:

| Must-Have | Covered By | Status |
|-----------|------------|--------|
{{#traceability}}
| MH{{mh_number}}: {{mh_title}} | Wave {{wave}}, Task {{task}} | {{status}} |
{{/traceability}}

**Coverage:** {{coverage_percentage}}% of must-haves mapped

---

## Acceptance Criteria

The spec is complete when:

{{#final_acceptance}}
1. {{.}}
{{/final_acceptance}}

---

## Amendment History

| Version | Date | Change | Impact | Approved By |
|---------|------|--------|--------|-------------|
{{#amendments}}
| {{version}} | {{date}} | {{change}} | {{impact}} | {{approved_by}} |
{{/amendments}}

---

## Verification Protocol

Before acceptance, verify:

- [ ] All must-haves pass acceptance criteria
- [ ] All tests pass
- [ ] No type errors
- [ ] Security checklist reviewed
- [ ] Documentation updated

---

*This specification is a CONTRACT. Changes require explicit amendment via `/goop-amend`.*
*GoopSpec v0.2.8*
