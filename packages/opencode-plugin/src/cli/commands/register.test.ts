import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";

import {
  DaemonApiError,
  DaemonUnavailableError,
} from "../../features/daemon/client.js";

// ── Mocks ─────────────────────────────────────────────────────────────────

const mockPost = mock(() => Promise.resolve({
  id: "proj_abc123",
  name: "my-app",
  path: "/home/user/my-app",
  createdAt: "2026-03-11T00:00:00Z",
  updatedAt: "2026-03-11T00:00:00Z",
}));

const mockGetBaseUrl = mock(() => "http://localhost:7331");

mock.module("../../features/daemon/client.js", () => {
  return {
    DaemonUnavailableError,
    DaemonApiError,
    DaemonClient: class MockDaemonClient {
      post = mockPost;
      getBaseUrl = mockGetBaseUrl;
    },
    createDaemonClient: mock(() =>
      Promise.resolve({
        post: mockPost,
        getBaseUrl: mockGetBaseUrl,
      }),
    ),
  };
});

type DetectionResult = {
  name: string;
  source: "package.json" | "Cargo.toml" | "pyproject.toml" | "go.mod" | "directory";
  path: string;
  description?: string;
  version?: string;
};

const mockDetectProjectName = mock((): Promise<DetectionResult> =>
  Promise.resolve({
    name: "my-app",
    source: "package.json",
    path: "/home/user/my-app/package.json",
    description: "My awesome app",
  }),
);

mock.module("../detect-project.js", () => ({
  detectProjectName: mockDetectProjectName,
}));

// ── Helpers ───────────────────────────────────────────────────────────────

function getPostCallBody(): Record<string, unknown> {
  const calls = mockPost.mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  // calls[0] is [path, body]
  const args = calls[0] as unknown as [string, Record<string, unknown>];
  return args[1];
}

function getPostCallPath(): string {
  const calls = mockPost.mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  const args = calls[0] as unknown as [string, Record<string, unknown>];
  return args[0];
}

// Suppress console output during tests
let consoleSpy: ReturnType<typeof spyOn>;

describe("goopspec register command", () => {
  beforeEach(() => {
    mockPost.mockClear();
    mockGetBaseUrl.mockClear();
    mockDetectProjectName.mockClear();

    // Reset default mock implementations
    mockPost.mockImplementation(() =>
      Promise.resolve({
        id: "proj_abc123",
        name: "my-app",
        path: process.cwd(),
        description: "My awesome app",
        createdAt: "2026-03-11T00:00:00Z",
        updatedAt: "2026-03-11T00:00:00Z",
      }),
    );

    mockDetectProjectName.mockImplementation((): Promise<DetectionResult> =>
      Promise.resolve({
        name: "my-app",
        source: "package.json",
        path: "/home/user/my-app/package.json",
        description: "My awesome app",
      }),
    );

    consoleSpy = spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it("successfully registers a project", async () => {
    const { runRegister } = await import("./register.js");

    await runRegister({});

    expect(mockDetectProjectName).toHaveBeenCalledTimes(1);
    expect(mockPost).toHaveBeenCalledTimes(1);

    expect(getPostCallPath()).toBe("/api/projects");
    const body = getPostCallBody();
    expect(body.name).toBe("my-app");
    expect(body.path).toBe(process.cwd());
    expect(body.description).toBe("My awesome app");

    // Verify success output was printed
    const output = consoleSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(output).toContain("proj_abc123");
    expect(output).toContain("my-app");
  });

  it("uses detected name when no --name flag provided", async () => {
    const { runRegister } = await import("./register.js");

    await runRegister({});

    const body = getPostCallBody();
    expect(body.name).toBe("my-app");
  });

  it("uses --name flag override when provided", async () => {
    const { runRegister } = await import("./register.js");

    await runRegister({ name: "custom-name" });

    const body = getPostCallBody();
    expect(body.name).toBe("custom-name");
  });

  it("uses --description flag when provided", async () => {
    const { runRegister } = await import("./register.js");

    await runRegister({ description: "Custom description" });

    const body = getPostCallBody();
    expect(body.description).toBe("Custom description");
  });

  it("uses detected description when no --description flag", async () => {
    const { runRegister } = await import("./register.js");

    await runRegister({});

    const body = getPostCallBody();
    expect(body.description).toBe("My awesome app");
  });

  it("omits description when neither detected nor flagged", async () => {
    mockDetectProjectName.mockImplementation((): Promise<DetectionResult> =>
      Promise.resolve({
        name: "bare-project",
        source: "directory",
        path: "/home/user/bare-project",
      }),
    );

    const { runRegister } = await import("./register.js");

    await runRegister({});

    const body = getPostCallBody();
    expect(body.description).toBeUndefined();
  });

  it("shows graceful error when daemon is offline", async () => {
    mockPost.mockImplementation(() => {
      throw new DaemonUnavailableError("Connection refused");
    });

    const { runRegister } = await import("./register.js");

    // Should not throw
    await runRegister({});

    const output = consoleSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(output).toContain("Daemon not running");
    expect(output).toContain("goopspec daemon start");
  });

  it("handles already-registered project gracefully", async () => {
    mockPost.mockImplementation(() => {
      throw new DaemonApiError(400, "Project path already registered");
    });

    const { runRegister } = await import("./register.js");

    // Should not throw
    await runRegister({});

    const output = consoleSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(output).toContain("already registered");
  });

  it("handles generic daemon API errors gracefully", async () => {
    mockPost.mockImplementation(() => {
      throw new DaemonApiError(500, "Internal server error");
    });

    const { runRegister } = await import("./register.js");

    // Should not throw
    await runRegister({});

    const output = consoleSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(output).toContain("Internal server error");
  });

  it("detects project name from process.cwd()", async () => {
    const { runRegister } = await import("./register.js");

    await runRegister({});

    expect(mockDetectProjectName).toHaveBeenCalledWith(process.cwd());
  });

  it("never throws from runRegister", async () => {
    // Simulate an unexpected error
    mockDetectProjectName.mockImplementation(() => {
      throw new Error("Unexpected filesystem error");
    });

    const { runRegister } = await import("./register.js");

    // Should not throw — graceful error handling
    await expect(runRegister({})).resolves.toBeUndefined();
  });
});
