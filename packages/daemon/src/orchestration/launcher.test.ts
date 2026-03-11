import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";
import { CliLauncher } from "./cli-launcher.js";
import { createLauncher } from "./launcher-factory.js";
import { SdkLauncher } from "./sdk-launcher.js";

describe("workflow launcher factory", () => {
  afterEach(() => {
    mock.restore();
  });

  it("returns CliLauncher when SDK launcher is unavailable", async () => {
    spyOn(SdkLauncher.prototype, "isAvailable").mockResolvedValue(false);

    const launcher = await createLauncher();

    expect(launcher).toBeInstanceOf(CliLauncher);
    expect(launcher.name).toBe("cli");
  });

  it("returns SdkLauncher when SDK launcher is available", async () => {
    spyOn(SdkLauncher.prototype, "isAvailable").mockResolvedValue(true);

    const launcher = await createLauncher();

    expect(launcher).toBeInstanceOf(SdkLauncher);
    expect(launcher.name).toBe("sdk");
  });
});

describe("cli launcher", () => {
  afterEach(() => {
    mock.restore();
  });

  it("returns false when opencode CLI is unavailable", async () => {
    spyOn(Bun, "spawnSync").mockReturnValue({ exitCode: 1 } as never);
    const launcher = new CliLauncher();

    await expect(launcher.isAvailable()).resolves.toBe(false);
  });

  it("returns started LaunchResult shape on successful launch", async () => {
    spyOn(Bun, "spawn").mockReturnValue({ pid: 4321 } as never);
    const launcher = new CliLauncher();

    const result = await launcher.launch({
      projectPath: "/tmp/project",
      workflowId: "default",
      prompt: "run the workflow",
      model: "openai/gpt-5.3-codex",
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: "started",
        pid: 4321,
      }),
    );
    expect(typeof result.sessionId).toBe("string");
    expect(result.sessionId.length).toBeGreaterThan(0);
  });

  it("returns failed result with error when launch throws", async () => {
    spyOn(Bun, "spawn").mockImplementation(() => {
      throw new Error("opencode spawn failed");
    });

    const launcher = new CliLauncher();
    const result = await launcher.launch({ projectPath: "/tmp/project" });

    expect(result.status).toBe("failed");
    expect(result.error).toContain("opencode spawn failed");
  });
});

describe("sdk launcher", () => {
  afterEach(() => {
    mock.restore();
  });

  it("returns started with session id when SDK createSession succeeds", async () => {
    mock.module("@opencode-ai/sdk", () => ({
      createSession: async () => ({ id: "sdk-session-1" }),
    }));

    const launcher = new SdkLauncher();
    const result = await launcher.launch({ projectPath: "/tmp/project" });

    expect(result).toEqual({
      sessionId: "sdk-session-1",
      status: "started",
    });
  });

  it("returns failed result with error when SDK launch fails", async () => {
    mock.module("@opencode-ai/sdk", () => ({
      createSession: async () => {
        throw new Error("sdk failed to create session");
      },
    }));

    const launcher = new SdkLauncher();
    const result = await launcher.launch({ projectPath: "/tmp/project" });

    expect(result.status).toBe("failed");
    expect(result.error).toContain("sdk failed to create session");
  });
});
