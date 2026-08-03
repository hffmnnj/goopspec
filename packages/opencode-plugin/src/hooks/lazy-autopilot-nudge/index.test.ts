import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import { createMockPluginContext, setupTestEnvironment } from "../../test-utils.js";
import {
  LAZY_AUTOPILOT_NUDGE_TEXT,
  dispatchLazyAutopilotNudge,
  lazyAutopilotNudgeHookFactory,
} from "./index.js";
import { __clearNudgeRateLimitState } from "./rate-limit.js";

import type { GoopState, WorkflowState } from "../../test-utils.js";

const EXECUTE_CTX_OVERRIDES: Partial<GoopState> = {
  workflows: {
    default: {
      phase: "execute",
      mode: "standard",
      depth: "standard",
      interviewComplete: false,
      specLocked: false,
      acceptanceConfirmed: false,
      currentWave: 1,
      totalWaves: 3,
      autopilot: false,
      lazyAutopilot: true,
    },
  },
};

function makeExecuteContext(testDir: string) {
  return createMockPluginContext({ testDir, state: EXECUTE_CTX_OVERRIDES });
}

function makeNudgeWorkflowState(overrides: Partial<WorkflowState>): WorkflowState {
  return {
    phase: "execute",
    mode: "standard",
    depth: "standard",
    interviewComplete: false,
    specLocked: false,
    acceptanceConfirmed: false,
    currentWave: 1,
    totalWaves: 3,
    autopilot: false,
    lazyAutopilot: true,
    ...overrides,
  };
}

