# Deviation Rules

Rules for deciding when to auto-fix vs stop and ask.

## Rule 1: Bugs (Auto-Fix)

- Trigger: logic/type/runtime/security bugs.
- Action: fix immediately; document in ADL/chronicle.

## Rule 2: Missing Critical Safeguards (Auto-Fix)

- Trigger: missing validation, error handling, auth checks, or safety-critical behavior.
- Action: add required safeguards.

## Rule 3: Blocking Technical Issues (Auto-Fix)

- Trigger: broken imports, missing deps, config blockers.
- Action: unblock and continue.

## Rule 4: Architectural Changes (STOP)

- Trigger: schema changes, framework swaps, major dependencies, breaking APIs, structural redesign.
- Action: stop and request user decision.

## Logging Requirement

For any deviation, log to `goop_adl` with:
- rule number
- issue description
- action taken
- affected files

If unsure which rule applies, default to Rule 4.

*Deviation Rules*
