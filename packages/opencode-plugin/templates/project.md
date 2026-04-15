# PROJECT: {{project_name}}

**Type:** {{project_type}}
**Created:** {{created_date}}
**Status:** Active

---

## Vision

{{vision_statement}}

### Why This Matters
{{why_it_matters}}

### Target Users
{{target_users}}

---

## Success Criteria

When complete, we will have:

{{#success_criteria}}
- {{.}}
{{/success_criteria}}

---

## Technical Foundation

### Stack
| Layer | Technology | Version |
|-------|------------|---------|
| Runtime | {{runtime}} | {{runtime_version}} |
| Language | {{language}} | {{language_version}} |
| Framework | {{framework}} | {{framework_version}} |
| Database | {{database}} | {{database_version}} |
| Testing | {{testing}} | {{testing_version}} |

### Key Dependencies
{{#dependencies}}
- `{{name}}`: {{purpose}}
{{/dependencies}}

---

## Conventions

### Naming
- **Files:** {{file_naming}}
- **Functions:** {{function_naming}}
- **Components:** {{component_naming}}
- **Constants:** {{constant_naming}}

### Code Style
- **Exports:** {{export_style}}
- **Types:** {{type_style}}
- **Error Handling:** {{error_handling}}

### Git
- **Branch Format:** {{branch_format}}
- **Commit Format:** {{commit_format}}
- **PR Process:** {{pr_process}}

---

## Architecture Overview

{{architecture_description}}

### Directory Structure
```
{{directory_structure}}
```

### Key Integration Points
{{#integration_points}}
- **{{name}}:** {{description}}
{{/integration_points}}

---

## Boundaries

### Always Do
{{#always_do}}
- {{.}}
{{/always_do}}

### Ask First
{{#ask_first}}
- {{.}}
{{/ask_first}}

### Never Do
{{#never_do}}
- {{.}}
{{/never_do}}

---

## Milestones

| Milestone | Status | Target |
|-----------|--------|--------|
{{#milestones}}
| {{name}} | {{status}} | {{target_date}} |
{{/milestones}}

---

*Project foundation document - GoopSpec v0.2.8*
