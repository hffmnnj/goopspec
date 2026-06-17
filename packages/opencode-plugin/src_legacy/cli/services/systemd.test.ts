import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";

import type { InstallOptions } from "./types.js";

type ExecResponse = {
  stdout?: string;
  stderr?: string;
  code?: number;
};

const skipOnNonLinux = process.platform !== "linux" ? test.skip : test;

describe("SystemdAdapter", () => {
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

  let SystemdAdapter: (new () => {
    install(options: InstallOptions): Promise<{ success: boolean; message: string }>;
    uninstall(): Promise<{ success: boolean; message: string }>;
    start(): Promise<{ success: boolean; message: string }>;
    stop(): Promise<{ success: boolean; message: string }>;
    status(): Promise<{ status: string; message?: string }>;
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
    mock.module("node:os", () => ({ ...realOs, homedir: () => "/home/tester" }));

    ({ SystemdAdapter } = await import("./systemd.js"));
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

  skipOnNonLinux("install writes unit file and enables service", async () => {
    execQueue.push({ code: 0 }, { code: 0 });
    const adapter = new SystemdAdapter!();

    const result = await adapter.install({
      bunPath: "/usr/local/bin/bun",
      daemonPath: "/opt/goopspec/daemon.ts",
      host: "127.0.0.1",
      port: 7331,
    });

    expect(result.success).toBe(true);
    expect(mkdirMock).toHaveBeenCalledWith("/home/tester/.config/systemd/user", { recursive: true });
    expect(writeFileMock).toHaveBeenCalledWith(
      "/home/tester/.config/systemd/user/goopspec-daemon.service",
      expect.stringContaining("ExecStart=/usr/local/bin/bun run /opt/goopspec/daemon.ts"),
      "utf8",
    );
    expect(writeFileMock).toHaveBeenCalledWith(
      "/home/tester/.config/systemd/user/goopspec-daemon.service",
      expect.stringContaining("Environment=GOOPSPEC_DAEMON_PORT=7331"),
      "utf8",
    );
    expect(execCommands).toEqual([
      "systemctl --user daemon-reload",
      "systemctl --user enable goopspec-daemon",
    ]);
  });

  skipOnNonLinux("start and stop run expected systemctl commands", async () => {
    execQueue.push({ code: 0 }, { code: 0 });
    const adapter = new SystemdAdapter!();

    const start = await adapter.start();
    const stop = await adapter.stop();

    expect(start.success).toBe(true);
    expect(stop.success).toBe(true);
    expect(execCommands).toEqual([
      "systemctl --user start goopspec-daemon",
      "systemctl --user stop goopspec-daemon",
    ]);
  });

  skipOnNonLinux("status parses active as running", async () => {
    execQueue.push({ code: 0, stdout: "active\n" });
    const adapter = new SystemdAdapter!();

    const status = await adapter.status();
    expect(status.status).toBe("running");
  });

  skipOnNonLinux("isInstalled checks service file existence", async () => {
    existsSyncMock.mockReturnValue(true);
    const adapter = new SystemdAdapter!();

    const installed = await adapter.isInstalled();
    expect(installed).toBe(true);
    expect(existsSyncMock).toHaveBeenCalledWith(
      "/home/tester/.config/systemd/user/goopspec-daemon.service",
    );
  });

  skipOnNonLinux("returns failure when a command fails", async () => {
    execQueue.push({ code: 1, stderr: "systemctl failed" });
    const adapter = new SystemdAdapter!();

    const result = await adapter.start();
    expect(result.success).toBe(false);
    expect(result.message).toContain("systemctl failed");
  });
});
