# Execution Process

Process for `/goop-execute`.

## 1) Gate Check

Run first:

```text
goop_status()
goop_state({ action: "get" })
Read(".goopspec/BLUEPRINT.md")
```

If `spec_locked` is false: block and direct to `/goop-specify`.

## 2) Load Context

Read:
- `.goopspec/SPEC.md`
- `.goopspec/BLUEPRINT.md`
- `.goopspec/CHRONICLE.md`
- `.goopspec/PROJECT_KNOWLEDGE_BASE.md` (if exists)

Then `memory_search` for relevant implementation context.

## 3) Execute by Wave

For each task:
1. delegate to `goop-executor`
2. parse XML status and artifacts
3. update `CHRONICLE.md`
4. continue, resume partials, or handle blockers

## 4) Deviation Handling

- Rule 1-3: auto-fix and document.
- Rule 4: stop, ask user decision, then resume.

## 5) Wave Completion

At each wave boundary:
- run wave-level verification
- update `CHRONICLE.md`
- save checkpoint (`goop_checkpoint`)
- suggest new session when context is heavy

## 6) Execution Complete

When all waves are done:
- transition to accept phase
- suggest `/goop-accept`
- optional PR offer (universal wording only)

*Execution Process*
