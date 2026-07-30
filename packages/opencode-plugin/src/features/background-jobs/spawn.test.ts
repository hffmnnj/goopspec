import { afterEach, describe, expect, it } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createBackgroundJobRegistry } from "./registry.js";
import { spawnBackgroundJob } from "./spawn.js";

describe("spawnBackgroundJob", () => {
  let originalSpawn: typeof Bun.spawn | undefined;
  let originalConsoleError: typeof console.error | undefined;
  let tempDir: string | undefined;

  afterEach(() => {
    if (originalSpawn) {
      (Bun as { spawn: typeof Bun.spawn }).spawn = originalSpawn;
      originalSpawn = undefined;
    }
    if (originalConsoleError) {
      console.error = originalConsoleError;
      originalConsoleError = undefined;
    }
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  it("starts detached with ignored stdin and records the eventual exit", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "background-job-spawn-"));
    originalSpawn = Bun.spawn;
    const spawnCalls: Array<{ command: unknown; options: unknown }> = [];
    const proc = { pid: 1234, exited: Promise.resolve(23) } as Bun.Subprocess;
    (Bun as { spawn: typeof Bun.spawn }).spawn = ((command: unknown, options: unknown) => {
      spawnCalls.push({ command, options });
      return proc;
    }) as typeof Bun.spawn;

    const registry = createBackgroundJobRegistry();
    const job = spawnBackgroundJob(registry, {
      id: "job_abcdef",
      command: "exit 23",
      cwd: tempDir,
      projectDir: tempDir,
      deadline: Date.now() + 1_000,
    });
    await proc.exited;
    await Promise.resolve();

    expect(spawnCalls).toHaveLength(1);
    expect(spawnCalls[0]).toEqual({
      command: ["sh", "-c", "exit 23"],
      options: expect.objectContaining({ detached: true, stdin: "ignore", cwd: tempDir }),
    });
    expect(registry.get(job.id)).toMatchObject({ state: "exited", exitCode: 23 });
    expect(readFileSync(join(job.logDir, "exit.code"), "utf8")).toBe("23");
  });

  it("keeps registry state when writing the exit sentinel fails", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "background-job-spawn-"));
    originalSpawn = Bun.spawn;
    originalConsoleError = console.error;
    const errors: unknown[][] = [];
    let resolveExit: (exitCode: number) => void;
    const exited = new Promise<number>((resolve) => {
      resolveExit = resolve;
    });
    const proc = { pid: 1234, exited } as Bun.Subprocess;
    console.error = ((...args: unknown[]) => {
      errors.push(args);
    }) as typeof console.error;
    (Bun as { spawn: typeof Bun.spawn }).spawn = (() => proc) as typeof Bun.spawn;

    const registry = createBackgroundJobRegistry();
    const job = spawnBackgroundJob(registry, {
      id: "job_abcdef",
      command: "exit 23",
      cwd: tempDir,
      projectDir: tempDir,
      deadline: Date.now() + 1_000,
    });
    rmSync(job.logDir, { recursive: true, force: true });
    resolveExit!(23);
    await exited;
    await Promise.resolve();
    await Promise.resolve();

    expect(registry.get(job.id)).toMatchObject({ state: "exited", exitCode: 23 });
    expect(errors[0]?.[0]).toContain("Failed to write background job exit code");
  });

  it("writes logs and preserves the detached process group for a real command", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "background-job-spawn-"));
    const hostPgid = Number(
      Bun.spawnSync(["sh", "-c", "ps -o pgid= -p $PPID"], { stdout: "pipe" })
        .stdout.toString()
        .trim(),
    );
    const registry = createBackgroundJobRegistry();
    const job = spawnBackgroundJob(registry, {
      id: "job_fedcba",
      command: "ps -o pgid= -p $$; printf done; exit 7",
      cwd: tempDir,
      projectDir: tempDir,
      deadline: Date.now() + 1_000,
    });

    await job.proc?.exited;
    await Promise.resolve();

    const stdout = readFileSync(join(job.logDir, "stdout.log"), "utf8");
    expect(existsSync(join(job.logDir, "stderr.log"))).toBe(true);
    expect(stdout).toContain("done");
    expect(Number(stdout.split("\n")[0].trim())).toBe(job.pgid);
    expect(job.pgid).not.toBe(hostPgid);
    expect(readFileSync(join(job.logDir, "exit.code"), "utf8")).toBe("7");
  });
});
