# Planning Process

Process for `/goop-plan`.

## 1) Gate Check

```text
goop_status()
goop_state({ action: "get" })
Read(".goopspec/REQUIREMENTS.md")
```

Block if interview is incomplete or `REQUIREMENTS.md` is missing.

## 2) Load Planning Context

- Read discovery output and extract: vision, must-haves, constraints, out-of-scope, assumptions, risks.
- Load memory context with `memory_search`.
- Ensure `.goopspec/PROJECT_KNOWLEDGE_BASE.md` exists (create if missing).

## 3) Delegate Blueprint Creation

Delegate to `goop-planner` with:
- project knowledge context
- workflow depth (`shallow|standard|deep`)
- full discovery requirements

Planner must output:
- `SPEC.md`
- `BLUEPRINT.md`
- traceability mapping (100% must-have coverage)
- initialized `CHRONICLE.md`

## 4) Wave Review Protocol

- Ask per-wave clarifying questions (count scales by depth).
- Dispatch research/exploration when unknowns remain.
- Finalize only after wave approvals or explicit "approve all".

## 5) Completion

- Read generated `SPEC.md` and `BLUEPRINT.md`.
- Present coverage summary.
- Save planning memory.
- Recommend next command: `/goop-specify`.

*Planning Process*
