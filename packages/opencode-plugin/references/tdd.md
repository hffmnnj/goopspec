# Test-Driven Development

Red → green → refactor cycles for behavior-first implementation.

## Test Execution Discipline

Run the narrowest command that covers what you changed. Escalate one rung only when the rung below cannot cover the change.

| Rung | When | Command |
|------|------|---------|
| 1. File | One file with a co-located test | `bun test path/to/file.test.ts` |
| 2. Directory | Several files in one directory, or no co-located test | `bun test packages/opencode-plugin/src/features/x/` |
| 3. Changed | Shared code under `core/`, `shared/`, or `features/` | `bun test --changed=main` |
| 4. Package | Broad verification is required | `bun test packages/opencode-plugin/` |

Bound every run: `--bail=3 --timeout=10000`.

**Scoped is not skipped.** Before any commit, every change needs at least one passing rung plus `bun run --cwd packages/opencode-plugin typecheck`. State the rung in your VERIFICATION line.

**Three strikes.** After three failed attempts on the same failure, stop and open a `goop_blocker`; do not keep retrying.

**Run rung 4 when:** preparing a PR, after merging or rebasing onto `main`, after resolving conflicts, when changing test infrastructure (`test-utils.ts`, `bunfig.toml`), or at the acceptance gate.

`--changed` requires `=` syntax: `--changed=main`; `--changed main` silently degrades to a path filter. `bun test` has no `--filter` flag: use `-t <regex>` for test-name matching. `--filter` is a `bun run`/`bun pm` workspace flag; with `bun test`, it silently ignores the flag, runs zero tests, and exits 0: a false pass.

## Core Cycle

1. **Red**: write a failing test that describes expected behavior.
2. **Green**: add minimal code to make it pass.
3. **Refactor**: improve design while keeping tests green.

## GoopSpec Usage

- Mark TDD work in planning metadata (`type: tdd`).
- Keep tasks small and verifiable.
- Verify after each phase with project test commands.

## Execution Pattern

| Phase | Action | Commit |
|-------|--------|--------|
| Red | Add a focused failing test; run it to confirm failure | `test(phase-plan): add failing test for X` |
| Green | Implement the minimum behavior; re-run until passing | `feat(phase-plan): implement X` |
| Refactor | Clean up names, structure, duplication; re-run tests | `refactor(phase-plan): clean up X` |

## Test Levels

```
        /\        E2E Tests (Few)
       /  \
      /----\      Integration Tests (Some)
     /      \
    /--------\    Unit Tests (Many)
   /          \
  /------------\
```

| Level | Scope | When to Use |
|-------|-------|-------------|
| Unit | Function/module | Always |
| Integration | Module interactions | When components interact |
| E2E | Critical user flows | Sparingly, for high-value paths |

## Mocking Patterns

```typescript
// Function mock
const mockFetch = mock(() => Promise.resolve({ data: [] }));

// Module mock with Bun: preserve named exports from the real module
const real = await import("./database.js");
mock.module("./database.js", () => ({ ...real, query: mock(() => Promise.resolve([])) }));

// Time mock
jest.useFakeTimers();
jest.advanceTimersByTime(1000);
```

## Coverage Targets

| Type | Target | Critical Path |
|------|--------|---------------|
| Statements | 80% | 95% |
| Branches | 75% | 90% |
| Functions | 80% | 95% |
| Lines | 80% | 95% |

## Test Organization

Co-locate tests with implementation (`*.test.ts` next to `*.ts`). Group integration and E2E tests by domain. Keep reusable fixtures near the tests that use them.

## Best Practices

- Use descriptive test names.
- Follow Arrange / Act / Assert.
- Keep tests independent.
- Mock external dependencies for speed.
- Follow §Test Execution Discipline for test scope and escalation.

## When Not to Use TDD

- Exploratory prototypes.
- Pure configuration work.
- Highly visual-only tweaks without stable assertions.

## Snapshot and Performance Tests

Use snapshot tests sparingly for stable output; update only after intentional changes.

Performance tests assert budgets, not micro-optimizations:

```typescript
it("completes within 100ms", async () => {
  const start = performance.now();
  await heavyOperation();
  expect(performance.now() - start).toBeLessThan(100);
});
```

## Verification

Every TDD task must end with:

- Target tests passing.
- Full suite passing (or a clear reason why not).
- Commit messages that do not reference internal planning IDs.

---

*TDD v1.0 — GoopSpec Reference*
