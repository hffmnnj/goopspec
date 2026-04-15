import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";

import type { DaemonHealth } from "@goopspec/core";

import {
  DaemonApiError,
  DaemonUnavailableError,
} from "../../features/daemon/client.js";
import type {
  InstallOptions,
  ServiceAdapter,
  ServiceInfo,
  ServiceOperationResult,
} from "../services/types.js";

// ── Mock state ────────────────────────────────────────────────────────────

function createMockAdapter(overrides: Partial<ServiceAdapter> = {}): ServiceAdapter {
  return {
    platform: "systemd",
    install: mock(() =>
      Promise.resolve<ServiceOperationResult>({ success: true, message: "Installed" }),
    ),
    uninstall: mock(() =>
      Promise.resolve<ServiceOperationResult>({ success: true, message: "Uninstalled" }),
    ),
    start: mock(() =>
      Promise.resolve<ServiceOperationResult>({ success: true, message: "Started" }),
    ),
    stop: mock(() =>
      Promise.resolve<ServiceOperationResult>({ success: true, message: "Stopped" }),
    ),
    status: mock(() =>
      Promise.resolve<ServiceInfo>({ status: "running" }),
    ),
    isInstalled: mock(() => Promise.resolve(true)),
    ...overrides,
  };
}

let mockAdapter = createMockAdapter();

const mockHealthResponse: DaemonHealth = {
  status: "ok",
  uptime: 3661,
  version: "0.2.8",
  projectCount: 3,
  activeWorkflows: 1,
  timestamp: "2026-03-11T12:00:00Z",
};

const mockGet = mock(() => Promise.resolve(mockHealthResponse));
const mockGetBaseUrl = mock(() => "http://localhost:7331");

let daemonAvailable = true;

// Mock the service adapter factory — spread real module to preserve other exports
const realServicesIndex = await import("../services/index.js");
mock.module("../services/index.js", () => ({
  ...realServicesIndex,
  createServiceAdapter: mock(() => mockAdapter),
}));

// Mock the daemon client — preserve error classes
mock.module("../../features/daemon/client.js", () => ({
  DaemonUnavailableError,
  DaemonApiError,
  DaemonClient: class MockDaemonClient {
    get = mockGet;
    getBaseUrl = mockGetBaseUrl;
  },
  createDaemonClient: mock(() => {
    if (!daemonAvailable) {
      throw new DaemonUnavailableError("Connection refused");
    }
    return Promise.resolve({
      get: mockGet,
      getBaseUrl: mockGetBaseUrl,
    });
  }),
}));

// Mock platform detection — spread real module
const realPlatform = await import("../../features/setup/platform.js");
mock.module("../../features/setup/platform.js", () => ({
  ...realPlatform,
  detectPlatform: mock(() => ({
    os: "linux" as const,
    arch: "x64" as const,
    runtime: "bun" as const,
    packageSuffix: "linux-x64",
    description: "Linux x64 (Intel/AMD)",
    isWSL: false,
    serviceManager: "systemd" as const,
  })),
}));

// Mock config — spread real module
const realConfig = await import("../config.js");
mock.module("../config.js", () => ({
  ...realConfig,
  getConfig: mock(() =>
    Promise.resolve({
      daemonUrl: "http://localhost:7331",
      port: 7331,
      host: "localhost",
    }),
  ),
}));

// Mock ui.ts — spread real module to preserve formatTable and other exports
let confirmResult: boolean | symbol = true;
const realUi = await import("../ui.js");
mock.module("../ui.js", () => ({
  ...realUi,
  showBanner: mock(() => {}),
  sectionHeader: mock((..._args: unknown[]) => {}),
  showError: mock((msg: string, _suggestion?: string) => {
    console.log(`Error: ${msg}`);
  }),
  showSuccess: mock((msg: string) => {
    console.log(`Success: ${msg}`);
  }),
  showInfo: mock((msg: string) => {
    console.log(`Info: ${msg}`);
  }),
  confirm: mock(() => Promise.resolve(confirmResult)),
  isCancel: mock((value: unknown) => typeof value === "symbol"),
}));

