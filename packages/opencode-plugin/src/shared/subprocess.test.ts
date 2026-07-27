import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import { executeCommand } from "./subprocess.js";

// ============================================================================
// Bun.spawn mock helpers
// ============================================================================

/**
 * Create a mock spawn result that mimics what Bun.spawn returns.
 *
 * executeCommand reads stdout/stderr via `new Response(proc.stdout).text()` and
 * awaits `proc.exited` for the exit code.
 */
function createMockProc(opts: {
  stdout?: string;
  stderr?: string;
  exitCode?: number;
}) {
  const stdoutText = opts.stdout ?? "";
  const stderrText = opts.stderr ?? "";
  const exitCode = opts.exitCode ?? 0;

  return {
    stdout: new Response(stdoutText).body,
    stderr: new Response(stderrText).body,
    exited: Promise.resolve(exitCode),
    pid: 12345,
    kill: () => {},
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("executeCommand()", () => {
  let originalSpawn: typeof Bun.spawn;
  let spawnCalls: Array<{ args: unknown[]; opts: unknown }>;

  beforeEach(() => {
    originalSpawn = Bun.spawn;
    spawnCalls = [];

    (Bun as { spawn: typeof Bun.spawn }).spawn = ((...args: unknown[]) => {
      spawnCalls.push({ args: args[0] as unknown[], opts: args[1] });
      return createMockProc({ stdout: "", stderr: "", exitCode: 0 });
    }) as typeof Bun.spawn;
  });

  afterEach(() => {
    (Bun as { spawn: typeof Bun.spawn }).spawn = originalSpawn;
  });

  it("captures stdout and exit code 0 on success", async () => {
    (Bun as { spawn: typeof Bun.spawn }).spawn = ((...args: unknown[]) => {
      spawnCalls.push({ args: args[0] as unknown[], opts: args[1] });
      return createMockProc({
        stdout: "hello world\n",
        stderr: "",
        exitCode: 0,
      });
    }) as typeof Bun.spawn;

    const result = await executeCommand(["echo", "hello world"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("hello world\n");
    expect(result.stderr).toBe("");
  });

  it("captures stderr and non-zero exit code on failure", async () => {
    (Bun as { spawn: typeof Bun.spawn }).spawn = ((...args: unknown[]) => {
      spawnCalls.push({ args: args[0] as unknown[], opts: args[1] });
      return createMockProc({
        stdout: "",
        stderr: "unknown command\n",
        exitCode: 127,
      });
    }) as typeof Bun.spawn;

    const result = await executeCommand(["not-a-real-binary"]);

    expect(result.exitCode).toBe(127);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("unknown command\n");
  });

  it("passes the args array and cwd through to Bun.spawn", async () => {
    (Bun as { spawn: typeof Bun.spawn }).spawn = ((...args: unknown[]) => {
      spawnCalls.push({ args: args[0] as unknown[], opts: args[1] });
      return createMockProc({ stdout: "", stderr: "", exitCode: 0 });
    }) as typeof Bun.spawn;

    await executeCommand(["git", "status", "--short"], "/tmp/foo");

    expect(spawnCalls).toHaveLength(1);
    expect(spawnCalls[0]?.args).toEqual(["git", "status", "--short"]);
    expect(spawnCalls[0]?.opts).toEqual({
      cwd: "/tmp/foo",
      stdout: "pipe",
      stderr: "pipe",
    });
  });

  it("returns exitCode -1 and error text in stderr when Bun.spawn throws", async () => {
    (Bun as { spawn: typeof Bun.spawn }).spawn = (() => {
      throw new Error("ENOENT: not a real binary");
    }) as unknown as typeof Bun.spawn;

    const result = await executeCommand(["not-a-real-binary"]);

    expect(result.exitCode).toBe(-1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("ENOENT: not a real binary");
  });
});
