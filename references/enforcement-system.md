# Enforcement System

GoopSpec enforcement guards phase correctness and boundary safety.

## Enforced Areas

- phase-allowed actions
- spec lock requirements before execution
- orchestrator delegation boundaries
- file write scope controls

## Key Hooks

- `tool.execute.after`: transitions and guard checks
- `permission.ask`: allow/ask/deny actions
- `system.transform`: inject current constraints into prompts

## Violation Handling

- block unsafe/disallowed actions
- provide recovery command
- log deviations to ADL when applicable

*Enforcement System*
