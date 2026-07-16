# Debugging

Systematic root-cause analysis over random edits.

## Core Principle

Debugging is hypothesis-driven. Follow observe → hypothesize → test → repeat. Never patch code without understanding why it is broken — a fix without understanding is a future bug.

- Form a specific, falsifiable hypothesis before changing code.
- Change one variable at a time.
- If a fix works but you don't know why, keep investigating.

## The Debugging Loop

1. **Reproduce the issue reliably** — confirm in a clean environment; document steps, inputs, and expected vs. actual output. If you can't reproduce it, you can't fix it.
2. **Isolate the minimal repro** — strip unrelated code until only the failing behavior remains; write it as a failing test if possible.
3. **Form a hypothesis** — state what is wrong and why; rank hypotheses by likelihood.
4. **Test the hypothesis** — add targeted logging or assertions; run the narrowest test that exercises the suspect code; record what you learn.
5. **Fix + verify** — apply the smallest change that addresses the root cause; re-run the repro and the full suite.
6. **Add a regression test** — encode the repro as a permanent test named after the bug; commit it with the fix.

## Logging Strategies

Add logs to observe state at inputs, transitions, and outputs. Remove or gate debug logs before committing.

**When to add logs:**
- Execution path is unclear.
- Intermediate state is invisible from the outside.
- A hypothesis requires confirming a value at a specific point.

**What to log:**
- Function inputs and outputs.
- State transitions (before → after).
- Unexpected branches or fallback paths.

**Structured debug log pattern (TypeScript):**

```typescript
// Gate behind GOOPSPEC_DEBUG or equivalent env flag
if (process.env.DEBUG) {
  console.log(JSON.stringify({
    fn: "processOrder",
    input: { orderId, userId },
    state: { status: order.status },
    ts: Date.now(),
  }));
}
```

**Cleanup rule:** Never commit `console.log` calls added for debugging. Use a debug flag or remove them.

## Root Cause Analysis

Fix the cause, not the symptom. Ask "why" repeatedly (5-Whys) until you reach the underlying issue.

| Category | Description |
|----------|-------------|
| **Logic bug** | The algorithm or condition is wrong. The code does what it says, but what it says is incorrect. |
| **State bug** | Shared or mutable state is modified unexpectedly. Often manifests as intermittent failures. |
| **Timing bug** | Race conditions, unresolved promises, or order-of-execution assumptions. Hard to reproduce. |
| **Environment bug** | Works locally, fails in CI or production. Check env vars, file paths, OS differences, dependency versions. |

## Common Error Patterns

| Error Pattern | Symptom | First Place to Look |
|---------------|---------|---------------------|
| `undefined is not a function` | Runtime crash on method call | Check if the object is null/undefined before the call; trace initialization |
| `Module not found` | Import fails at startup | Verify the file path, `package.json` exports, and file existence |
| `Type error` | TypeScript compile error | Read the full error message; check the type of the value being passed |
| Race condition | Intermittent failure, passes in isolation | Look for shared mutable state or missing `await` on async operations |
| ESM import resolution (`.js` extension) | `ERR_MODULE_NOT_FOUND` at runtime | Ensure all local imports use `.js` extension even for `.ts` source files |
| `async` not awaited | Returns `Promise<T>` instead of `T`; silent data loss | Search for calls to async functions missing `await`; check return types |
| Test isolation failure | Tests pass alone, fail together | Check for shared global state, module-level singletons, or missing `afterEach` cleanup |
| Stale cache | Old behavior persists after code change | Clear `node_modules/.cache`, `dist/`, or Bun's module cache; restart the process |

## Debugging Tools

- **TypeScript compiler errors** — read them fully; they often point directly at the root cause.
- **Test narrowing** — run only the failing test (`bun test --filter "test name"`) to reduce noise.
- **`console.log` / structured logging** — fast tracing; remove before committing.
- **Bun debugger** — attach with `bun --inspect` for breakpoint-based inspection.
- **Browser DevTools** — network, console, and sources panel for frontend issues.
- **`git bisect`** — binary search through commits to find regressions.

## When to Stop Debugging and Refactor

If you have spent more than 30 minutes without narrowing the problem, the code is likely too tangled to reason about.

Stop when:

- You cannot write a minimal repro because too many things are coupled.
- Adding a log requires understanding five other modules first.
- Every hypothesis requires changing multiple files to test.
- The same area has had three or more unrelated bugs in the past month.

When these apply, extract the suspect logic into a pure function, add unit tests, then debug the isolated unit.

## Anti-Patterns

- **Random edits** — changing code without a hypothesis wastes time and introduces bugs.
- **Commenting out code to see what breaks** — guessing, not debugging. Form a hypothesis first.
- **Debugging production with live changes** — reproduce locally; never experiment on live systems.
- **Copy-pasting a fix without understanding it** — you will miss the same bug next time.
- **Skipping reproduction** — if you haven't confirmed the bug in a controlled way, you don't know what you're fixing.
- **Fixing the symptom, not the cause** — patching the error message while leaving broken logic intact guarantees the bug returns.

---

*Debugging v1.0 — GoopSpec Reference*
