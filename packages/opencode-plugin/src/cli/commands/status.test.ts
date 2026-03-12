import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";

import type { DaemonHealth } from "@goopspec/core";

import {
  DaemonApiError,
  DaemonUnavailableError,
} from "../../features/daemon/client.js";

// ── Mock state ────────────────────────────────────────────────────────────

const mockHealthResponse: DaemonHealth = {
  status: "ok",
  uptime: 3661,
  version: "0.2.8",
  projectCount: 3,
  activeWorkflows: 1,
  timestamp: "2026-03-11T12:00:00Z",
};

const mockGet = mock(() => Promise.resolve(mockHealthResponse));

let daemonAvailable = true;

// Mock the daemon client — preserve error classes
mock.module("../../features/daemon/client.js", () => ({
  DaemonUnavailableError,
  DaemonApiError,
  DaemonClient: class MockDaemonClient {
    get = mockGet;
  },
  createDaemonClient: mock(() => {
    if (!daemonAvailable) {
      throw new DaemonUnavailableError("Connection refused");
    }
    return Promise.resolve({
      get: mockGet,
    });
  }),
}));

// Mock setup status — provide a realistic initialized project
const mockSetupStatus = {
  initialized: true,
  projectName: "test-project",
  scope: { hasGlobal: true, hasProject: true },
  memory: { configured: true, enabled: true, provider: "local" },
  mcps: { installed: ["goopspec"], missing: [] },
  agentModels: {},
};

let setupInitialized = true;

const realSetup = await import("../../features/setup/index.js");
mock.module("../../features/setup/index.js", () => ({
  ...realSetup,
  getSetupStatus: mock(() =>
    Promise.resolve(
      setupInitialized
        ? mockSetupStatus
        : { ...mockSetupStatus, initialized: false },
    ),
  ),
}));

// Mock ui.ts — spread real module to preserve formatTable and other exports
const realUi = await import("../ui.js");
mock.module("../ui.js", () => ({
  ...realUi,
  sectionHeader: mock((..._args: unknown[]) => {}),
  showError: mock((msg: string, _suggestion?: string) => {
    console.log(`Error: ${msg}`);
  }),
  showInfo: mock((msg: string) => {
    console.log(`Info: ${msg}`);
  }),
  showWarning: mock((msg: string) => {
    console.log(`Warning: ${msg}`);
  }),
}));

// ── Helpers ───────────────────────────────────────────────────────────────

let consoleSpy: ReturnType<typeof spyOn>;

