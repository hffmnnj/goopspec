# Dogfooding

Test your own product as a user would.

## Why Dogfood

- You find problems users find before they do — and you can fix them before anyone is frustrated.
- Documentation gaps become obvious the moment you try to follow your own instructions.
- Performance feels different in practice than in tests; latency that looks fine in benchmarks can feel sluggish in a real session.
- It builds empathy for the user experience — you stop optimizing for what's easy to build and start optimizing for what's easy to use.
- It catches integration issues that automated tests miss, especially around sequencing, state, and real-world config variation.

## The Dogfooding Mindset

Approach it fresh:

- Forget what you know about the internals. Pretend you just installed the plugin.
- Use it through the public interface only — no peeking at source to understand behavior.
- If something is confusing, it IS confusing. Your insider knowledge is the problem, not the solution.
- Take notes while using, not after. Memory smooths over friction; real-time notes capture it.

## Dogfooding GoopSpec

Specific steps for testing this plugin as a real user would:

- **Run a full workflow end-to-end.** Start with `/goop-discuss`, move through `/goop-plan`, then `/goop-execute`. Don't skip steps or use shortcuts you know from the internals.
- **Exercise the MCP tools directly.** Call `goop_reference`, `goop_read_db`, `goop_write_db`, `goop_state`, `goop_save_note`, and `goop_search_notes` in a real session and observe the responses.
- **Check system prompt injection.** Open a new session and observe what gets injected into the system prompt. Verify the state block, memory block, and DB tools section are present and accurate.
- **Verify reference injection.** Send a message containing a debug keyword (e.g., "tdd", "git workflow"). Confirm the `<goopspec_references>` block appears in the next system prompt with the correct content.
- **Run with `GOOPSPEC_DEBUG=true`.** Set the env var and restart. Confirm verbose log output appears and is readable. Check that it doesn't leak into normal output when the flag is off.

## Manual Testing Patterns

Structured approach to cover the important cases:

| Test Type | What to Verify | Signal That It Works |
|-----------|---------------|----------------------|
| Happy path | Full workflow from discuss → plan → execute | All phases transition correctly; docs written to DB |
| Error recovery | Provide invalid input to a tool | Graceful error message returned; plugin does not crash |
| Edge case (empty state) | Run tools against a fresh `.goopspec/` with no prior workflow | No panics; sensible defaults or clear prompts |
| Performance (hook latency) | Observe system prompt injection timing in a real session | No noticeable delay before the first response token |
| Backward compat (old config) | Use a `goopspec.json` with legacy role names or `thinkingBudget` | Config loads without error; roles resolve correctly |

After testing: document what you found. Create a regression test for any bug you caught.

## Regression Feedback Loop

When you find a bug while dogfooding:

1. Write the minimal reproduction case first — the smallest input that triggers the problem.
2. Confirm it's reproducible in automated tests before touching any code.
3. Fix the bug.
4. Add the automated test so it can never silently regress.
5. Dogfood the fix to confirm it feels right in practice.

The automated test alone is not enough. A fix can be technically correct and still feel wrong in a real session. The "feel" matters too.

## Dogfooding Schedule

When to dogfood:

- **After every significant feature.** Don't wait for a release cycle.
- **Before any release.** Non-negotiable. Releases that skip dogfood ship user-facing friction.
- **When a user reports confusion.** Reproduce their exact steps before diagnosing.
- **At the start of a new workflow.** Verify state is clean and the plugin initializes correctly in a fresh context.

## Feedback Capture

How to record findings so they don't get lost:

- Use `goop_save_note` with tags `["dogfood", "ux", "feedback"]` to persist findings across sessions.
- Write in first person: "I was confused when..." captures the experience better than "the UI is unclear."
- Rate the friction level on a 1–5 scale (1 = minor annoyance, 5 = blocked completely).
- Distinguish UX friction from bugs. Friction is something that works but feels bad. A bug is something that doesn't work. Both matter, but they have different fix priorities.

## Anti-Patterns

Common ways dogfooding fails:

- **Testing by reading the code instead of using it.** Reading confirms what you intended; using reveals what you built.
- **Treating unit test pass as "done."** Tests verify behavior in isolation. Dogfooding verifies behavior in context.
- **Skipping dogfood because you're busy.** This is when it matters most. Shipping without dogfooding is borrowing time from your future self.
- **Only testing the happy path.** Real users hit edge cases constantly. If you only test the path you designed, you only find the bugs you expected.
- **Never acting on your own feedback.** Dogfooding that doesn't change anything is theater. If you found friction and shipped anyway, you didn't dogfood — you audited.

---

*Dogfooding v1.0 — GoopSpec Reference*
