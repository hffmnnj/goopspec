import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { setupTestEnvironment } from "../test-utils.js";
import { resolveBinary } from "./binary-resolver.js";

// ============================================================================
// Bun.spawn mock helpers
// ============================================================================

/**
 * Create a mock spawn result that mimics what Bun.spawn returns.
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

describe("resolveBinary()", () => {
  let originalSpawn: typeof Bun.spawn;
  let spawnCalls: Array<{ args: unknown[]; opts: unknown }>;
  let testDir: string;
  let cleanup: () => void;

  beforeEach(() => {
    const env = setupTestEnvironment("binary-resolver");
    testDir = env.testDir;
    cleanup = env.cleanup;

    originalSpawn = Bun.spawn;
    spawnCalls = [];

    (Bun as { spawn: typeof Bun.spawn }).spawn = ((...args: unknown[]) => {
      spawnCalls.push({ args: args[0] as unknown[], opts: args[1] });
      // Default: command -v fails, so resolution falls through to PATH scan.
      return createMockProc({ stdout: "", stderr: "", exitCode: 1 });
    }) as typeof Bun.spawn;
  });

  afterEach(() => {
    (Bun as { spawn: typeof Bun.spawn }).spawn = originalSpawn;
    cleanup();
  });

  it("returns source 'config' when configuredPath is an executable regular file", async () => {
    const binDir = join(testDir, "bin");
    mkdirSync(binDir, { recursive: true });
    const configuredPath = join(binDir, "ast-grep");
    writeFileSync(configuredPath, "#!/bin/sh\necho ok\n", { mode: 0o755 });

    const result = await resolveBinary("ast-grep", {
      projectDir: testDir,
      configuredPath,
    });

    expect(result).toEqual({
      key: "ast-grep",
      path: configuredPath,
      source: "config",
    });
    expect(spawnCalls).toHaveLength(0);
  });

  it("falls through to PATH lookup and returns source 'path' via command -v", async () => {
    const pathDir = join(testDir, "path-bin");
    mkdirSync(pathDir, { recursive: true });
    const foundPath = join(pathDir, "ast-grep");
    writeFileSync(foundPath, "#!/bin/sh\necho ok\n", { mode: 0o755 });

    (Bun as { spawn: typeof Bun.spawn }).spawn = ((...args: unknown[]) => {
      spawnCalls.push({ args: args[0] as unknown[], opts: args[1] });
      const shellCommand = (args[0] as string[])[2];
      if (shellCommand?.includes("command -v")) {
        return createMockProc({ stdout: `${foundPath}\n`, exitCode: 0 });
      }
      return createMockProc({ stdout: "", stderr: "", exitCode: 1 });
    }) as typeof Bun.spawn;

    const result = await resolveBinary("ast-grep", { projectDir: testDir });

    expect(result).toEqual({
      key: "ast-grep",
      path: foundPath,
      source: "path",
    });
  });

  it("falls through to PATH scan and returns source 'path' when command -v fails", async () => {
    const pathDir = join(testDir, "path-bin");
    mkdirSync(pathDir, { recursive: true });
    const foundPath = join(pathDir, "difft");
    writeFileSync(foundPath, "#!/bin/sh\necho ok\n", { mode: 0o755 });

    // Prepend the temp directory to PATH so the scan finds the binary.
    const originalPath = process.env.PATH;
    process.env.PATH = `${pathDir}${originalPath ? `:${originalPath}` : ""}`;

    try {
      const result = await resolveBinary("difft", { projectDir: testDir });

      expect(result).toEqual({
        key: "difft",
        path: foundPath,
        source: "path",
      });
    } finally {
      process.env.PATH = originalPath;
    }
  });

  it("returns { found: false } when the binary is not found anywhere", async () => {
    const result = await resolveBinary("not-installed-tool", {
      projectDir: testDir,
    });

    expect(result).toEqual({ key: "not-installed-tool", found: false });
  });

  it("falls through when configuredPath points to a non-executable file", async () => {
    const binDir = join(testDir, "bin");
    mkdirSync(binDir, { recursive: true });
    const configuredPath = join(binDir, "ast-grep");
    writeFileSync(configuredPath, "not executable\n");
    chmodSync(configuredPath, 0o644);

    const result = await resolveBinary("ast-grep", {
      projectDir: testDir,
      configuredPath,
    });

    expect(result).toEqual({ key: "ast-grep", found: false });
  });
});
