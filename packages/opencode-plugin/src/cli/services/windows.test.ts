import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";

import type { InstallOptions } from "./types.js";

type ExecResponse = {
  stdout?: string;
  stderr?: string;
  code?: number;
};

const skipOnNonWindows = process.platform !== "win32" ? test.skip : test;

describe("WindowsAdapter", () => {
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

  let WindowsAdapter: (new () => {
    install(options: InstallOptions): Promise<{ success: boolean; message: string }>;
    uninstall(): Promise<{ success: boolean; message: string }>;
    start(): Promise<{ success: boolean; message: string }>;
    stop(): Promise<{ success: boolean; message: string }>;
    status(): Promise<{ status: string; message?: string }>;
    isInstalled(): Promise<boolean>;
  }) | null = null;

  beforeAll(async () => {
    const realChildProcess = await import("node:child_process");
    mock.module("node:child_process", () => ({ ...realChildProcess, exec: execMock }));
    ({ WindowsAdapter } = await import("./windows.js"));
  });

  afterAll(() => {
    mock.restore();
  });

  beforeEach(() => {
    execQueue.length = 0;
    execCommands.length = 0;
    execMock.mockClear();
  });

  skipOnNonWindows("install creates scheduled task with expected command", async () => {
    execQueue.push({ code: 0 });
    const adapter = new WindowsAdapter!();

    const result = await adapter.install({
      bunPath: "C:/Program Files/Bun/bin/bun.exe",
      daemonPath: "C:/Users/tester/goopspec/packages/daemon/src/index.ts",
      host: "127.0.0.1",
      port: 7331,
    });

    expect(result.success).toBe(true);
    expect(execCommands).toEqual([
      'schtasks /Create /TN "GoopSpec Daemon" /TR "C:/Program Files/Bun/bin/bun.exe run C:/Users/tester/goopspec/packages/daemon/src/index.ts" /SC ONLOGON /RU "" /F',
    ]);
  });

  skipOnNonWindows("start and stop invoke schtasks run/end", async () => {
    execQueue.push({ code: 0 }, { code: 0 });
    const adapter = new WindowsAdapter!();

    const start = await adapter.start();
    const stop = await adapter.stop();

    expect(start.success).toBe(true);
    expect(stop.success).toBe(true);
    expect(execCommands).toEqual([
      'schtasks /Run /TN "GoopSpec Daemon"',
      'schtasks /End /TN "GoopSpec Daemon"',
    ]);
  });

  skipOnNonWindows("status parses running from schtasks query output", async () => {
    execQueue.push({ code: 0, stdout: "TaskName: \\GoopSpec Daemon\nStatus: Running\n" });
    const adapter = new WindowsAdapter!();

    const status = await adapter.status();
    expect(status.status).toBe("running");
  });

  skipOnNonWindows("isInstalled returns true when query succeeds", async () => {
    execQueue.push({ code: 0, stdout: "TaskName: \\GoopSpec Daemon\n" });
    const adapter = new WindowsAdapter!();

    const installed = await adapter.isInstalled();
    expect(installed).toBe(true);
    expect(execCommands).toEqual(['schtasks /Query /TN "GoopSpec Daemon"']);
  });

  skipOnNonWindows("returns failure when schtasks command fails", async () => {
    execQueue.push({ code: 1, stderr: "ERROR: Access is denied." });
    const adapter = new WindowsAdapter!();

    const result = await adapter.start();
    expect(result.success).toBe(false);
    expect(result.message).toContain("Access is denied");
  });
});