function getOutput(): string {
  return consoleSpy.mock.calls.map((c) => String(c[0] ?? "")).join("\n");
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe("goopspec status command", () => {
  beforeEach(() => {
    daemonAvailable = true;
    setupInitialized = true;

    mockGet.mockClear();
    mockGet.mockImplementation(() => Promise.resolve(mockHealthResponse));

    consoleSpy = spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  // ── Daemon online ──────────────────────────────────────────────────

  describe("daemon online", () => {
    it("shows connection info when daemon is running", async () => {
      const { runStatus } = await import("./status.js");

      await runStatus();

      const output = getOutput();
      expect(output).toContain("Connected");
      expect(output).toContain("✓");
      expect(output).toContain("0.2.8");
    });

    it("shows uptime formatted", async () => {
      const { runStatus } = await import("./status.js");

      await runStatus();

      const output = getOutput();
      // 3661 seconds = 1h 1m
      expect(output).toContain("1h");
      expect(output).toContain("1m");
    });

    it("shows project count", async () => {
      const { runStatus } = await import("./status.js");

      await runStatus();

      const output = getOutput();
      expect(output).toContain("Projects");
      expect(output).toContain("3");
    });

    it("shows active workflows when present", async () => {
      const { runStatus } = await import("./status.js");

      await runStatus();

      const output = getOutput();
      expect(output).toContain("Active workflows");
      expect(output).toContain("1");
    });

    it("hides active workflows when zero", async () => {
      mockGet.mockImplementation(() =>
        Promise.resolve({
          ...mockHealthResponse,
          activeWorkflows: 0,
        }),
      );

      const { runStatus } = await import("./status.js");

      await runStatus();

      const output = getOutput();
      expect(output).not.toContain("Active workflows");
    });
  });

  // ── Daemon offline ─────────────────────────────────────────────────

  describe("daemon offline", () => {
    it("shows graceful not-running message when daemon is offline", async () => {
      daemonAvailable = false;

      const { runStatus } = await import("./status.js");

      await runStatus();

      const output = getOutput();
      expect(output).toContain("not running");
      expect(output).toContain("goopspec daemon start");
    });

    it("shows disconnected indicator when daemon is offline", async () => {
      daemonAvailable = false;

      const { runStatus } = await import("./status.js");

      await runStatus();

      const output = getOutput();
      expect(output).toContain("✗");
    });

    it("shows not-running when daemon get() throws", async () => {
      mockGet.mockImplementation(() => {
        throw new DaemonUnavailableError("Connection refused");
      });

      // createDaemonClient succeeds but get() throws
      daemonAvailable = true;

      const { runStatus } = await import("./status.js");

      await runStatus();

      const output = getOutput();
      expect(output).toContain("not running");
    });
  });

  // ── Never throws ──────────────────────────────────────────────────

  describe("error handling", () => {
    it("runStatus does not throw when daemon is offline", async () => {
      daemonAvailable = false;

      const { runStatus } = await import("./status.js");

      await expect(runStatus()).resolves.toBeUndefined();
    });

    it("runStatus does not throw when daemon get() rejects", async () => {
      mockGet.mockImplementation(() =>
        Promise.reject(new DaemonApiError(500, "Internal Server Error")),
      );

      const { runStatus } = await import("./status.js");

      await expect(runStatus()).resolves.toBeUndefined();
    });

    it("runStatus does not throw when daemon get() throws synchronously", async () => {
      mockGet.mockImplementation(() => {
        throw new Error("Unexpected crash");
      });

      const { runStatus } = await import("./status.js");

      await expect(runStatus()).resolves.toBeUndefined();
    });
  });

  // ── Uptime formatting ─────────────────────────────────────────────

  describe("formatUptime", () => {
    it("formats seconds only", async () => {
      const { formatUptime } = await import("./status.js");
      expect(formatUptime(45)).toBe("45s");
    });

    it("formats minutes and seconds", async () => {
      const { formatUptime } = await import("./status.js");
      expect(formatUptime(125)).toBe("2m 5s");
    });

    it("formats hours and minutes", async () => {
      const { formatUptime } = await import("./status.js");
      expect(formatUptime(7261)).toBe("2h 1m");
    });

    it("formats days, hours, and minutes", async () => {
      const { formatUptime } = await import("./status.js");
      expect(formatUptime(90061)).toBe("1d 1h 1m");
    });

    it("formats zero seconds", async () => {
      const { formatUptime } = await import("./status.js");
      expect(formatUptime(0)).toBe("0s");
    });

    it("formats exactly one hour", async () => {
      const { formatUptime } = await import("./status.js");
      expect(formatUptime(3600)).toBe("1h 0m");
    });

    it("formats exactly one day", async () => {
      const { formatUptime } = await import("./status.js");
      expect(formatUptime(86400)).toBe("1d 0h 0m");
    });
  });

  // ── Not initialized ───────────────────────────────────────────────

  describe("not initialized", () => {
    it("shows init message and does not query daemon", async () => {
      setupInitialized = false;

      const { runStatus } = await import("./status.js");

      await runStatus();

      const output = getOutput();
      expect(output).toContain("not initialized");
      expect(output).toContain("goopspec init");
      // Should not have queried daemon
      expect(mockGet).not.toHaveBeenCalled();
    });
  });
});