// ── Helpers ───────────────────────────────────────────────────────────────

let consoleSpy: ReturnType<typeof spyOn>;

function getOutput(): string {
  return consoleSpy.mock.calls.map((c) => String(c[0] ?? "")).join("\n");
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe("goopspec daemon command", () => {
  beforeEach(() => {
    mockAdapter = createMockAdapter();
    daemonAvailable = true;
    confirmResult = true;

    mockGet.mockClear();
    mockGetBaseUrl.mockClear();
    mockGet.mockImplementation(() => Promise.resolve(mockHealthResponse));

    consoleSpy = spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  // ── Invalid subcommand ──────────────────────────────────────────────

  describe("invalid subcommand", () => {
    it("shows error for unknown subcommand", async () => {
      const { runDaemon } = await import("./daemon.js");

      await runDaemon("restart", {});

      const output = getOutput();
      expect(output).toContain("Unknown daemon subcommand");
      expect(output).toContain("restart");
      expect(output).toContain("start|stop|status|install|uninstall");
    });
  });

  // ── daemon status ───────────────────────────────────────────────────

  describe("daemon status", () => {
    it("shows connected info when daemon is running", async () => {
      const { runDaemon } = await import("./daemon.js");

      await runDaemon("status", {});

      const output = getOutput();
      expect(output).toContain("running");
      expect(output).toContain("connected");
      expect(output).toContain("0.2.8");
      expect(output).toContain("7331");
    });

    it("shows not-installed status when service is not installed", async () => {
      mockAdapter = createMockAdapter({
        status: mock(() =>
          Promise.resolve<ServiceInfo>({ status: "not-installed" }),
        ),
      });
      daemonAvailable = false;

      const { runDaemon } = await import("./daemon.js");

      await runDaemon("status", {});

      const output = getOutput();
      expect(output).toContain("not-installed");
      expect(output).toContain("disconnected");
      expect(output).toContain("goopspec daemon install");
    });

    it("shows disconnected when daemon is not reachable", async () => {
      mockAdapter = createMockAdapter({
        status: mock(() =>
          Promise.resolve<ServiceInfo>({ status: "stopped" }),
        ),
      });
      daemonAvailable = false;

      const { runDaemon } = await import("./daemon.js");

      await runDaemon("status", {});

      const output = getOutput();
      expect(output).toContain("stopped");
      expect(output).toContain("disconnected");
    });
  });

  // ── daemon install ──────────────────────────────────────────────────

  describe("daemon install", () => {
    it("calls adapter.install() with correct options", async () => {
      const { runDaemon } = await import("./daemon.js");

      await runDaemon("install", {});

      expect(mockAdapter.install).toHaveBeenCalledTimes(1);

      const callArgs = (mockAdapter.install as ReturnType<typeof mock>).mock.calls[0] as [InstallOptions];
      const options = callArgs[0];
      expect(options.port).toBe(7331);
      expect(options.host).toBe("localhost");
      expect(typeof options.bunPath).toBe("string");
      expect(typeof options.daemonPath).toBe("string");
    });

    it("shows success message after install", async () => {
      const { runDaemon } = await import("./daemon.js");

      await runDaemon("install", {});

      const output = getOutput();
      expect(output).toContain("Service installed");
      expect(output).toContain("goopspec daemon start");
    });

    it("shows error when install fails", async () => {
      mockAdapter = createMockAdapter({
        install: mock(() =>
          Promise.resolve<ServiceOperationResult>({
            success: false,
            message: "Permission denied",
          }),
        ),
      });

      const { runDaemon } = await import("./daemon.js");

      await runDaemon("install", {});

      const output = getOutput();
      expect(output).toContain("Permission denied");
    });
  });

  // ── daemon start ────────────────────────────────────────────────────

  describe("daemon start", () => {
    it("calls adapter.install() then adapter.start()", async () => {
      const { runDaemon } = await import("./daemon.js");

      await runDaemon("start", {});

      expect(mockAdapter.install).toHaveBeenCalledTimes(1);
      expect(mockAdapter.start).toHaveBeenCalledTimes(1);
    });

    it("shows success when daemon starts and health check passes", async () => {
      const { runDaemon } = await import("./daemon.js");

      await runDaemon("start", {});

      const output = getOutput();
      expect(output).toContain("Daemon is running");
      expect(output).toContain("0.2.8");
    });

    it("does not start if install fails", async () => {
      mockAdapter = createMockAdapter({
        install: mock(() =>
          Promise.resolve<ServiceOperationResult>({
            success: false,
            message: "Cannot write service file",
          }),
        ),
      });

      const { runDaemon } = await import("./daemon.js");

      await runDaemon("start", {});

      expect(mockAdapter.start).not.toHaveBeenCalled();
      const output = getOutput();
      expect(output).toContain("Cannot write service file");
    });

    it("shows error when start fails", async () => {
      mockAdapter = createMockAdapter({
        start: mock(() =>
          Promise.resolve<ServiceOperationResult>({
            success: false,
            message: "Service failed to start",
          }),
        ),
      });

      const { runDaemon } = await import("./daemon.js");

      await runDaemon("start", {});

      const output = getOutput();
      expect(output).toContain("Service failed to start");
    });
  });

  // ── daemon stop ─────────────────────────────────────────────────────

  describe("daemon stop", () => {
    it("calls adapter.stop()", async () => {
      const { runDaemon } = await import("./daemon.js");

      await runDaemon("stop", {});

      expect(mockAdapter.stop).toHaveBeenCalledTimes(1);
    });

    it("shows success when stop succeeds", async () => {
      const { runDaemon } = await import("./daemon.js");

      await runDaemon("stop", {});

      const output = getOutput();
      expect(output).toContain("Daemon stopped");
    });

    it("shows error when stop fails", async () => {
      mockAdapter = createMockAdapter({
        stop: mock(() =>
          Promise.resolve<ServiceOperationResult>({
            success: false,
            message: "Service not running",
          }),
        ),
      });

      const { runDaemon } = await import("./daemon.js");

      await runDaemon("stop", {});

      const output = getOutput();
      expect(output).toContain("Service not running");
    });
  });

  // ── daemon uninstall ────────────────────────────────────────────────

  describe("daemon uninstall", () => {
    it("calls adapter.uninstall() after confirmation", async () => {
      confirmResult = true;

      const { runDaemon } = await import("./daemon.js");

      await runDaemon("uninstall", {});

      expect(mockAdapter.uninstall).toHaveBeenCalledTimes(1);
    });

    it("shows success after uninstall", async () => {
      confirmResult = true;

      const { runDaemon } = await import("./daemon.js");

      await runDaemon("uninstall", {});

      const output = getOutput();
      expect(output).toContain("service has been removed");
    });

    it("cancels when user declines confirmation", async () => {
      confirmResult = false;

      const { runDaemon } = await import("./daemon.js");

      await runDaemon("uninstall", {});

      expect(mockAdapter.uninstall).not.toHaveBeenCalled();
      const output = getOutput();
      expect(output).toContain("cancelled");
    });

    it("cancels when user presses Ctrl+C", async () => {
      confirmResult = Symbol("cancel");

      const { runDaemon } = await import("./daemon.js");

      await runDaemon("uninstall", {});

      expect(mockAdapter.uninstall).not.toHaveBeenCalled();
    });

    it("shows error when uninstall fails", async () => {
      confirmResult = true;
      mockAdapter = createMockAdapter({
        uninstall: mock(() =>
          Promise.resolve<ServiceOperationResult>({
            success: false,
            message: "Service file not found",
          }),
        ),
      });

      const { runDaemon } = await import("./daemon.js");

      await runDaemon("uninstall", {});

      const output = getOutput();
      expect(output).toContain("Service file not found");
    });
  });

  // ── Never throws ────────────────────────────────────────────────────

  describe("error handling", () => {
    it("never throws from runDaemon", async () => {
      // Force an unexpected error by making adapter throw
      mockAdapter = createMockAdapter({
        status: mock(() => {
          throw new Error("Unexpected crash");
        }),
      });

      const { runDaemon } = await import("./daemon.js");

      // Should not throw
      await expect(runDaemon("status", {})).resolves.toBeUndefined();
    });
  });

  // ── daemon status edge cases ─────────────────────────────────────────

  describe("daemon status edge cases", () => {
    it("shows service running but daemon unreachable when health check fails", async () => {
      // Service adapter says "running" but daemon HTTP health check fails
      mockAdapter = createMockAdapter({
        status: mock(() =>
          Promise.resolve<ServiceInfo>({ status: "running" }),
        ),
      });
      daemonAvailable = false;

      const { runDaemon } = await import("./daemon.js");

      await runDaemon("status", {});

      const output = getOutput();
      // Service shows running
      expect(output).toContain("running");
      // But health shows disconnected (daemon process crashed or port mismatch)
      expect(output).toContain("disconnected");
    });

    it("shows uptime formatted as hours and minutes for long-running daemon", async () => {
      mockGet.mockImplementation(() =>
        Promise.resolve({
          ...mockHealthResponse,
          uptime: 7261, // 2h 1m 1s
        }),
      );

      const { runDaemon } = await import("./daemon.js");

      await runDaemon("status", {});

      const output = getOutput();
      expect(output).toContain("2h");
      expect(output).toContain("1m");
    });

    it("shows uptime formatted as minutes and seconds for short-running daemon", async () => {
      mockGet.mockImplementation(() =>
        Promise.resolve({
          ...mockHealthResponse,
          uptime: 125, // 2m 5s
        }),
      );

      const { runDaemon } = await import("./daemon.js");

      await runDaemon("status", {});

      const output = getOutput();
      expect(output).toContain("2m");
      expect(output).toContain("5s");
    });
  });

  // ── daemon start edge cases ────────────────────────────────────────

  describe("daemon start edge cases", () => {
    it("shows health timeout message when daemon starts but health check times out", async () => {
      // Daemon starts successfully but health endpoint never responds
      daemonAvailable = false;

      // Use fake timers so the 5s health poll completes instantly
      const origDateNow = Date.now;
      let fakeTime = origDateNow.call(Date);
      Date.now = () => fakeTime;

      const origSetTimeout = globalThis.setTimeout;
      globalThis.setTimeout = ((fn: () => void, ms: number) => {
        fakeTime += ms;
        return origSetTimeout(fn, 0);
      }) as typeof globalThis.setTimeout;

      try {
        const { runDaemon } = await import("./daemon.js");

        await runDaemon("start", {});

        const output = getOutput();
        // Install and start succeed
        expect(mockAdapter.install).toHaveBeenCalledTimes(1);
        expect(mockAdapter.start).toHaveBeenCalledTimes(1);
        // But health check times out — shows info message
        expect(output).toContain("health check timed out");
        expect(output).toContain("goopspec daemon status");
      } finally {
        Date.now = origDateNow;
        globalThis.setTimeout = origSetTimeout;
      }
    });
  });

  // ── daemon install edge cases ──────────────────────────────────────

  describe("daemon install edge cases", () => {
    it("shows not-supported message on unsupported platform (NullAdapter)", async () => {
      // Simulate NullAdapter behavior — all operations return not-supported
      mockAdapter = createMockAdapter({
        platform: "none",
        install: mock(() =>
          Promise.resolve<ServiceOperationResult>({
            success: false,
            message: "Service management not supported on this platform",
          }),
        ),
      });

      const { runDaemon } = await import("./daemon.js");

      await runDaemon("install", {});

      const output = getOutput();
      expect(output).toContain("not supported");
    });

    it("shows not-supported message for start on unsupported platform", async () => {
      mockAdapter = createMockAdapter({
        platform: "none",
        install: mock(() =>
          Promise.resolve<ServiceOperationResult>({
            success: false,
            message: "Service management not supported on this platform",
          }),
        ),
      });

      const { runDaemon } = await import("./daemon.js");

      await runDaemon("start", {});

      const output = getOutput();
      expect(output).toContain("not supported");
      // Should not attempt to start since install failed
      expect(mockAdapter.start).not.toHaveBeenCalled();
    });
  });

  // ── daemon uninstall edge cases ────────────────────────────────────

  describe("daemon uninstall edge cases", () => {
    it("calls adapter.uninstall() when user confirms with true", async () => {
      confirmResult = true;
      const uninstallMock = mock(() =>
        Promise.resolve<ServiceOperationResult>({
          success: true,
          message: "Service removed",
        }),
      );
      mockAdapter = createMockAdapter({
        uninstall: uninstallMock,
      });

      const { runDaemon } = await import("./daemon.js");

      await runDaemon("uninstall", {});

      expect(uninstallMock).toHaveBeenCalledTimes(1);
      const output = getOutput();
      expect(output).toContain("removed");
    });

    it("shows not-supported message for uninstall on unsupported platform", async () => {
      confirmResult = true;
      mockAdapter = createMockAdapter({
        uninstall: mock(() =>
          Promise.resolve<ServiceOperationResult>({
            success: false,
            message: "Service management not supported on this platform",
          }),
        ),
      });

      const { runDaemon } = await import("./daemon.js");

      await runDaemon("uninstall", {});

      const output = getOutput();
      expect(output).toContain("not supported");
    });
  });

  // ── All subcommands represented ────────────────────────────────────

  describe("subcommand coverage", () => {
    it("handles all 5 valid subcommands without throwing", async () => {
      const { runDaemon } = await import("./daemon.js");

      for (const cmd of ["start", "stop", "status", "install", "uninstall"]) {
        // Reset adapter for each subcommand
        mockAdapter = createMockAdapter();
        confirmResult = true;
        await expect(runDaemon(cmd, {})).resolves.toBeUndefined();
      }
    });

    it("rejects empty string as subcommand", async () => {
      const { runDaemon } = await import("./daemon.js");

      await runDaemon("", {});

      const output = getOutput();
      expect(output).toContain("Unknown daemon subcommand");
    });
  });

  // ── Error handling edge cases ──────────────────────────────────────

  describe("error handling edge cases", () => {
    it("catches non-Error thrown from adapter.status()", async () => {
      mockAdapter = createMockAdapter({
        status: mock(() => {
          throw "string error from adapter";
        }),
      });

      const { runDaemon } = await import("./daemon.js");

      // Should not throw — outer catch handles it
      await expect(runDaemon("status", {})).resolves.toBeUndefined();
    });

    it("catches error from adapter.stop()", async () => {
      mockAdapter = createMockAdapter({
        stop: mock(() => {
          throw new Error("Unexpected stop failure");
        }),
      });

      const { runDaemon } = await import("./daemon.js");

      await expect(runDaemon("stop", {})).resolves.toBeUndefined();
    });

    it("catches error from adapter.start() throwing (not returning failure)", async () => {
      mockAdapter = createMockAdapter({
        start: mock(() => {
          throw new Error("Unexpected start crash");
        }),
      });

      const { runDaemon } = await import("./daemon.js");

      await expect(runDaemon("start", {})).resolves.toBeUndefined();
    });
  });

  // ── Helper functions ────────────────────────────────────────────────

  describe("resolveBunPath", () => {
    it("returns a string", async () => {
      const { resolveBunPath } = await import("./daemon.js");
      const result = resolveBunPath();
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe("resolveDaemonPath", () => {
    it("returns a string", async () => {
      const { resolveDaemonPath } = await import("./daemon.js");
      const result = resolveDaemonPath();
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    });
  });
});
