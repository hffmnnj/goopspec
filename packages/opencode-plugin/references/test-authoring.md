# Test Authoring

Writing tests that catch regressions, not consume budget.

## Why This Exists

More tests ≠ better outcomes. Every rule below is a pre-commit self-check against low-signal tests — assertions that probe rather than verify, coverage that moves a number rather than catch a regression. The remedy is discipline, not volume.

## What Is Worth Testing

Test behavior, not implementation. Implementation details are things callers don't see — testing them creates a third user the code must serve.

- **Name the behavior change that would flip this assertion.** If you can't, delete the test.
- **If you deleted the SUT, would this test still pass?** If yes, it tests the framework or your mocks, not your code.
- **Would this assertion fail to compile if the behavior were wrong?** If yes, the type system owns it, not you.
- **Would a caller be surprised this test exists?** If yes, you're testing structure, not behavior.

Don't test the framework, language, or your own mocks. Don't write a test just to have written one.

## Test-Value Heuristics

A good test fails when behavior breaks and passes when behavior is correct (the *would-it-fail* test).

- **If you removed this test, would any real regression go uncaught?** If no, deleting it is the right move.
- **Did you write this to move a coverage number?** If yes, it's coverage-driven — delete it. Coverage is a discovery tool for finding untested code, not a KPI or gate.
- **Is the test hard to write?** That signals bad interface design — fix the interface, don't mock harder.
- **Is the change trivial wiring the type system or linter already covers?** Skip it. "I get paid for code that works, not for tests." — Beck.

Deleting (or not writing) a low-signal test is a valid outcome.

## Core Cycle

1. **Red** — write a failing test that describes expected behavior.
2. **Green** — add minimal code to make it pass.
3. **Refactor** — improve design while keeping tests green.

## Speed Discipline

A unit test should be sub-second; a suite you won't run before every commit is too slow.

| Size | May touch | Time limit |
|------|-----------|------------|
| Small (≈unit) | No network, disk, DB, threads, sleeps | 60s |
| Medium (≈integration) | localhost DB/files, single machine | 300s |
| Large (≈E2E) | Real network, external systems | 900s+ |

- **Does this test touch the network, disk, or a real DB?** If yes, it's not a unit test — push it down the size ladder.
- **Would you wait for this suite before every commit?** If no, a >5 min suite is a defect, not a feature.
- **What code are you actually running?** Minimize it. Large tests are 28× flakier than small ones (0.5% → 14%).

## Test Levels

The Pyramid (Fowler/Cohn) and the Testing Trophy (KCD) genuinely disagree on the unit:integration ratio. The split is partly definitional: a "unit" to a classicist is smaller than to a JS dev whose unit is a component tree.

```
      /\        E2E (Few)
     /  \
    /----\      Integration (Some)
   /      \
  /--------\    Unit (Many)
```

| Level | Scope | When to Use |
|-------|-------|-------------|
| Unit | Function/module | Default |
| Integration | Module interactions | When components interact |
| E2E | Critical user flows | Sparingly, for high-value paths |

**Agreed core** (not in dispute): E2E should be few; confidence-per-test increases as you move up the ladder; don't chase 100% coverage; avoid implementation-detail tests.

**When integration or E2E is justified:**
- A unit test mocks so much it can only prove the mocks work — promote it.
- The integration *is* the risk (components must compose; a bug crosses module boundaries).
- The behavior is only observable end-to-end (a critical user flow).

- **Does this unit test mock so much it proves only the mocks?** Promote to integration.
- **Is the integration test doing what a unit test could?** Demote it (ice-cream cone).

## Mocking Discipline

Mock at boundaries: external APIs, clock, randomness, filesystem, network, email, payment. Use real objects inside the boundary.

- **Is the thing you're mocking something you'd never run for real in a test?** If no, prefer the real object.
- **If the real collaborator changed its contract, would this test still pass?** If yes, it's testing the mock, not the integration.
- **Are you verifying a collaborator was called, without checking any real output?** That asserts wiring, not behavior — unless the call *is* the behavior (sending an email).

Prefer a **Fake** (working in-memory impl) over a **Mock** (canned expectations): fakes preserve real semantics, mocks assert on scripted ones.

```typescript
// Function mock
const mockFetch = mock(() => Promise.resolve({ data: [] }));
// Module mock (Bun): preserve named exports from the real module
const real = await import("./database.js");
mock.module("./database.js", () => ({ ...real, query: mock(() => Promise.resolve([])) }));
// Time mock
jest.useFakeTimers();
jest.advanceTimersByTime(1000);
```

## Determinism

A flaky test is a bug — in the test or in production. ~1/6 of flakes that trace to a code change are real production bugs.

| Source | Fix |
|--------|-----|
| Wall-clock time / dates | Inject a fake clock; freeze time |
| Randomness (`Math.random`, UUIDs) | Seeded RNG; assert on structure, not exact values |
| Test ordering / shared state | Full teardown per test; no shared mutable fixtures |
| Network / external services | Mock or Fake at the boundary; never real network in Small |
| `sleep()` / fixed waits | Poll-with-timeout; await promise resolution; no sleeps in Small |
| Async races | Await all microtasks; deterministic schedulers; no real threads in unit tests |
| Filesystem / DB residue | Per-test temp dirs; in-memory DB reset |

