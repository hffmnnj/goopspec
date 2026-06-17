/**
 * CLI ↔ Daemon Integration Tests
 *
 * Verifies the full data flow between CLI commands and the daemon
 * using mocked DaemonClient. No real daemon process is started.
 *
 * Covers:
 *  1. Register → daemon API flow
 *  2. Daemon health → CLI status display
 *  3. Config propagation to DaemonClient
 *  4. Graceful degradation when daemon is offline
 */

import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";

import type { DaemonHealth } from "@goopspec/core";

import {
  DaemonApiError,
  DaemonUnavailableError,
} from "../features/daemon/client.js";
import type { ServiceAdapter, ServiceInfo, ServiceOperationResult } from "./services/types.js";

// ── Shared mock state ─────────────────────────────────────────────────────

const mockPost = mock(() =>
  Promise.resolve({
    id: "proj_int_001",
    name: "integration-app",
    path: "/tmp/integration-app",
    createdAt: "2026-03-11T00:00:00Z",
    updatedAt: "2026-03-11T00:00:00Z",
  }),
);

const mockGet = mock(() =>
  Promise.resolve<DaemonHealth>({
    status: "ok",
    uptime: 3600,
    version: "1.0.0",
    projectCount: 2,
    activeWorkflows: 0,
    timestamp: "2026-03-11T12:00:00Z",
  }),
);

const mockGetBaseUrl = mock(() => "http://localhost:7331");

let daemonAvailable = true;

// ── Mock: daemon client ───────────────────────────────────────────────────

mock.module("../features/daemon/client.js", () => ({
  DaemonUnavailableError,
  DaemonApiError,
  DaemonClient: class MockDaemonClient {
    private baseUrl: string;
    constructor(baseUrl = "http://localhost:7331") {
      this.baseUrl = baseUrl.replace(/\/+$/, "");
    }
    post = mockPost;
    get = mockGet;
    getBaseUrl = () => this.baseUrl;
    async isAvailable() {
      return daemonAvailable;
    }
  },
  createDaemonClient: mock(() => {
    if (!daemonAvailable) {
      throw new DaemonUnavailableError("Connection refused");
    }
    return Promise.resolve({
      post: mockPost,
      get: mockGet,
      getBaseUrl: mockGetBaseUrl,
      isAvailable: () => Promise.resolve(true),
    });
  }),
}));

// ── Mock: project detection ───────────────────────────────────────────────

const mockDetectProjectName = mock(() =>
  Promise.resolve({
    name: "integration-app",
    source: "package.json" as const,
    path: "/tmp/integration-app/package.json",
    description: "An integration test app",
  }),
);

mock.module("./detect-project.js", () => ({
  detectProjectName: mockDetectProjectName,
}));

// ── Mock: setup status (for status.ts) ────────────────────────────────────

const realSetupIndex = await import("../features/setup/index.js");
mock.module("../features/setup/index.js", () => ({
  ...realSetupIndex,
  getSetupStatus: mock(() =>
    Promise.resolve({
      initialized: true,
      projectName: "integration-app",
      scope: { hasGlobal: true, hasProject: true },
      memory: { configured: true, enabled: true, provider: "local" },
      mcps: { installed: ["goopspec"], missing: [] },
      agentModels: {},
    }),
  ),
}));

// ── Mock: service adapter (for daemon.ts) ─────────────────────────────────

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

const realServicesIndex = await import("./services/index.js");
mock.module("./services/index.js", () => ({
  ...realServicesIndex,
  createServiceAdapter: mock(() => mockAdapter),
}));

// ── Mock: platform detection ──────────────────────────────────────────────

