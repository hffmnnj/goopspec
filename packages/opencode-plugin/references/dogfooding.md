# Dogfooding

Test your own product the way a user would.

## Why Dogfood

- Find user problems before users do.
- Expose documentation gaps.
- Catch latency and integration issues automated tests miss.
- Build empathy for the user experience.
- Move from "easy to build" to "easy to use."

## The Dogfooding Mindset

Approach the product as a first-time user:

- Forget the internals.
- Use only the public interface.
- If something is confusing, it is confusing — your insider knowledge is the problem.
- Take notes in real time; memory smooths over friction.

## Dogfooding GoopSpec

- Run a full workflow: `/goop-discuss` → `/goop-plan` → `/goop-execute`. Don't use internal shortcuts.
- Exercise MCP tools directly: `goop_reference`, `goop_read_db`, `goop_write_db`, `goop_state`, `goop_save_note`, `goop_search_notes`.
- Check system prompt injection: open a fresh session and verify the state, memory, and DB-tools blocks.
- Verify reference injection: send a keyword like "tdd" or "git workflow" and confirm the `<goopspec_references>` block appears.
- Run with `GOOPSPEC_DEBUG=true` and confirm verbose logs are readable and gated.

## Manual Testing Patterns

| Test Type | What to Verify | Signal That It Works |
|-----------|---------------|----------------------|
| Happy path | Full workflow from discuss → plan → execute | Phases transition; docs land in DB |
| Error recovery | Invalid tool input | Graceful error; plugin does not crash |
| Edge case (empty state) | Fresh `.goopspec/` with no workflow | Sensible defaults or clear prompts |
| Performance (hook latency) | System prompt injection timing | No noticeable first-token delay |
| Backward compat (old config) | Legacy role names or `thinkingBudget` | Config loads; roles resolve |

After testing, document findings and create a regression test for any bug.

## Regression Feedback Loop

1. Write the minimal reproduction case.
2. Confirm it reproduces in automated tests before changing code.
3. Fix the bug.
4. Add an automated test to prevent regression.
5. Dogfood the fix to confirm it feels right.

The automated test is necessary but not sufficient — a fix can be correct and still feel wrong.

## Dogfooding Schedule

- **After every significant feature.**
- **Before any release.**
- **When a user reports confusion** — reproduce their exact steps first.
- **At the start of a new workflow** — confirm clean state.

## Feedback Capture

Use `goop_save_note` with tags `["dogfood", "ux", "feedback"]`. Write in first person ("I was confused when..."), rate friction 1–5, and distinguish UX friction from bugs.

## Anti-Patterns

- **Testing by reading code** instead of using it. Code shows intent; usage shows reality.
- **Treating unit-test pass as "done."** Tests isolate behavior; dogfooding verifies context.
- **Skipping dogfood because you're busy.** Shipping without dogfooding borrows time from your future self.
- **Only testing the happy path.** Real users hit edge cases.
- **Never acting on feedback.** Dogfooding that doesn't change anything is theater.

---

*Dogfooding v1.0 — GoopSpec Reference*
