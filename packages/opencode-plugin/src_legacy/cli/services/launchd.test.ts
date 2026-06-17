import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";

import type { InstallOptions } from "./types.js";

type ExecResponse = {
  stdout?: string;
  stderr?: string;
  code?: number;
};

const skipOnNonMac = process.platform !== "darwin" ? test.skip : test;

describe("LaunchdAdapter", () => {
  const execQueue: ExecResponse[] = [];
  const execCommands: string[] = [];

  const execMock = mock((command: string, callback: (...args: unknown[]) => void) => {
    execCommands.push(command);
    const next = execQueue.shift() ?? { stdout: "", stderr: "", code: 0 };

    if ((next.code ?? 0) !== 0) {
      const error = Object.assign(new Error(next.stderr ?? "command failed"), {
        code: next.code,
        stdout: next.stdout ?? "",
        stderr: next.stderr ?? "",
      });
      callback(error, next.stdout ?? "", next.stderr ?? "");
      return {};
    }

    callback(null, next.stdout ?? "", next.stderr ?? "");
    return {};
  });

  const mkdirMock = mock(async () => undefined);
  const writeFileMock = mock(async () => undefined);
  const rmMock = mock(async () => undefined);
  const existsSyncMock = mock(() => true);

  let LaunchdAdapter: (new () => {
    install(options: InstallOptions): Promise<{ success: boolean; message: string }>;
    uninstall(): Promise<{ success: boolean; message: string }>;
    start(): Promise<{ success: boolean; message: string }>;
    stop(): Promise<{ success: boolean; message: string }>;
    status(): Promise<{ status: string; pid?: number; message?: string }>;
    isInstalled(): Promise<boolean>;
  }) | null = null;

  beforeAll(async () => {
    const realChildProcess = await import("node:child_process");
    const realFsPromises = await import("node:fs/promises");
    const realFs = await import("node:fs");
    const realOs = await import("node:os");

    mock.module("node:child_process", () => ({ ...realChildProcess, exec: execMock }));
    mock.module("node:fs/promises", () => ({
      ...realFsPromises,
      mkdir: mkdirMock,
      writeFile: writeFileMock,
      rm: rmMock,
    }));
    mock.module("node:fs", () => ({ ...realFs, existsSync: existsSyncMock }));
    mock.module("node:os", () => ({ ...realOs, homedir: () => "/Users/tester" }));

    ({ LaunchdAdapter } = await import("./launchd.js"));
  });

  afterAll(() => {
    mock.restore();
  });

  beforeEach(() => {
    execQueue.length = 0;
    execCommands.length = 0;
    execMock.mockClear();
    mkdirMock.mockClear();
    writeFileMock.mockClear();
    rmMock.mockClear();
    existsSyncMock.mockClear();
  });

  skipOnNonMac("install writes plist and loads launch agent", async () => {
    execQueue.push({ code: 0 });
    const adapter = new LaunchdAdapter!();

    const result = await adapter.install({
      bunPath: "/usr/local/bin/bun",
      daemonPath: "/Users/tester/dev/goopspec/packages/daemon/src/index.ts",
      host: "127.0.0.1",
      port: 7331,
    });

    expect(result.success).toBe(true);
    expect(writeFileMock).toHaveBeenCalledWith(
      "/Users/tester/Library/LaunchAgents/com.goopspec.daemon.plist",
      expect.stringContaining("<string>/usr/local/bin/bun</string>"),
      "utf8",
    );
    expect(writeFileMock).toHaveBeenCalledWith(
      "/Users/tester/Library/LaunchAgents/com.goopspec.daemon.plist",
      expect.stringContaining("<string>7331</string>"),
      "utf8",
    );
    expect(writeFileMock).toHaveBeenCalledWith(
      "/Users/tester/Library/LaunchAgents/com.goopspec.daemon.plist",
      expect.stringContaining("/Users/tester/.goopspec/daemon.log"),
      "utf8",
    );
    expect(execCommands).toEqual([
      "launchctl load -w /Users/tester/Library/LaunchAgents/com.goopspec.daemon.plist",
    ]);
  });

  skipOnNonMac("start and stop run expected launchctl commands", async () => {
    execQueue.push({ code: 0 }, { code: 0 });
    const adapter = new LaunchdAdapter!();

    const start = await adapter.start();
    const stop = await adapter.stop();

    expect(start.success).toBe(true);
    expect(stop.success).toBe(true);
    expect(execCommands).toEqual([
      "launchctl start com.goopspec.daemon",
      "launchctl stop com.goopspec.daemon",
    ]);
  });

  skipOnNonMac("status parses pid from launchctl list", async () => {
    execQueue.push({ code: 0, stdout: "123\t0\tcom.goopspec.daemon\n" });
    const adapter = new LaunchdAdapter!();

    const status = await adapter.status();
    expect(status.status).toBe("running");
    expect(status.pid).toBe(123);
  });

  skipOnNonMac("isInstalled checks plist file existence", async () => {
    existsSyncMock.mockReturnValue(true);
    const adapter = new LaunchdAdapter!();

    const installed = await adapter.isInstalled();
    expect(installed).toBe(true);
    expect(existsSyncMock).toHaveBeenCalledWith(
      "/Users/tester/Library/LaunchAgents/com.goopspec.daemon.plist",
    );
  });

  skipOnNonMac("returns failure when launchctl command fails", async () => {
    execQueue.push({ code: 1, stderr: "launchctl: service not found" });
    const adapter = new LaunchdAdapter!();

    const result = await adapter.start();
    expect(result.success).toBe(false);
    expect(result.message).toContain("service not found");
  });
});
