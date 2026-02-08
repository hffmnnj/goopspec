# Codebase Mapping Process

Process for `/goop-map-codebase` on brownfield projects.

## 1) Initialize

- Ensure `.goopspec/codebase/` exists.
- Detect project type from root indicators (package manifests, build files).

## 2) Parallel Exploration

Delegate focused exploration outputs to:
- `STACK.md`
- `ARCHITECTURE.md`
- `STRUCTURE.md`
- `CONVENTIONS.md`
- `TESTING.md`
- `INTEGRATIONS.md`
- `CONCERNS.md`

Use parallel agents when tasks are independent.

## 3) Synthesize

- Resolve conflicting findings.
- Highlight critical risks and unknowns.
- Summarize priorities for planning.

## 4) Completion

Report created artifacts and recommend next step:
- `/goop-setup`

Then suggest reading `CONCERNS.md` first for risk-aware planning.

*Codebase Mapping Process*