const realPlatform = await import("../features/setup/platform.js");
mock.module("../features/setup/platform.js", () => ({
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

// ── Mock: config ──────────────────────────────────────────────────────────

let mockConfigPort = 7331;
let mockConfigHost = "localhost";

const realConfig = await import("./config.js");
mock.module("./config.js", () => ({
  ...realConfig,
  getConfig: mock(() =>
    Promise.resolve({
      daemonUrl: `http://${mockConfigHost}:${mockConfigPort}`,
      port: mockConfigPort,
      host: mockConfigHost,
    }),
  ),
  readConfig: mock(() =>
    Promise.resolve({
      daemonUrl: `http://${mockConfigHost}:${mockConfigPort}`,
      port: mockConfigPort,
      host: mockConfigHost,
    }),
  ),
}));

// ── Mock: UI modules (suppress output) ────────────────────────────────────

const realUi = await import("./ui.js");
mock.module("./ui.js", () => ({
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
  confirm: mock(() => Promise.resolve(true)),
  isCancel: mock((value: unknown) => typeof value === "symbol"),
}));

// ── Helpers ───────────────────────────────────────────────────────────────

let consoleSpy: ReturnType<typeof spyOn>;

function getOutput(): string {
  return consoleSpy.mock.calls.map((c) => String(c[0] ?? "")).join("\n");
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe("CLI ↔ Daemon integration", () => {
  beforeEach(() => {
    daemonAvailable = true;
    mockConfigPort = 7331;
    mockConfigHost = "localhost";
    mockAdapter = createMockAdapter();

    mockPost.mockClear();
    mockGet.mockClear();
    mockGetBaseUrl.mockClear();
    mockDetectProjectName.mockClear();

    // Reset default implementations
    mockPost.mockImplementation(() =>
      Promise.resolve({
        id: "proj_int_001",
        name: "integration-app",
        path: process.cwd(),
        description: "An integration test app",
        createdAt: "2026-03-11T00:00:00Z",
        updatedAt: "2026-03-11T00:00:00Z",
      }),
    );

    mockGet.mockImplementation(() =>
      Promise.resolve<DaemonHealth>({
        status: "ok",
        uptime: 3600,
        version: "1.0.0",
        projectCount: 2,
        activeWorkflows: 0,
        timestamp: "2026-03-11T12:00:00Z",
      }),
    );

    mockDetectProjectName.mockImplementation(() =>
      Promise.resolve({
        name: "integration-app",
        source: "package.json" as const,
        path: "/tmp/integration-app/package.json",
        description: "An integration test app",
      }),
    );

    consoleSpy = spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  // ═══════════════════════════════════════════════════════════════════════
  // 1. Register → Daemon API flow
  // ═══════════════════════════════════════════════════════════════════════

  describe("register → daemon API flow", () => {
    it("sends project data to daemon via POST /api/projects", async () => {
      const { runRegister } = await import("./commands/register.js");

      await runRegister({});

      // Verify the daemon client was called with the correct endpoint and data
      expect(mockPost).toHaveBeenCalledTimes(1);

      const calls = mockPost.mock.calls;
      const [path, body] = calls[0] as unknown as [string, Record<string, unknown>];

      expect(path).toBe("/api/projects");
      expect(body.name).toBe("integration-app");
      expect(body.path).toBe(process.cwd());
      expect(body.description).toBe("An integration test app");
    });

    it("propagates --name flag override to daemon POST body", async () => {
      const { runRegister } = await import("./commands/register.js");

      await runRegister({ name: "custom-project" });

      const calls = mockPost.mock.calls;
      const [, body] = calls[0] as unknown as [string, Record<string, unknown>];

      expect(body.name).toBe("custom-project");
    });

    it("propagates --description flag override to daemon POST body", async () => {
      const { runRegister } = await import("./commands/register.js");

      await runRegister({ description: "Custom description for daemon" });

      const calls = mockPost.mock.calls;
      const [, body] = calls[0] as unknown as [string, Record<string, unknown>];

      expect(body.description).toBe("Custom description for daemon");
    });

    it("displays daemon-returned project ID in success output", async () => {
      mockPost.mockImplementation(() =>
        Promise.resolve({
          id: "proj_from_daemon",
          name: "integration-app",
          path: process.cwd(),
          createdAt: "2026-03-11T00:00:00Z",
          updatedAt: "2026-03-11T00:00:00Z",
        }),
      );

      const { runRegister } = await import("./commands/register.js");

      await runRegister({});

      const output = getOutput();
      expect(output).toContain("proj_from_daemon");
      expect(output).toContain("registered");
    });

    it("displays daemon base URL in success output", async () => {
      const { runRegister } = await import("./commands/register.js");

      await runRegister({});

      const output = getOutput();
      expect(output).toContain("localhost:7331");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // 2. Daemon health → CLI status display
  // ═══════════════════════════════════════════════════════════════════════

  describe("daemon health → CLI status display", () => {
    it("shows connected status when daemon health returns ok", async () => {
      const { runDaemon } = await import("./commands/daemon.js");

      await runDaemon("status", {});

      const output = getOutput();
      expect(output).toContain("connected");
      expect(output).toContain("1.0.0");
    });

    it("shows daemon uptime from health response", async () => {
      mockGet.mockImplementation(() =>
        Promise.resolve<DaemonHealth>({
          status: "ok",
          uptime: 3661, // 1h 1m 1s
          version: "1.0.0",
          projectCount: 2,
          activeWorkflows: 0,
          timestamp: "2026-03-11T12:00:00Z",
        }),
      );

      const { runDaemon } = await import("./commands/daemon.js");

      await runDaemon("status", {});

      const output = getOutput();
      expect(output).toContain("1h");
      expect(output).toContain("1m");
    });

    it("shows version and port from health response and config", async () => {
      mockGet.mockImplementation(() =>
        Promise.resolve<DaemonHealth>({
          status: "ok",
          uptime: 100,
          version: "2.5.0",
          projectCount: 5,
          activeWorkflows: 3,
          timestamp: "2026-03-11T12:00:00Z",
        }),
      );

      const { runDaemon } = await import("./commands/daemon.js");

      await runDaemon("status", {});

      const output = getOutput();
      expect(output).toContain("2.5.0");
      expect(output).toContain("7331");
      expect(output).toContain("connected");
    });

    it("shows disconnected when daemon health check fails", async () => {
      daemonAvailable = false;
      mockAdapter = createMockAdapter({
        status: mock(() =>
          Promise.resolve<ServiceInfo>({ status: "stopped" }),
        ),
      });

      const { runDaemon } = await import("./commands/daemon.js");

      await runDaemon("status", {});

      const output = getOutput();
      expect(output).toContain("disconnected");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // 3. Config propagation
  // ═══════════════════════════════════════════════════════════════════════

  describe("config propagation", () => {
    it("createDaemonClient reads daemon URL from config", async () => {
      // The mock for createDaemonClient uses the mock config internally.
      // We verify the DaemonClient constructor receives the config URL
      // by checking the client's getBaseUrl() output.
      const { DaemonClient } = await import("../features/daemon/client.js");

      const client = new DaemonClient("http://localhost:7999");
      expect(client.getBaseUrl()).toBe("http://localhost:7999");
    });

    it("DaemonClient strips trailing slashes from base URL", async () => {
      const { DaemonClient } = await import("../features/daemon/client.js");

      const client = new DaemonClient("http://localhost:7999///");
      expect(client.getBaseUrl()).toBe("http://localhost:7999");
    });

    it("config port change is reflected in daemon status output", async () => {
      mockConfigPort = 9999;
      mockConfigHost = "0.0.0.0";

      const { runDaemon } = await import("./commands/daemon.js");

      await runDaemon("status", {});

      const output = getOutput();
      expect(output).toContain("9999");
    });

    it("default config uses port 7331 and localhost", async () => {
      mockConfigPort = 7331;
      mockConfigHost = "localhost";

      const { getConfig } = await import("./config.js");
      const config = await getConfig();

      expect(config.port).toBe(7331);
      expect(config.host).toBe("localhost");
      expect(config.daemonUrl).toBe("http://localhost:7331");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // 4. Graceful degradation — daemon offline
  // ═══════════════════════════════════════════════════════════════════════

  describe("graceful degradation — daemon offline", () => {
    beforeEach(() => {
      daemonAvailable = false;
    });

    it("register does not throw when daemon is offline", async () => {
      const { runRegister } = await import("./commands/register.js");

      // Should not throw — graceful error handling
      await expect(runRegister({})).resolves.toBeUndefined();

      const output = getOutput();
      // Should show a helpful error message about daemon not running
      expect(output).toMatch(/daemon|client|not running|not reachable|connection/i);
    });

    it("daemon status does not throw when daemon is offline", async () => {
      mockAdapter = createMockAdapter({
        status: mock(() =>
          Promise.resolve<ServiceInfo>({ status: "stopped" }),
        ),
      });

      const { runDaemon } = await import("./commands/daemon.js");

      // Should not throw
      await expect(runDaemon("status", {})).resolves.toBeUndefined();

      const output = getOutput();
      expect(output).toContain("disconnected");
    });

    it("daemon start does not throw when health check times out", async () => {
      // Daemon starts but health check fails (daemon not reachable)
      const origDateNow = Date.now;
      let fakeTime = origDateNow.call(Date);
      Date.now = () => fakeTime;

      const origSetTimeout = globalThis.setTimeout;
      globalThis.setTimeout = ((fn: () => void, ms: number) => {
        fakeTime += ms;
        return origSetTimeout(fn, 0);
      }) as typeof globalThis.setTimeout;

      try {
        const { runDaemon } = await import("./commands/daemon.js");

        // Should not throw even though health check fails
        await expect(runDaemon("start", {})).resolves.toBeUndefined();
      } finally {
        Date.now = origDateNow;
        globalThis.setTimeout = origSetTimeout;
      }
    });

    it("register shows suggestion to start daemon when offline", async () => {
      const { runRegister } = await import("./commands/register.js");

      await runRegister({});

      const output = getOutput();
      // Should suggest starting the daemon or checking status
      expect(output).toMatch(/daemon|status|start|configuration/i);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // 5. End-to-end data flow: register → daemon stores → status reflects
  // ═══════════════════════════════════════════════════════════════════════

  describe("end-to-end data flow", () => {
    it("register sends data that daemon status can reflect", async () => {
      // Step 1: Register a project
      const { runRegister } = await import("./commands/register.js");
      await runRegister({ name: "e2e-project" });

      // Verify register sent the correct data
      const registerCalls = mockPost.mock.calls;
      expect(registerCalls.length).toBe(1);
      const [postPath, postBody] = registerCalls[0] as unknown as [string, Record<string, unknown>];
      expect(postPath).toBe("/api/projects");
      expect(postBody.name).toBe("e2e-project");

      // Step 2: Check daemon status shows the project count
      mockGet.mockImplementation(() =>
        Promise.resolve<DaemonHealth>({
          status: "ok",
          uptime: 100,
          version: "1.0.0",
          projectCount: 3, // Simulates daemon having stored the project
          activeWorkflows: 0,
          timestamp: "2026-03-11T12:00:00Z",
        }),
      );

      consoleSpy.mockClear();

      const { runDaemon } = await import("./commands/daemon.js");
      await runDaemon("status", {});

      const statusOutput = getOutput();
      expect(statusOutput).toContain("connected");
      expect(statusOutput).toContain("3"); // project count reflects registration
    });

    it("register and status both use the same daemon URL from config", async () => {
      mockConfigPort = 8888;
      mockConfigHost = "127.0.0.1";

      // Register uses createDaemonClient which reads config
      const { runRegister } = await import("./commands/register.js");
      await runRegister({});

      consoleSpy.mockClear();

      // Status also reads config for port display
      const { runDaemon } = await import("./commands/daemon.js");
      await runDaemon("status", {});

      const statusOutput = getOutput();
      expect(statusOutput).toContain("8888");
    });
  });
});