describe("lazy autopilot nudge", () => {
  let cleanup: () => void;
  let testDir: string;

  beforeEach(() => {
    const env = setupTestEnvironment("lazy-autopilot-nudge");
    cleanup = env.cleanup;
    testDir = env.testDir;
    __clearNudgeRateLimitState();
  });

  afterEach(() => cleanup());

  it("targets the orchestrator with the live configured model instead of inheriting gpt-5.3-codex", async () => {
    const ctx = makeExecuteContext(testDir);
    await Bun.write(
      `${testDir}/goopspec.json`,
      JSON.stringify({ agentModels: { orchestrator: "anthropic/claude-user-override" } }),
    );
    const calls: unknown[] = [];
    const session = {
      _client: {},
      model: { providerID: "openai", modelID: "gpt-5.3-codex" },
      messages: mock(async () => [{ info: { role: "assistant", mode: "goop-orchestrator" } }]),
      get: mock(async () => ({ directory: testDir })),
      promptAsync(input: unknown): Promise<void> {
        if (this._client === undefined) throw new TypeError("detached this");
        calls.push(input);
        return Promise.resolve();
      },
    };
    Object.assign(ctx.sdk.client, { session });

    await dispatchLazyAutopilotNudge(ctx, "sess-happy");
    await Promise.resolve();

    expect(calls).toEqual([
      {
        path: { id: "sess-happy" },
        body: {
          agent: "goop-orchestrator",
          model: { providerID: "anthropic", modelID: "claude-user-override" },
          parts: [{ type: "text", text: LAZY_AUTOPILOT_NUDGE_TEXT }],
        },
      },
    ]);
  });

  it("fetches session metadata concurrently and preserves it for guard evaluation", async () => {
    const ctx = makeExecuteContext(testDir);
    let releaseMessages: ((value: { data: Array<{ info: { role: string } }> }) => void) | undefined;
    const messages = mock(
      () =>
        new Promise<{ data: Array<{ info: { role: string } }> }>((resolve) => {
          releaseMessages = resolve;
        }),
    );
    const get = mock(async () => ({
      id: "sess-session-metadata",
      directory: testDir,
      parentID: "parent-session",
    }));
    const promptAsync = mock(async () => undefined);
    Object.assign(ctx.sdk.client, { session: { messages, get, promptAsync } });

    const dispatch = dispatchLazyAutopilotNudge(ctx, "sess-session-metadata");
    await Promise.resolve();

    expect(messages).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledTimes(1);
    releaseMessages?.({ data: [{ info: { role: "assistant" } }] });
    await dispatch;
    await Promise.resolve();

    expect(promptAsync).not.toHaveBeenCalled();
  });

  it("does not nudge when session metadata lookup fails", async () => {
    const ctx = makeExecuteContext(testDir);
    const promptAsync = mock(async () => undefined);
    Object.assign(ctx.sdk.client, {
      session: {
        messages: mock(async () => [{ info: { role: "assistant" } }]),
        get: mock(() => Promise.reject(new Error("session lookup failed"))),
        promptAsync,
      },
    });

    await dispatchLazyAutopilotNudge(ctx, "sess-get-failed");
    await Promise.resolve();

    expect(promptAsync).not.toHaveBeenCalled();
  });

  it("does not nudge when the last message is from the user", async () => {
    const ctx = makeExecuteContext(testDir);
    const promptAsync = mock(async () => undefined);
    Object.assign(ctx.sdk.client, {
      session: {
        messages: mock(async () => [{ info: { role: "user" } }]),
        promptAsync,
      },
    });

    await dispatchLazyAutopilotNudge(ctx, "sess-user-turn");

    expect(promptAsync).not.toHaveBeenCalled();
    expect(ctx.pendingLazyAutopilotNudges.has("sess-user-turn")).toBe(false);
  });

  it.each([
    ["credentials", "Please provide the production API key before I continue."],
    ["destructive operation", "Should I delete the production database? This is irreversible."],
  ])(
    "suppresses a %s hard-stop extracted from the final assistant text part",
    async (_kind, text) => {
      const ctx = makeExecuteContext(testDir);
      const promptAsync = mock(async () => undefined);
      Object.assign(ctx.sdk.client, {
        session: {
          messages: mock(async () => ({
            data: [
              {
                info: { role: "assistant", mode: "goop-orchestrator" },
                parts: [{ type: "text", text }],
              },
            ],
          })),
          get: mock(async () => ({ directory: testDir })),
          promptAsync,
        },
      });

      await dispatchLazyAutopilotNudge(ctx, "sess-hard-stop");

      expect(promptAsync).not.toHaveBeenCalled();
      expect(ctx.pendingLazyAutopilotNudges.has("sess-hard-stop")).toBe(false);
    },
  );

  it("does not throw without promptAsync and queues the system-transform fallback", async () => {
    const ctx = makeExecuteContext(testDir);
    const errorSpy = spyOn(console, "error").mockImplementation(() => {});
    Object.assign(ctx.sdk.client, { session: { messages: mock(async () => []) } });

    await expect(dispatchLazyAutopilotNudge(ctx, "sess-fallback")).resolves.toBeUndefined();
    expect(ctx.pendingLazyAutopilotNudges.get("sess-fallback")).toEqual({
      status: "queued",
      source: "system-transform",
    });

    const output = { system: [] as string[] };
    const hook = lazyAutopilotNudgeHookFactory(ctx)["experimental.chat.system.transform"];
    await hook?.({ sessionID: "sess-fallback", model: {} as never }, output);
    expect(output.system).toEqual([LAZY_AUTOPILOT_NUDGE_TEXT]);
    errorSpy.mockRestore();
  });

  it("deduplicates simultaneous idle dispatches before promptAsync", async () => {
    const ctx = makeExecuteContext(testDir);
    const promptAsync = mock(async () => undefined);
    Object.assign(ctx.sdk.client, {
      session: {
        messages: mock(async () => [{ info: { role: "assistant", mode: "goop-orchestrator" } }]),
        get: mock(async () => ({ directory: testDir })),
        promptAsync,
      },
    });

    await Promise.all([
      dispatchLazyAutopilotNudge(ctx, "sess-dedupe"),
      dispatchLazyAutopilotNudge(ctx, "sess-dedupe"),
    ]);
    await Promise.resolve();

    expect(promptAsync).toHaveBeenCalledTimes(1);
  });

  it("uses the cooldown to reject a duplicate idle but permits a later idle", async () => {
    const now = spyOn(Date, "now");
    let currentTime = 1_000_000;
    now.mockImplementation(() => currentTime);
    try {
      const ctx = makeExecuteContext(testDir);
      await Bun.write(
        `${testDir}/goopspec.json`,
        JSON.stringify({ lazyAutopilotNudge: { cooldownMs: 30_000 } }),
      );
      const promptAsync = mock(async () => undefined);
      Object.assign(ctx.sdk.client, {
        session: {
          messages: mock(async () => ({
            data: [
              {
                info: { role: "assistant", mode: "goop-orchestrator" },
                parts: [{ type: "text", text: "ready" }],
              },
            ],
          })),
          get: mock(async () => ({ directory: testDir })),
          promptAsync,
        },
      });

      await dispatchLazyAutopilotNudge(ctx, "sess-repeat");
      await Promise.resolve();
      await dispatchLazyAutopilotNudge(ctx, "sess-repeat");
      await Promise.resolve();
      expect(promptAsync).toHaveBeenCalledTimes(1);

      currentTime += 30_000;
      await dispatchLazyAutopilotNudge(ctx, "sess-repeat");
      await Promise.resolve();
      expect(promptAsync).toHaveBeenCalledTimes(2);
    } finally {
      now.mockRestore();
    }
  });

  it("abandons a session after the configured nudge cap", async () => {
    const now = spyOn(Date, "now");
    let currentTime = 1_000_000;
    now.mockImplementation(() => currentTime);
    const errorSpy = spyOn(console, "error").mockImplementation(() => {});
    try {
      const ctx = makeExecuteContext(testDir);
      await Bun.write(
        `${testDir}/goopspec.json`,
        JSON.stringify({ lazyAutopilotNudge: { cap: 2, cooldownMs: 1 } }),
      );
      const promptAsync = mock(async () => undefined);
      Object.assign(ctx.sdk.client, {
        session: {
          messages: mock(async () => ({
            data: [
              {
                info: { role: "assistant", mode: "goop-orchestrator" },
                parts: [{ type: "text", text: "ready" }],
              },
            ],
          })),
          get: mock(async () => ({ directory: testDir })),
          promptAsync,
        },
      });

      for (let attempt = 0; attempt < 3; attempt += 1) {
        await dispatchLazyAutopilotNudge(ctx, "sess-cap");
        await Promise.resolve();
        currentTime += 1;
      }

      expect(promptAsync).toHaveBeenCalledTimes(2);
    } finally {
      errorSpy.mockRestore();
      now.mockRestore();
    }
  });

  it("contains consecutive promptAsync failures after three attempts", async () => {
    const errorSpy = spyOn(console, "error").mockImplementation(() => {});
    try {
      const ctx = makeExecuteContext(testDir);
      await Bun.write(
        `${testDir}/goopspec.json`,
        JSON.stringify({ lazyAutopilotNudge: { cap: 10, cooldownMs: 0 } }),
      );
      const promptAsync = mock(() => Promise.reject(new Error("host unavailable")));
      Object.assign(ctx.sdk.client, {
        session: {
          messages: mock(async () => [{ info: { role: "assistant", mode: "goop-orchestrator" } }]),
          get: mock(async () => ({ directory: testDir })),
          promptAsync,
        },
      });

      for (let attempt = 0; attempt < 4; attempt += 1) {
        await expect(dispatchLazyAutopilotNudge(ctx, "sess-reject")).resolves.toBeUndefined();
        await Promise.resolve();
      }

      expect(promptAsync).toHaveBeenCalledTimes(3);
      expect(ctx.pendingLazyAutopilotNudges.has("sess-reject")).toBe(false);
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("applies the cooldown before retrying a rejected promptAsync request", async () => {
    const ctx = makeExecuteContext(testDir);
    const errorSpy = spyOn(console, "error").mockImplementation(() => {});
    try {
      const promptAsync = mock(() => Promise.reject(new Error("temporary host failure")));
      Object.assign(ctx.sdk.client, {
        session: {
          messages: mock(async () => [{ info: { role: "assistant", mode: "goop-orchestrator" } }]),
          get: mock(async () => ({ directory: testDir })),
          promptAsync,
        },
      });

      await dispatchLazyAutopilotNudge(ctx, "sess-retry-cooldown");
      await Promise.resolve();
      await dispatchLazyAutopilotNudge(ctx, "sess-retry-cooldown");

      expect(promptAsync).toHaveBeenCalledTimes(1);
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("is fully inert when the kill switch is off and makes zero SDK calls", async () => {
    const ctx = makeExecuteContext(testDir);
    // Write a project-root config that disables the nudge.
    const projectConfig = {
      lazyAutopilotNudge: { enabled: false },
    };
    await Bun.write(`${testDir}/goopspec.json`, JSON.stringify(projectConfig));

    const messages = mock(async () => [{ info: { role: "assistant" } }]);
    const promptAsync = mock(async () => undefined);
    Object.assign(ctx.sdk.client, { session: { messages, promptAsync } });

    await dispatchLazyAutopilotNudge(ctx, "sess-off");
    await Promise.resolve();

    expect(messages).not.toHaveBeenCalled();
    expect(promptAsync).not.toHaveBeenCalled();
    expect(ctx.pendingLazyAutopilotNudges.has("sess-off")).toBe(false);
  });

  it("does not throw when both promptAsync and messages are absent", async () => {
    const ctx = makeExecuteContext(testDir);
    const errorSpy = spyOn(console, "error").mockImplementation(() => {});
    Object.assign(ctx.sdk.client, { session: {} });

    await expect(dispatchLazyAutopilotNudge(ctx, "sess-no-sdk")).resolves.toBeUndefined();
    expect(ctx.pendingLazyAutopilotNudges.get("sess-no-sdk")?.source).toBe("system-transform");
    errorSpy.mockRestore();
  });

  // -------------------------------------------------------------------------
  // T3: dispatch-path regression for guards G1/G2 and a positive canary.
  // guards.test.ts covers G1/G2 directly on evaluateNudgeGuards; these tests
  // prove the wiring through dispatchLazyAutopilotNudge so a refactor cannot
  // silently disconnect the guards from the new agent/model dispatch body.
  // -------------------------------------------------------------------------

  it("suppresses via guard G1 when lazyAutopilot is false in workflow state", async () => {
    const ctx = createMockPluginContext({
      testDir,
      state: {
        workflows: { default: makeNudgeWorkflowState({ lazyAutopilot: false }) },
      },
    });
    const messages = mock(async () => [{ info: { role: "assistant" } }]);
    const promptAsync = mock(async () => undefined);
    Object.assign(ctx.sdk.client, { session: { messages, promptAsync } });

    await dispatchLazyAutopilotNudge(ctx, "sess-g1");

    expect(messages).toHaveBeenCalledTimes(1);
    expect(promptAsync).not.toHaveBeenCalled();
    expect(ctx.pendingLazyAutopilotNudges.has("sess-g1")).toBe(false);
  });

  it("suppresses via guard G2 when phase is not execute", async () => {
    const ctx = createMockPluginContext({
      testDir,
      state: {
        workflows: { default: makeNudgeWorkflowState({ phase: "plan" }) },
      },
    });
    const messages = mock(async () => [{ info: { role: "assistant" } }]);
    const promptAsync = mock(async () => undefined);
    Object.assign(ctx.sdk.client, { session: { messages, promptAsync } });

    await dispatchLazyAutopilotNudge(ctx, "sess-g2");

    expect(messages).toHaveBeenCalledTimes(1);
    expect(promptAsync).not.toHaveBeenCalled();
    expect(ctx.pendingLazyAutopilotNudges.has("sess-g2")).toBe(false);
  });

  it("fires in the correct case: execute phase, lazy autopilot on, orchestrator agent with resolved model", async () => {
    const ctx = makeExecuteContext(testDir);
    const calls: unknown[] = [];
    Object.assign(ctx.sdk.client, {
      session: {
        messages: mock(async () => [{ info: { role: "assistant", mode: "goop-orchestrator" } }]),
        get: mock(async () => ({ directory: testDir })),
        promptAsync(input: unknown): Promise<void> {
          calls.push(input);
          return Promise.resolve();
        },
      },
    });

    await dispatchLazyAutopilotNudge(ctx, "sess-positive");
    await Promise.resolve();

    expect(calls).toHaveLength(1);
    const dispatched = calls[0] as {
      body: {
        agent: string;
        model?: { providerID: string; modelID: string };
        parts: { type: string; text: string }[];
      };
    };
    expect(dispatched.body.agent).toBe("goop-orchestrator");
    expect(dispatched.body.model).toBeDefined();
    expect(dispatched.body.model?.providerID).toBeTruthy();
    expect(dispatched.body.model?.modelID).toBeTruthy();
    expect(dispatched.body.parts).toEqual([{ type: "text", text: LAZY_AUTOPILOT_NUDGE_TEXT }]);
  });

  // -------------------------------------------------------------------------
  // T3: Regression tests for firsthand-observed nudge misfires and fail-closed
  // paths through the dispatch path (index.ts), complementing the guard unit
  // tests in guards.test.ts.
  //
  // Deliverable coverage map:
  //   D1 subagent misfire — guard unit covered by T2; dispatch path below.
  //   D2 cross-project misfire — guard unit covered by T2; dispatch path below.
  //   D3 fail-closed (get-failed) — dispatch path covered by T1 test above.
  //   D3 fail-closed (get-unavailable, invalid-response) — dispatch path below.
  //   D4 positive canary — already covered by "fires in the correct case" above.
  // -------------------------------------------------------------------------

  it.each([
    ["sess-liquid-glass", "sess-lg-parent"],
    ["sess-shell", "sess-shell-parent"],
  ])(
    "regression: suppresses subagent session %s that wrongly received an orchestrator nudge",
    async (sessionID, parentID) => {
      const ctx = makeExecuteContext(testDir);
      const promptAsync = mock(async () => undefined);
      Object.assign(ctx.sdk.client, {
        session: {
          messages: mock(async () => [{ info: { role: "assistant" } }]),
          get: mock(async () => ({
            directory: testDir,
            parentID,
          })),
          promptAsync,
        },
      });

      await dispatchLazyAutopilotNudge(ctx, sessionID);
      await Promise.resolve();

      expect(promptAsync).not.toHaveBeenCalled();
      expect(ctx.pendingLazyAutopilotNudges.has(sessionID)).toBe(false);
    },
  );

  it("regression: suppresses a cross-project session (pulsyn-app-2.0 while GoopSpec state lives elsewhere)", async () => {
    const ctx = makeExecuteContext(testDir);
    const otherProject = join(testDir, "pulsyn-app-2.0");
    mkdirSync(otherProject, { recursive: true });
    const promptAsync = mock(async () => undefined);
    Object.assign(ctx.sdk.client, {
      session: {
        messages: mock(async () => [{ info: { role: "assistant", mode: "goop-orchestrator" } }]),
        get: mock(async () => ({ directory: otherProject })),
        promptAsync,
      },
    });

    await dispatchLazyAutopilotNudge(ctx, "sess-pulsyn");
    await Promise.resolve();

    expect(promptAsync).not.toHaveBeenCalled();
    expect(ctx.pendingLazyAutopilotNudges.has("sess-pulsyn")).toBe(false);
  });

  it("fail-closed: suppresses when session.get is unavailable on the host", async () => {
    const ctx = makeExecuteContext(testDir);
    const promptAsync = mock(async () => undefined);
    Object.assign(ctx.sdk.client, {
      session: {
        messages: mock(async () => [{ info: { role: "assistant" } }]),
        // session.get is absent — host does not expose it
        promptAsync,
      },
    });

    await dispatchLazyAutopilotNudge(ctx, "sess-no-get");
    await Promise.resolve();

    expect(promptAsync).not.toHaveBeenCalled();
    expect(ctx.pendingLazyAutopilotNudges.has("sess-no-get")).toBe(false);
  });

  it.each([
    ["null", null],
    ["object without directory", {}],
    ["non-string directory", { directory: 12345 }],
    ["non-string parentID", { directory: "/any-project", parentID: 999 }],
  ] as Array<[string, unknown]>)(
    "fail-closed: suppresses when session.get returns indeterminate data (%s)",
    async (_label, getSessionValue: unknown) => {
      const ctx = makeExecuteContext(testDir);
      const promptAsync = mock(async () => undefined);
      Object.assign(ctx.sdk.client, {
        session: {
          messages: mock(async () => [{ info: { role: "assistant" } }]),
          get: mock(async () => getSessionValue),
          promptAsync,
        },
      });

      await dispatchLazyAutopilotNudge(ctx, "sess-invalid-response");
      await Promise.resolve();

      expect(promptAsync).not.toHaveBeenCalled();
      expect(ctx.pendingLazyAutopilotNudges.has("sess-invalid-response")).toBe(false);
    },
  );

  // -------------------------------------------------------------------------
  // Wave 1 Task 1 found D1 (agent-identity gap) and D3 (fallback latch) via
  // characterisation. Inspection findings: SessionInfo.agent (types.ts:373)
  // is declared but never assigned by production code; NudgeGuardInput
  // (guards.ts:103-115) had no identity field; orchestrator-enforcement.ts's
  // claim that session.agent "is set during plugin initialisation" was
  // FALSIFIED. Wave 2 (Tasks 2.1/2.2) fixed D1 by adding the fail-closed
  // agent-identity guard and wiring `lastAssistantAgent()`'s reading of
  // `AssistantMessage.mode` into dispatch — the permissive test below is
  // updated accordingly. D3 remains an open characterisation for Wave 3.
  // -------------------------------------------------------------------------

  it("D1 signal (LOAD-BEARING FOR WAVE 2): session.messages() final assistant message carries AssistantMessage.mode as the agent-identity signal (SDK 1.18.3)", () => {
    // Shape verified against @opencode-ai/sdk/dist/gen/types.gen.d.ts:98-110:
    // `mode: string` is REQUIRED on AssistantMessage and already present on
    // the exact `{ data: [{ info, parts }] }` envelope this hook reads.
    const realisticMessagesResponse = {
      data: [
        {
          info: {
            id: "msg_1",
            sessionID: "sess-d1-signal",
            role: "assistant" as const,
            time: { created: Date.now() },
            parentID: "",
            modelID: "claude-sonnet-5",
            providerID: "anthropic",
            mode: "goop-orchestrator",
            path: { cwd: testDir, root: testDir },
            cost: 0,
            tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
          },
          parts: [{ type: "text", text: "done" }],
        },
      ],
    };

    const lastEntry = realisticMessagesResponse.data.at(-1);
    expect(lastEntry?.info.role).toBe("assistant");
    // WAVE 2 MUST READ THIS FIELD: `info.mode` carries the agent identity
    // ("goop-orchestrator") for the final turn. Neither SessionInfo.agent nor
    // NudgeGuardInput carries this today -- `mode` is the viable signal.
    expect(lastEntry?.info.mode).toBe("goop-orchestrator");

    // Fallback considered and rejected as unnecessary: chat-message.ts:19's
    // ChatMessageInput.agent is likewise never persisted anywhere today (the
    // handler receives it as `_input`, intentionally unused) -- but since
    // `mode` is present and required on the response dispatch already reads,
    // no fallback wiring through chat.message is needed for Wave 2.
  });

  it("D1 fix (Wave 2 Task 2.2): a non-orchestrator session (mode: build) no longer reaches dispatch", async () => {
    const ctx = makeExecuteContext(testDir);
    const calls: unknown[] = [];
    Object.assign(ctx.sdk.client, {
      session: {
        // Final assistant message belongs to a "build" mode turn, not
        // goop-orchestrator. `lastAssistantAgent()` reads `info.mode` and the
        // agent-identity guard now suppresses this before promptAsync.
        messages: mock(async () => [{ info: { role: "assistant", mode: "build" } }]),
        get: mock(async () => ({ directory: testDir })),
        promptAsync(input: unknown): Promise<void> {
          calls.push(input);
          return Promise.resolve();
        },
      },
    });

    await dispatchLazyAutopilotNudge(ctx, "sess-non-orchestrator");
    await Promise.resolve();

    // D1 FIXED: dispatch is suppressed and does not inject an orchestrator
    // nudge into a session whose last turn ran under mode="build".
    expect(calls).toHaveLength(0);
    expect(ctx.pendingLazyAutopilotNudges.has("sess-non-orchestrator")).toBe(false);
  });

  it("D3 characterisation (KNOWN DEFECT, inverted by Wave 3 Task 3.1): a second dispatch is blocked by the pending system-transform latch while it remains unconsumed", async () => {
    const ctx = makeExecuteContext(testDir);
    const errorSpy = spyOn(console, "error").mockImplementation(() => {});
    try {
      // Track SDK access itself (not just session.messages, which is never
      // called on this branch -- promptAsync is checked BEFORE messages at
      // index.ts:103-104) to prove no further host interaction happens.
      let sessionAccessCount = 0;
      const session = { messages: mock(async () => []) };
      Object.defineProperty(ctx.sdk.client, "session", {
        configurable: true,
        get() {
          sessionAccessCount += 1;
          return session;
        },
      });

      await dispatchLazyAutopilotNudge(ctx, "sess-latch");
      expect(ctx.pendingLazyAutopilotNudges.get("sess-latch")).toEqual({
        status: "queued",
        source: "system-transform",
      });
      expect(sessionAccessCount).toBe(1);

      // A second idle dispatch for the SAME session, with the fallback still
      // un-consumed (no experimental.chat.system.transform call has fired).
      await dispatchLazyAutopilotNudge(ctx, "sess-latch");

      // KNOWN DEFECT (D3): the early return at index.ts:93 sees the still-
      // pending map entry and blocks the second dispatch before it ever
      // touches ctx.sdk.client.session again -- zero further SDK calls. A
      // genuinely later idle event on this session is starved until some
      // system-transform call happens to consume the latch, which may never
      // occur. Wave 3 Task 3.1 inverts this.
      expect(sessionAccessCount).toBe(1);
      expect(ctx.pendingLazyAutopilotNudges.get("sess-latch")).toEqual({
        status: "queued",
        source: "system-transform",
      });
    } finally {
      errorSpy.mockRestore();
    }
  });
});