- **Run this test 10× with no code change.** Any variation? It's flaky — quarantine and fix the root cause.
- **Are you auto-retrying flaky tests?** Retry is a stopgap, not a fix. A reliably failing test beats a flaky one.

## Assertion Quality

Few strong assertions beat many weak ones. One *logical* assertion per test — a failure should point at one cause.

- **If this test fails, does the message name the broken behavior?** "expected true, received false" is too weak — use "checkout should reject empty cart, got accepted".
- **Is your only check `assert x is not None`?** That's a precondition, not an assertion — you've written a probe, not a test.
- **If the test fails, is the cause obvious?** If you can't tell which assert broke (Assertion Roulette), split the test.
- **Does this snapshot encode intended behavior or just current output?** If the latter, it locks in whatever's there now — review every diff deliberately.

Don't assert what the type system guarantees.

## Anti-Pattern Catalogue

Self-check against each before committing.

| # | Smell | Self-check |
|---|-------|------------|
| 1 | Testing private methods | Does the test reach into internals callers never use? |
| 2 | Assertion Roulette | Many asserts, failure won't say which — split it |
| 3 | Mystery Guest | Depends on shared fixture the reader can't see — inline it |
| 4 | Excessive Setup | Dozens of fixture lines before the act — extract or shrink |
| 5 | Tautological test | Asserts a constant, or the mock returns what it was told — can never fail |
| 6 | Coverage-driven testing | Written to move a number, not to catch a regression |
| 7 | Testing the mock/framework | Asserts the tool behaves, not the SUT |
| 8 | Fragile Test | Breaks on refactor that preserves behavior |
| 9 | Erratic Test | Passes sometimes, fails sometimes — same code |
| 10 | Slow Tests | Suite too slow to run before every commit |
| 11 | Test Code Duplication | Same setup/asserts repeated — extract a helper |
| 12 | Test Logic in Production | Production branches only exercised in tests |
| 13 | Conditional Test Logic | Test has if/else — some paths never run |
| 14 | Ice-cream cone | Many E2E, few unit — inverted pyramid |
| 15 | The Test User | Tests use the code unlike real users — implementation coupling |
| 16 | Snapshot spam | Dozens of snapshots locking in current output |

## Test Execution Discipline

Run the narrowest command that covers what you changed. Escalate one rung when the one below can't.

| Rung | When | Command |
|------|------|---------|
| 1. File | One file with a co-located test | `bun test path/to/file.test.ts` |
| 2. Directory | Several files in one directory, or no co-located test | `bun test packages/opencode-plugin/src/features/x/` |
| 3. Changed | Shared code under `core/`, `shared/`, or `features/` | `bun test --changed=main` |
| 4. Package | Broad verification is required | `bun test packages/opencode-plugin/` |

Bound every run: `--bail=3 --timeout=10000`.

**Scoped is not skipped.** Before any commit, every change needs at least one passing rung plus `bun run --cwd packages/opencode-plugin typecheck`. State the rung in VERIFICATION.

**Three strikes.** After three failed attempts on the same failure, stop and open a `goop_blocker`; do not keep retrying.

**Run rung 4 when:** preparing a PR, after merging or rebasing onto `main`, after resolving conflicts, when changing test infrastructure (`test-utils.ts`, `bunfig.toml`), or at the acceptance gate.

`--changed` requires `=` syntax: `--changed=main`; `--changed main` silently degrades to a path filter. `bun test` has no `--filter` flag: use `-t "<regex>"` for test-name matching. `--filter` is a `bun run`/`bun pm` workspace flag; with `bun test`, it silently ignores the flag, runs zero tests, and exits 0: a false pass.

## Coverage as Byproduct

| Type | Typical | Critical Path |
|------|--------|---------------|
| Statements | 80% | 95% |
| Branches | 75% | 90% |
| Functions | 80% | 95% |
| Lines | 80% | 95% |

Coverage is a discovery tool, not a KPI.

## Test Organization

Co-locate tests with implementation (`*.test.ts` next to `*.ts`). Group integration and E2E by domain. Keep fixtures near the tests that use them.

## Snapshot and Performance Tests

Use snapshots sparingly for stable output; update only after intentional changes.

Performance tests assert budgets, not micro-optimizations:

```typescript
it("completes within 100ms", async () => {
  const start = performance.now();
  await heavyOperation();
  expect(performance.now() - start).toBeLessThan(100);
});
```

## Pre-Commit Checklist

Before every commit:

1. **Lint** — `bun run --cwd packages/opencode-plugin lint` must exit 0. Don't treat lint as a post-hoc gate — two executors needed `style:` fixup commits from skipping it.
2. **Typecheck** — `bun run --cwd packages/opencode-plugin typecheck` must exit 0.
3. **Tests** — Run the narrowest covering rung (see §Test Execution Discipline) with `--bail=3 --timeout=10000`.

---

*Test Authoring v1.0 — GoopSpec Reference*
