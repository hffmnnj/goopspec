import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";

import {
  DaemonUnavailableError,
} from "../features/daemon/client.js";

// ── Mocks ─────────────────────────────────────────────────────────────────

const mockGet = mock((_path?: string) => Promise.resolve({ status: "ok" }));
const mockGetBaseUrl = mock(() => "http://localhost:7331");

let daemonAvailable = true;

// Spread real module to preserve DaemonApiError and other exports (Bun mock.module gotcha)
const realDaemonClient = await import("../features/daemon/client.js");
mock.module("../features/daemon/client.js", () => ({
  ...realDaemonClient,
  DaemonClient: class MockDaemonClient {
    get = mockGet;
    getBaseUrl = mockGetBaseUrl;
    async isAvailable() {
      try {
        await this.get("/health");
        return true;
      } catch {
        return false;
      }
    }
    post = mockGet;
    put = mockGet;
    async delete() {}
  },
  createDaemonClient: mock(() => {
    if (!daemonAvailable) {
      throw new DaemonUnavailableError("Connection refused");
    }
    return Promise.resolve({
      get: mockGet,
      getBaseUrl: mockGetBaseUrl,
      async isAvailable() { return daemonAvailable; },
      post: mockGet,
      put: mockGet,
      async delete() {},
    });
  }),
}));

// Mock ui.ts — spread real module, override only what we track
const realUi = await import("./ui.js");
const mockShowError = mock((msg: string, suggestion?: string) => {
  // Mirror real showError behavior so downstream tests see output in console.log
  console.log(`  ✗ Error: ${msg}`);
  if (suggestion) {
    console.log(`  → Try: ${suggestion}`);
  }
});
const mockShowBanner = mock(() => {});

mock.module("./ui.js", () => ({
  ...realUi,
  showBanner: mockShowBanner,
  showError: mockShowError,
}));

// ── Helpers ───────────────────────────────────────────────────────────────

let consoleSpy: ReturnType<typeof spyOn>;

// ── Tests ─────────────────────────────────────────────────────────────────

describe("command-utils", () => {
  beforeEach(() => {
    daemonAvailable = true;
    mockShowError.mockClear();
    mockShowBanner.mockClear();
    mockGet.mockClear();
    consoleSpy = spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  // ── withDaemon ────────────────────────────────────────────────────────

  describe("withDaemon", () => {
    it("calls fn with client when daemon is available", async () => {
      const { withDaemon } = await import("./command-utils.js");

      let clientReceived = false;
      const result = await withDaemon(async (client) => {
        clientReceived = true;
        const health = await client.get<{ status: string }>("/health");
        return health;
      });

      expect(clientReceived).toBe(true);
      expect(result).toEqual({ status: "ok" });
    });

    it("returns the value from fn", async () => {
      const { withDaemon } = await import("./command-utils.js");

      const result = await withDaemon(async () => 42);

      expect(result).toBe(42);
    });

    it("shows error and returns undefined when daemon is unavailable", async () => {
      daemonAvailable = false;

      const { withDaemon } = await import("./command-utils.js");

      let fnCalled = false;
      const result = await withDaemon(async () => {
        fnCalled = true;
        return "should not be called";
      });

      expect(result).toBeUndefined();
      expect(fnCalled).toBe(false);
      expect(mockShowError).toHaveBeenCalledTimes(1);
      expect(mockShowError.mock.calls[0]?.[0]).toContain("daemon client");
    });

    it("propagates errors thrown inside fn", async () => {
      const { withDaemon } = await import("./command-utils.js");

      await expect(
        withDaemon(async () => {
          throw new Error("fn exploded");
        }),
      ).rejects.toThrow("fn exploded");
    });
  });

  // ── withBanner ────────────────────────────────────────────────────────

  describe("withBanner", () => {
    it("shows banner and runs fn", async () => {
      const { withBanner } = await import("./command-utils.js");

      const fn = mock(async () => {});
      await withBanner(fn);

      expect(mockShowBanner).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("catches errors from fn and calls handleCommandError", async () => {
      const { withBanner } = await import("./command-utils.js");

      const fn = mock(async () => {
        throw new Error("command failed");
      });

      // Should not throw
      await withBanner(fn);

      expect(mockShowError).toHaveBeenCalledTimes(1);
      expect(mockShowError.mock.calls[0]?.[0]).toContain("command failed");
    });

    it("handles non-Error thrown values", async () => {
      const { withBanner } = await import("./command-utils.js");

      const fn = mock(async () => {
        throw "string error";
      });

      await withBanner(fn);

      expect(mockShowError).toHaveBeenCalledTimes(1);
      expect(mockShowError.mock.calls[0]?.[0]).toContain("unexpected error");
    });
  });

  // ── handleCommandError ────────────────────────────────────────────────

  describe("handleCommandError", () => {
    it("extracts message from Error instances", async () => {
      const { handleCommandError } = await import("./command-utils.js");

      handleCommandError(new Error("something broke"));

      expect(mockShowError).toHaveBeenCalledTimes(1);
      expect(mockShowError.mock.calls[0]?.[0]).toBe("something broke");
    });

    it("uses generic message for string errors", async () => {
      const { handleCommandError } = await import("./command-utils.js");

      handleCommandError("string error");

      expect(mockShowError).toHaveBeenCalledTimes(1);
      expect(mockShowError.mock.calls[0]?.[0]).toBe("An unexpected error occurred");
    });

    it("uses generic message for null/undefined", async () => {
      const { handleCommandError } = await import("./command-utils.js");

      handleCommandError(null);

      expect(mockShowError).toHaveBeenCalledTimes(1);
      expect(mockShowError.mock.calls[0]?.[0]).toBe("An unexpected error occurred");
    });

    it("does not call process.exit", async () => {
      const exitSpy = spyOn(process, "exit").mockImplementation(() => undefined as never);

      const { handleCommandError } = await import("./command-utils.js");

      handleCommandError(new Error("test"));

      expect(exitSpy).not.toHaveBeenCalled();
      exitSpy.mockRestore();
    });
  });

  // ── formatUptime ──────────────────────────────────────────────────────

  describe("formatUptime", () => {
    it("formats 0 seconds", async () => {
      const { formatUptime } = await import("./command-utils.js");
      expect(formatUptime(0)).toBe("0s");
    });

    it("formats seconds only (< 60s)", async () => {
      const { formatUptime } = await import("./command-utils.js");
      expect(formatUptime(30)).toBe("30s");
    });

    it("formats minutes and seconds", async () => {
      const { formatUptime } = await import("./command-utils.js");
      expect(formatUptime(90)).toBe("1m 30s");
    });

    it("formats exactly one hour", async () => {
      const { formatUptime } = await import("./command-utils.js");
      expect(formatUptime(3600)).toBe("1h 0m");
    });

    it("formats hours and minutes", async () => {
      const { formatUptime } = await import("./command-utils.js");
      expect(formatUptime(7261)).toBe("2h 1m");
    });

    it("formats days, hours, and minutes", async () => {
      const { formatUptime } = await import("./command-utils.js");
      expect(formatUptime(90000)).toBe("1d 1h 0m");
    });

    it("formats exactly one day", async () => {
      const { formatUptime } = await import("./command-utils.js");
      expect(formatUptime(86400)).toBe("1d 0h 0m");
    });

    it("handles fractional seconds by flooring", async () => {
      const { formatUptime } = await import("./command-utils.js");
      expect(formatUptime(59.9)).toBe("59s");
    });
  });
});
