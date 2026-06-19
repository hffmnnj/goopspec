# Debugging

Systematic root-cause analysis over random edits.

## Core Principle

Debugging is hypothesis-driven. Follow the observe → hypothesize → test → repeat loop. Never patch code without understanding why it is broken — a fix without understanding is a future bug waiting to surface.

- Form a specific, falsifiable hypothesis before touching any code.
- One variable at a time: change one thing, observe the result, then decide next steps.
- If a fix works but you don't know why, keep investigating.

## The Debugging Loop

1. **Reproduce the issue reliably**
   - Confirm the bug exists in a clean environment.
   - Document the exact steps, inputs, and expected vs. actual output.
   - If you can't reproduce it, you can't fix it.

2. **Isolate the minimal repro**
   - Strip away unrelated code until only the failing behavior remains.
   - A minimal repro reveals the true scope of the problem.
   - Write it as a failing test if possible.

3. **Form a hypothesis**
   - State what you believe is wrong and why.
   - Rank hypotheses by likelihood before testing.
   - Avoid "let's try this and see" without a reason.

4. **Test the hypothesis**
   - Add targeted logging or assertions to confirm or refute.
   - Run the narrowest test that exercises the suspect code.
   - Record what you learn — even a refuted hypothesis narrows the search.

5. **Fix + verify**
   - Apply the smallest change that addresses the root cause.
   - Re-run the repro to confirm the bug is gone.
   - Run the full test suite to confirm no regressions.

6. **Add a test to prevent regression**
   - Encode the repro as a permanent test.
   - Name the test after the bug, not the fix.
   - Commit the test alongside the fix.

## Logging Strategies

Add logs to observe state at key boundaries — inputs, transitions, and outputs. Remove or gate debug logs before committing.

**When to add logs:**
- When the execution path is unclear.
- When intermediate state is invisible from the outside.
- When a hypothesis requires confirming a value at a specific point.

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

**Cleanup rule:** Never commit `console.log` calls added for debugging. Use a debug flag or remove them before the commit.

## Root Cause Analysis

Fix the cause, not the symptom. Ask "why" five times (the 5-Whys technique) until you reach the underlying issue.

**Bug categories:**

| Category | Description |
|----------|-------------|
| **Logic bug** | The algorithm or condition is wrong. The code does what it says, but what it says is incorrect. |
| **State bug** | Shared or mutable state is modified unexpectedly. Often manifests as intermittent failures. |
| **Timing bug** | Race conditions, unresolved promises, or order-of-execution assumptions. Hard to reproduce consistently. |
| **Environment bug** | Works locally, fails in CI or production. Check env vars, file paths, OS differences, and dependency versions. |

## Common Error Patterns

| Error Pattern | Symptom | First Place to Look |
|---------------|---------|---------------------|
| `undefined is not a function` | Runtime crash on method call | Check if the object is null/undefined before the call; trace where it is initialized |
| `Module not found` | Import fails at startup | Verify the file path, check `package.json` exports, confirm the file exists |
| `Type error` | TypeScript compile error | Read the full error message; check the type definition of the value being passed |
| Race condition | Intermittent failure, passes in isolation | Look for shared mutable state or missing `await` on async operations |
| ESM import resolution (`.js` extension) | `ERR_MODULE_NOT_FOUND` at runtime | Ensure all local imports use `.js` extension even for `.ts` source files |
| `async` not awaited | Returns `Promise<T>` instead of `T`; silent data loss | Search for calls to async functions missing `await`; check return types |
| Test isolation failure | Tests pass alone, fail together | Check for shared global state, module-level singletons, or missing `afterEach` cleanup |
| Stale cache | Old behavior persists after code change | Clear `node_modules/.cache`, `dist/`, or Bun's module cache; restart the process |

## Debugging Tools

- **TypeScript compiler errors** — read them fully; they often point directly at the root cause.
- **Test narrowing** — run only the failing test (`bun test --filter "test name"`) to reduce noise.
- **`console.log` / structured logging** — fast and effective for tracing values; remove before committing.
- **Bun debugger** — attach with `bun --inspect` for breakpoint-based inspection.
- **Browser DevTools** — network tab, console, and sources panel for frontend issues.
- **`git bisect`** — binary search through commits to find when a regression was introduced.

## When to Stop Debugging and Refactor

If you have spent more than 30 minutes without narrowing the problem, the code is likely not debuggable in its current form — it is too tangled to reason about.

**Heuristics for stopping:**
- You cannot write a minimal repro because too many things are coupled.
- Adding a log requires understanding five other modules first.
- Every hypothesis requires changing multiple files to test.
- The same area has had three or more unrelated bugs in the past month.

When these apply, refactor to make the problem visible: extract the suspect logic into a pure function, add unit tests around it, then debug the isolated unit.

## Anti-Patterns

- **Random edits** — changing code without a hypothesis wastes time and introduces new bugs.
- **Commenting out code to see what breaks** — this is not debugging; it is guessing. Form a hypothesis first.
- **Debugging production with live changes** — always reproduce locally; never experiment on live systems.
- **Copy-pasting a fix without understanding it** — you will not recognize the same bug next time, and the fix may not apply correctly.
- **Skipping reproduction** — if you haven't confirmed the bug exists in a controlled way, you don't know what you're fixing.
- **Fixing the symptom, not the cause** — patching the error message while leaving the broken logic intact guarantees the bug returns in a different form.

---

*Debugging v1.0 — GoopSpec Reference*
