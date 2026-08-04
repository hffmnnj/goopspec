/**
 * Reachability tests for the idle-triage hook.
 *
 * These tests prove execution *through the registered hook path* — not
 * isolated unit tests of the classifiers. The acceptance bar for Wave 3
 * Task 3.1 is that a substantive idle prompt reaches `detectAutoDelegation`,
 * the routing classifier, and `detectTaskMode` for real, via the registered
 * `chat.message` + `experimental.chat.system.transform` handlers, and that
 * trivial/non-idle prompts do not.
 *
 * Reachability is proven from observable output: the injected
 * `<goopspec_triage>` block's content varies with each classifier's output
 * across prompts. That variation can only be explained if the hook genuinely
 * runs the live classifiers. No spies are needed.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  type PluginContext,
  createDefaultWorkflowState,
  createMockPluginContext,
  setupTestEnvironment,
} from "../../test-utils.js";
import { createIdleTriageHook } from "./index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal call shape the handlers actually read (verified in index.ts). */
type HookCall<I, O> = (input: I, output: O) => Promise<void>;

/** Run the full registered hook flow for one prompt; return the system[]. */
async function runTriageFlow(
  ctx: PluginContext,
  sessionID: string,
  prompt: string,
): Promise<string[]> {
  const hook = createIdleTriageHook(ctx);
  // The SDK types the chat.message output parts as a strict `Part` union and
  // the system.transform input with a required `model: Model`. Both handlers
  // only read `output.parts[].text` / `input.sessionID` / `output.system`, so
  // cast to that minimal shape rather than fabricating SDK-internal fields.
  const chat = hook["chat.message"] as unknown as HookCall<
    { sessionID: string },
    { parts: { type: string; text: string }[] }
  >;
  const system = hook["experimental.chat.system.transform"] as unknown as HookCall<
    { sessionID?: string },
    { system: string[] }
  >;
  if (!chat || !system) throw new Error("idle-triage hook not registered");

  await chat({ sessionID }, { parts: [{ type: "text", text: prompt }] });
  const output = { system: [] as string[] };
  await system({ sessionID }, output);
  return output.system;
}

/** Find and parse a `<goopspec_triage>` block into a field map (null if absent). */
function parseTriageBlock(system: string[]): Record<string, string> | null {
  const block = system.find((s) => s.startsWith("<goopspec_triage>"));
  if (!block) return null;
  const fields: Record<string, string> = {};
  for (const line of block.split("\n")) {
    if (line.startsWith("<") || line.startsWith(">")) continue;
    const idx = line.indexOf(": ");
    if (idx > 0) fields[line.slice(0, idx)] = line.slice(idx + 2);
  }
  return fields;
}

/** Like parseTriageBlock, but throws a clear error if no block was injected. */
function requireTriageBlock(system: string[]): Record<string, string> {
  const parsed = parseTriageBlock(system);
  if (!parsed) throw new Error("expected a <goopspec_triage> block, none was injected");
  return parsed;
}

