# Workflow Paths Reference

## Overview
GoopSpec v2 introduces workflow-scoped document paths. Workflow documents
live in `.goopspec/<workflowId>/` instead of the root `.goopspec/`.

## Path Routing Rules

| File | Location | Notes |
|------|----------|-------|
| SPEC.md | `.goopspec/<workflowId>/SPEC.md` | Workflow-scoped |
| BLUEPRINT.md | `.goopspec/<workflowId>/BLUEPRINT.md` | Workflow-scoped |
| CHRONICLE.md | `.goopspec/<workflowId>/CHRONICLE.md` | Workflow-scoped |
| REQUIREMENTS.md | `.goopspec/<workflowId>/REQUIREMENTS.md` | Workflow-scoped |
| HANDOFF.md | `.goopspec/<workflowId>/HANDOFF.md` | Workflow-scoped |
| RESEARCH.md | `.goopspec/<workflowId>/RESEARCH.md` | Workflow-scoped |
| ADL.md | `.goopspec/<workflowId>/ADL.md` | Workflow-scoped |
| checkpoints/ | `.goopspec/<workflowId>/checkpoints/` | Workflow-scoped |
| history/ | `.goopspec/<workflowId>/history/` | Workflow-scoped |
| state.json | `.goopspec/state.json` | GLOBAL — never moves |
| config.json | `.goopspec/config.json` | GLOBAL — never moves |
| memory.db | `.goopspec/memory.db` | GLOBAL — never moves |
| archive/ | `.goopspec/archive/` | GLOBAL — never moves |
| sessions/ | `.goopspec/sessions/` | GLOBAL — never moves |
| PROJECT_KNOWLEDGE_BASE.md | `.goopspec/PROJECT_KNOWLEDGE_BASE.md` | GLOBAL — shared across workflows |

## Default Workflow
The `"default"` workflow uses the root `.goopspec/` directory for backward
compatibility with existing installations. Files remain at their original paths.

## Non-Default Workflows
For any `workflowId` other than `"default"`, files are scoped to
`.goopspec/<workflowId>/` subdirectory.

## Example
For `workflowId = "feat-auth"`:
- SPEC.md → `.goopspec/feat-auth/SPEC.md`
- BLUEPRINT.md → `.goopspec/feat-auth/BLUEPRINT.md`
- CHRONICLE.md → `.goopspec/feat-auth/CHRONICLE.md`
- state.json → `.goopspec/state.json` (always root)
- config.json → `.goopspec/config.json` (always root)

## Archive Path
When a workflow is accepted and archived:
- Source: `.goopspec/<workflowId>/`
- Destination: `.goopspec/archive/<workflowId>-<timestamp>/`

## Resolving workflowId
Always resolve `workflowId` from the state manager before reading or writing workflow docs:

```typescript
const state = goop_state({ action: "get" });
const workflowId = state.workflow.workflowId ?? "default";
const docPath = workflowId === "default"
  ? ".goopspec/"
  : `.goopspec/${workflowId}/`;
```

## Agent Directive
Agents MUST:
- Read `workflowId` from `goop_state` before accessing any workflow document
- Write all workflow docs to `.goopspec/<workflowId>/` — NEVER to `.goopspec/` root (except "default")
- Pass `workflowId` in all subagent delegation prompts

---

*Workflow Paths Reference v0.2.9*
