# Discovery Interview Process

Process for `/goop-discuss`.

## 1) Setup

Run before questions:

```text
goop_status()
goop_state({ action: "get" })
```

Then check:
- existing `SPEC.md`/`BLUEPRINT.md` (archive/continue/overwrite flow)
- existing `REQUIREMENTS.md` (fresh/update/reuse)
- memory context with `memory_search`

Optional: branch hygiene at session start.

## 2) Depth Selection

Ask user to choose: Light (`shallow`), Standard (`standard`), Deep (`deep`).

Persist with:

```text
goop_state({ action: "set-depth", depth: "shallow|standard|deep" })
```

## 3) Interview

Collect six items:
- vision
- must-haves
- constraints
- out of scope
- assumptions
- risks + mitigations

Use memory-first prompting: recall known preferences first, then ask.

Optional creative brainstorming is opt-in only.

## 4) Confirm and Save

Present summary, ask for confirmation, then write `REQUIREMENTS.md`.

Mark complete:

```text
goop_state({ action: "complete-interview" })
```

Persist summary with `memory_save`.

## 5) Completion

Provide next command: `/goop-plan`.

*Discovery Interview Process*
