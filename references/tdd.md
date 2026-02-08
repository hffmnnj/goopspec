# Test-Driven Development (TDD)

Use red -> green -> refactor cycles for behavior-first implementation.

## Core Cycle

1. **Red**: write a failing test.
2. **Green**: add minimal code to pass.
3. **Refactor**: improve design while keeping tests green.

## GoopSpec Usage

- Mark TDD work in planning metadata (`type: tdd`).
- Keep tasks small and verifiable.
- Verify after each phase with project test commands.

## Execution Pattern

### Red

- Add focused failing test.
- Run target test to confirm failure.

### Green

- Implement minimum behavior.
- Re-run target tests until passing.

### Refactor

- Improve names/structure/extraction.
- Re-run tests to confirm no regressions.

## Test Levels

- Unit: function/module behavior
- Integration: module interactions
- E2E: critical user flows only

## Best Practices

- descriptive test names
- Arrange/Act/Assert structure
- independent tests
- mock external dependencies for speed

## Avoid TDD For

- exploratory prototypes
- pure configuration work
- highly visual-only tweaks without stable assertions

*TDD Reference*
