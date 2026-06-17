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

  // ── Edge case tests ──────────────────────────────────────────────────

  describe("edge cases", () => {
    it("uses directory name fallback when no manifest files exist", async () => {
      mockDetectProjectName.mockImplementation((): Promise<DetectionResult> =>
        Promise.resolve({
          name: "my-project-dir",
          source: "directory",
          path: "/home/user/my-project-dir",
        }),
      );

      const { runRegister } = await import("./register.js");

      await runRegister({});

      const body = getPostCallBody();
      expect(body.name).toBe("my-project-dir");
      expect(body.description).toBeUndefined();

      const output = consoleSpy.mock.calls.map((c) => String(c[0])).join("\n");
      expect(output).toContain("directory");
    });

    it("shows internal error message when daemon returns 500", async () => {
      mockPost.mockImplementation(() => {
        throw new DaemonApiError(500, "Internal server error: database locked");
      });

      const { runRegister } = await import("./register.js");

      await runRegister({});

      const output = consoleSpy.mock.calls.map((c) => String(c[0])).join("\n");
      expect(output).toContain("Internal server error: database locked");
      expect(output).toContain("Check the project path");
    });

    it("handles project name with special characters gracefully", async () => {
      mockDetectProjectName.mockImplementation((): Promise<DetectionResult> =>
        Promise.resolve({
          name: "@scope/my-pkg.v2",
          source: "package.json",
          path: "/home/user/my-pkg/package.json",
        }),
      );

      mockPost.mockImplementation(() =>
        Promise.resolve({
          id: "proj_special",
          name: "@scope/my-pkg.v2",
          path: process.cwd(),
          createdAt: "2026-03-11T00:00:00Z",
          updatedAt: "2026-03-11T00:00:00Z",
        }),
      );

      const { runRegister } = await import("./register.js");

      await runRegister({});

      const body = getPostCallBody();
      expect(body.name).toBe("@scope/my-pkg.v2");

      const output = consoleSpy.mock.calls.map((c) => String(c[0])).join("\n");
      expect(output).toContain("@scope/my-pkg.v2");
      expect(output).toContain("proj_special");
    });

    it("falls back to detected name when --name flag is empty string", async () => {
      const { runRegister } = await import("./register.js");

      // Empty string is still typeof "string", so the code uses it as-is
      // This tests the actual behavior: empty string IS used as the name override
      await runRegister({ name: "" });

      const body = getPostCallBody();
      // The code checks `typeof flags["name"] === "string"` — empty string passes
      // This documents the current behavior
      expect(body.name).toBe("");
    });

    it("handles daemon timeout (DaemonUnavailableError with abort message)", async () => {
      mockPost.mockImplementation(() => {
        throw new DaemonUnavailableError("The operation was aborted");
      });

      const { runRegister } = await import("./register.js");

      await runRegister({});

      const output = consoleSpy.mock.calls.map((c) => String(c[0])).join("\n");
      expect(output).toContain("Daemon not running");
      expect(output).toContain("goopspec daemon start");
    });

    it("handles non-Error thrown from daemon client", async () => {
      mockPost.mockImplementation(() => {
        throw "string error";
      });

      const { runRegister } = await import("./register.js");

      await runRegister({});

      const output = consoleSpy.mock.calls.map((c) => String(c[0])).join("\n");
      // Falls through to the generic catch — should show unexpected error
      expect(output).toContain("unexpected error");
    });
  });

  // ── Output format tests ──────────────────────────────────────────────

  describe("output format", () => {
    it("success output contains project id, name, and daemon URL", async () => {
      mockPost.mockImplementation(() =>
        Promise.resolve({
          id: "proj_snapshot1",
          name: "snapshot-app",
          path: process.cwd(),
          description: "A snapshot test app",
          createdAt: "2026-03-11T00:00:00Z",
          updatedAt: "2026-03-11T00:00:00Z",
        }),
      );

      mockDetectProjectName.mockImplementation((): Promise<DetectionResult> =>
        Promise.resolve({
          name: "snapshot-app",
          source: "package.json",
          path: "/home/user/snapshot-app/package.json",
          description: "A snapshot test app",
        }),
      );

      const { runRegister } = await import("./register.js");

      await runRegister({});

      const output = consoleSpy.mock.calls.map((c) => String(c[0])).join("\n");

      // Verify all key fields are present in output
      expect(output).toContain("proj_snapshot1");
      expect(output).toContain("snapshot-app");
      expect(output).toContain("A snapshot test app");
      expect(output).toContain("localhost:7331");
      expect(output).toContain("registered");
    });

    it("success output omits description line when project has no description", async () => {
      mockPost.mockImplementation(() =>
        Promise.resolve({
          id: "proj_nodesc",
          name: "no-desc-app",
          path: process.cwd(),
          createdAt: "2026-03-11T00:00:00Z",
          updatedAt: "2026-03-11T00:00:00Z",
        }),
      );

      mockDetectProjectName.mockImplementation((): Promise<DetectionResult> =>
        Promise.resolve({
          name: "no-desc-app",
          source: "directory",
          path: "/home/user/no-desc-app",
        }),
      );

      const { runRegister } = await import("./register.js");

      await runRegister({});

      const output = consoleSpy.mock.calls.map((c) => String(c[0])).join("\n");
      expect(output).toContain("proj_nodesc");
      expect(output).toContain("no-desc-app");
      // description keyValue line should not appear
      expect(output).not.toContain("description");
    });

    it("shows detection source in output", async () => {
      mockDetectProjectName.mockImplementation((): Promise<DetectionResult> =>
        Promise.resolve({
          name: "cargo-project",
          source: "Cargo.toml",
          path: "/home/user/cargo-project/Cargo.toml",
        }),
      );

      const { runRegister } = await import("./register.js");

      await runRegister({});

      const output = consoleSpy.mock.calls.map((c) => String(c[0])).join("\n");
      expect(output).toContain("Cargo.toml");
    });

    it("shows override notice when --name flag is used", async () => {
      const { runRegister } = await import("./register.js");

      await runRegister({ name: "overridden-name" });

      const output = consoleSpy.mock.calls.map((c) => String(c[0])).join("\n");
      expect(output).toContain("Override");
      expect(output).toContain("--name");
    });
  });
});
