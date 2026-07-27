import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import { createMockPluginContext, setupTestEnvironment } from "../../test-utils.js";
import {
  LAZY_AUTOPILOT_NUDGE_TEXT,
  dispatchLazyAutopilotNudge,
  lazyAutopilotNudgeHookFactory,
} from "./index.js";

describe("lazy autopilot nudge", () => {
  let cleanup: () => void;
  let testDir: string;

  beforeEach(() => {
    const env = setupTestEnvironment("lazy-autopilot-nudge");
    cleanup = env.cleanup;
    testDir = env.testDir;
  });

  afterEach(() => cleanup());

  it("dispatches exactly one method-bound promptAsync with the canonical text", async () => {
    const ctx = createMockPluginContext({ testDir });
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
    const ctx = createMockPluginContext({ testDir });
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

  it("does not throw without promptAsync and queues the system-transform fallback", async () => {
    const ctx = createMockPluginContext({ testDir });
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
    const ctx = createMockPluginContext({ testDir });
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
});
