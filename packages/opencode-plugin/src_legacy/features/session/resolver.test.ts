import { afterEach, beforeAll, beforeEach, describe, expect, it, mock } from "bun:test";

import { createMockPluginContext, setupTestEnvironment, type PluginContext } from "../../test-utils.js";
import { createSession } from "./manager.js";

const CANCELLED = Symbol("cancelled");

const selectMock = mock(async () => "");
const isCancelMock = mock((value: unknown) => value === CANCELLED);

mock.module("@clack/prompts", () => ({
  select: selectMock,
  isCancel: isCancelMock,
}));

let resolveSession: (
  ctx: PluginContext,
  options?: { silent?: boolean },
) => Promise<string | undefined>;

describe("resolveSession", () => {
  let testDir: string;
  let cleanup: () => void;
  let originalSessionEnv: string | undefined;

  beforeAll(async () => {
    ({ resolveSession } = await import("./resolver.js"));
  });

  beforeEach(() => {
    const env = setupTestEnvironment("session-resolver");
    testDir = env.testDir;
    cleanup = env.cleanup;

    originalSessionEnv = process.env.GOOPSPEC_SESSION;
    delete process.env.GOOPSPEC_SESSION;

    selectMock.mockReset();
    isCancelMock.mockReset();

    selectMock.mockResolvedValue("");
    isCancelMock.mockImplementation((value: unknown) => value === CANCELLED);
  });

  afterEach(() => {
    if (originalSessionEnv === undefined) {
      delete process.env.GOOPSPEC_SESSION;
    } else {
      process.env.GOOPSPEC_SESSION = originalSessionEnv;
    }
    cleanup();
  });

  it("returns in-memory binding first", async () => {
    createSession(testDir, "feature-alpha");
    process.env.GOOPSPEC_SESSION = "feature-alpha";

    const ctx = createMockPluginContext({ testDir });
    ctx.sessionId = "in-memory-session";

    const resolved = await resolveSession(ctx);

    expect(resolved).toBe("in-memory-session");
    expect(selectMock).not.toHaveBeenCalled();
  });

  it("uses GOOPSPEC_SESSION when in-memory binding is absent", async () => {
    process.env.GOOPSPEC_SESSION = "feature-env";
    const ctx = createMockPluginContext({ testDir });

    const resolved = await resolveSession(ctx);

    expect(resolved).toBe("feature-env");
    expect(selectMock).not.toHaveBeenCalled();
  });

  it("skips invalid GOOPSPEC_SESSION and falls through", async () => {
    createSession(testDir, "feature-only");
    process.env.GOOPSPEC_SESSION = "BAD_ID";

    const ctx = createMockPluginContext({ testDir });
    const resolved = await resolveSession(ctx);

    expect(resolved).toBe("feature-only");
    expect(selectMock).not.toHaveBeenCalled();
  });

  it("prompts user when multiple sessions exist", async () => {
    createSession(testDir, "feature-a");
    createSession(testDir, "feature-b");
    selectMock.mockResolvedValue("feature-b");

    const ctx = createMockPluginContext({ testDir });
    const resolved = await resolveSession(ctx);

    expect(resolved).toBe("feature-b");
    expect(selectMock).toHaveBeenCalledTimes(1);
  });

  it("returns undefined for multiple sessions in silent mode", async () => {
    createSession(testDir, "feature-a");
    createSession(testDir, "feature-b");

    const ctx = createMockPluginContext({ testDir });
    const resolved = await resolveSession(ctx, { silent: true });

    expect(resolved).toBeUndefined();
    expect(selectMock).not.toHaveBeenCalled();
  });

  it("auto-selects the sole session", async () => {
    createSession(testDir, "feature-single");

    const ctx = createMockPluginContext({ testDir });
    const resolved = await resolveSession(ctx);

    expect(resolved).toBe("feature-single");
    expect(selectMock).not.toHaveBeenCalled();
  });

  it("returns undefined when no sessions exist", async () => {
    const ctx = createMockPluginContext({ testDir });
    const resolved = await resolveSession(ctx);

    expect(resolved).toBeUndefined();
    expect(selectMock).not.toHaveBeenCalled();
  });

  it("returns undefined when user cancels prompt", async () => {
    createSession(testDir, "feature-a");
    createSession(testDir, "feature-b");
    selectMock.mockResolvedValue(CANCELLED);

    const ctx = createMockPluginContext({ testDir });
    const resolved = await resolveSession(ctx);

    expect(resolved).toBeUndefined();
    expect(selectMock).toHaveBeenCalledTimes(1);
    expect(isCancelMock).toHaveBeenCalledWith(CANCELLED);
  });

  it("gracefully handles prompt errors without throwing", async () => {
    createSession(testDir, "feature-a");
    createSession(testDir, "feature-b");
    selectMock.mockRejectedValue(new Error("prompt failed"));

    const ctx = createMockPluginContext({ testDir });
    const resolved = await resolveSession(ctx);

    expect(resolved).toBeUndefined();
  });
});
