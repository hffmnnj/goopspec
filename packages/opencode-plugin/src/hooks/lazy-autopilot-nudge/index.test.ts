import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import { createMockPluginContext, setupTestEnvironment } from "../../test-utils.js";
import {
  LAZY_AUTOPILOT_NUDGE_TEXT,
  dispatchLazyAutopilotNudge,
  lazyAutopilotNudgeHookFactory,
} from "./index.js";
import { __clearNudgeRateLimitState } from "./rate-limit.js";

import type { GoopState } from "../../test-utils.js";

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

  it("dispatches exactly one method-bound promptAsync with the canonical text", async () => {
    const ctx = makeExecuteContext(testDir);
    const calls: unknown[] = [];
    const session = {
      _client: {},
      messages: mock(async () => [{ info: { role: "assistant" } }]),
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
        body: { parts: [{ type: "text", text: LAZY_AUTOPILOT_NUDGE_TEXT }] },
      },
    ]);
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
  ])("suppresses a %s hard-stop extracted from the final assistant text part", async (_kind, text) => {
    const ctx = makeExecuteContext(testDir);
    const promptAsync = mock(async () => undefined);
    Object.assign(ctx.sdk.client, {
      session: {
        messages: mock(async () => ({
          data: [{ info: { role: "assistant" }, parts: [{ type: "text", text }] }],
        })),
        promptAsync,
      },
    });

    await dispatchLazyAutopilotNudge(ctx, "sess-hard-stop");

    expect(promptAsync).not.toHaveBeenCalled();
    expect(ctx.pendingLazyAutopilotNudges.has("sess-hard-stop")).toBe(false);
  });

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
        messages: mock(async () => [{ info: { role: "assistant" } }]),
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
            data: [{ info: { role: "assistant" }, parts: [{ type: "text", text: "ready" }] }],
          })),
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
            data: [{ info: { role: "assistant" }, parts: [{ type: "text", text: "ready" }] }],
          })),
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
});