describe("idle-triage hook reachability", () => {
  let cleanup: () => void;
  let testDir: string;
  let ctx: PluginContext;

  beforeEach(() => {
    const env = setupTestEnvironment("idle-triage-reachability");
    cleanup = env.cleanup;
    testDir = env.testDir;
    // Default mock state has phase "idle" — the positive case.
    ctx = createMockPluginContext({ testDir });
  });

  afterEach(() => cleanup());

  // -------------------------------------------------------------------------
  // Acceptance: substantive idle prompt → fully populated triage block
  // -------------------------------------------------------------------------

  it("injects a <goopspec_triage> block with intent, recommended_effort, confidence, and reasoning all populated", async () => {
    const system = await runTriageFlow(
      ctx,
      "sess-full",
      "implement a new authentication form with validation and error handling",
    );

    const triage = requireTriageBlock(system);
    expect(triage.intent.length).toBeGreaterThan(0);
    expect(triage.recommended_effort.length).toBeGreaterThan(0);
    expect(["low", "medium", "high", "xhigh"]).toContain(triage.recommended_effort);
    const confidence = Number(triage.confidence);
    expect(Number.isFinite(confidence)).toBe(true);
    expect(confidence).toBeGreaterThanOrEqual(0);
    expect(confidence).toBeLessThanOrEqual(1);
    expect(triage.reasoning.length).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // Reachability: detectAutoDelegation — output flows through only if it ran
  // -------------------------------------------------------------------------

  it("reaches detectAutoDelegation: a debug prompt surfaces the auto-delegation intent and reasoning", async () => {
    const system = await runTriageFlow(
      ctx,
      "sess-auto",
      "debug the failing test in the auth module and find the root cause of the crash",
    );
    const triage = requireTriageBlock(system);
    // detectAutoDelegation matched the debug intent — intent + reasoning can
    // only read this way if the function ran and its result was used.
    expect(triage.intent).toBe("debug");
    expect(triage.reasoning).toContain("Auto-delegation detected");
    expect(triage.reasoning).toContain("debugger");
  });

  // -------------------------------------------------------------------------
  // Reachability: routing classifier — output flows through only if it ran
  // -------------------------------------------------------------------------

  it("reaches the routing classifier: a plain test prompt surfaces the routing category and agent", async () => {
    // No debug/research auto-delegation triggers; routing must classify it.
    const system = await runTriageFlow(
      ctx,
      "sess-route",
      "add unit test coverage for the authentication module to improve the test suite",
    );
    const triage = requireTriageBlock(system);
    // intent comes from routing.category (auto.detected was false); the
    // reasoning names the routing agent — only possible if route() ran.
    expect(triage.intent).toBe("test");
    expect(triage.reasoning).toContain("Routing classified as");
    expect(triage.reasoning).toContain("tester");
  });

  // -------------------------------------------------------------------------
  // Reachability: detectTaskMode — recommended effort follows its output
  // -------------------------------------------------------------------------

  it("reaches detectTaskMode: strong milestone signals drive recommended_effort to xhigh", async () => {
    const system = await runTriageFlow(
      ctx,
      "sess-mode",
      "ship the v2.0 release to production and launch the beta milestone for the whole project",
    );
    const triage = requireTriageBlock(system);
    // MODE_TO_EFFORT[milestone] === "xhigh". Only detectTaskMode can produce
    // this label, so its output must have flowed through the hook.
    expect(triage.recommended_effort).toBe("xhigh");
    expect(triage.reasoning).toContain("Mode detection");
  });

  // -------------------------------------------------------------------------
  // Acceptance: trivial / empty / slash-command prompts do not trigger triage
  // -------------------------------------------------------------------------

  it("does not trigger triage for trivial, empty, or slash-command prompts", async () => {
    const cases: Array<[string, string]> = [
      ["sess-empty", ""],
      ["sess-short", "ok thanks"],
      ["sess-slash", "/goop-status"],
    ];
    for (const [sid, prompt] of cases) {
      const system = await runTriageFlow(ctx, sid, prompt);
      expect(
        system.find((s) => s.startsWith("<goopspec_triage>")),
        `prompt=${JSON.stringify(prompt)}`,
      ).toBeUndefined();
      // And nothing was stashed for a later turn.
      expect(ctx.pendingIdleTriages.get(sid)).toBeUndefined();
    }
  });

  // -------------------------------------------------------------------------
  // Acceptance: triage does not fire when the workflow is not idle
  // -------------------------------------------------------------------------

  it("does not trigger triage when the workflow is not idle", async () => {
    const executeCtx = createMockPluginContext({
      testDir,
      state: { workflows: { default: createDefaultWorkflowState({ phase: "execute" }) } },
    });
    const system = await runTriageFlow(
      executeCtx,
      "sess-exec",
      "debug the failing test in the auth module and find the root cause of the crash",
    );
    expect(system.find((s) => s.startsWith("<goopspec_triage>"))).toBeUndefined();
    expect(executeCtx.pendingIdleTriages.get("sess-exec")).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // Graceful degradation: read-then-delete; never blocks a turn
  // -------------------------------------------------------------------------

  it("consumes a pending triage exactly once (read-then-delete) and never blocks the turn", async () => {
    const hook = createIdleTriageHook(ctx);
    const chat = hook["chat.message"] as unknown as HookCall<
      { sessionID: string },
      { parts: { type: string; text: string }[] }
    >;
    const system = hook["experimental.chat.system.transform"] as unknown as HookCall<
      { sessionID?: string },
      { system: string[] }
    >;

    // Capture a substantive prompt.
    await chat(
      { sessionID: "sess-once" },
      {
        parts: [
          {
            type: "text",
            text: "implement a new authentication form with validation and error handling",
          },
        ],
      },
    );
    expect(ctx.pendingIdleTriages.get("sess-once")).toBeDefined();

    // First system.transform consumes it.
    const out1 = { system: [] as string[] };
    await system({ sessionID: "sess-once" }, out1);
    expect(out1.system.some((s) => s.startsWith("<goopspec_triage>"))).toBe(true);
    expect(ctx.pendingIdleTriages.get("sess-once")).toBeUndefined();

    // A second transform on the same session without a new chat.message does
    // NOT replay stale triage.
    const out2 = { system: [] as string[] };
    await system({ sessionID: "sess-once" }, out2);
    expect(out2.system.some((s) => s.startsWith("<goopspec_triage>"))).toBe(false);
  });
});
