# Workflow: Execute

Implements the locked blueprint in wave order.

## Preconditions

- spec is locked
- blueprint exists and is readable

## Core Loop

1. pick current wave/task
2. delegate implementation
3. verify and log artifacts
4. handle deviations (Rule 1-4)

## Completion

- all must-have tasks complete
- verification checks pass
- transition to `/goop-accept`

*Workflow: Execute*
