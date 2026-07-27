import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import { chmodSync } from "node:fs";

import {
  createMockPluginContext,
  createMockToolContext,
  setupTestEnvironment,
} from "../../test-utils.js";
import type { PluginContext } from "../../test-utils.js";
import { createAstGrepTool } from "./index.js";

// ============================================================================
// Bun.spawn mock helpers
// ============================================================================

/**
 * Create a mock spawn result that mimics what Bun.spawn returns.
 *
 * The shared subprocess helper reads stdout/stderr via `new Response(proc.stdout).text()`
 * and awaits `proc.exited` for the exit code.
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
// Fixtures
// ============================================================================

const SINGLE_MATCH = JSON.stringify([
  {
    text: "console.log",
    range: {
      byteOffset: { start: 12, end: 23 },
      start: { line: 4, column: 2 },
      end: { line: 4, column: 13 },
    },
    file: "src/index.ts",
    lines: "  console.log('hello');",
    language: "ts",
  },
]);

const REWRITE_PREVIEW = JSON.stringify([
  {
    text: "foo",
    replacement: "bar",
    range: {
      byteOffset: { start: 0, end: 3 },
      start: { line: 0, column: 0 },
      end: { line: 0, column: 3 },
    },
    file: "src/index.ts",
    lines: "foo()",
    language: "ts",
  },
]);

const MULTIPLE_MATCHES = JSON.stringify([
  {
    text: "a",
    range: {
      byteOffset: { start: 0, end: 1 },
      start: { line: 0, column: 0 },
      end: { line: 0, column: 1 },
    },
    file: "one.ts",
    lines: "a",
    language: "ts",
  },
  {
    text: "b",
    range: {
      byteOffset: { start: 0, end: 1 },
      start: { line: 0, column: 0 },
      end: { line: 0, column: 1 },
    },
    file: "two.ts",
    lines: "b",
    language: "ts",
  },
]);

// ============================================================================
// Tests
// ============================================================================

describe("createAstGrepTool", () => {
  let ctx: PluginContext;
  let cleanup: () => void;
  let originalSpawn: typeof Bun.spawn;
  let spawnCalls: Array<{ args: unknown[]; opts: unknown }>;

  beforeEach(() => {
    const env = setupTestEnvironment("ast-grep");
    cleanup = env.cleanup;

    // Provide a configured binary path so resolveBinary takes the config branch
    // and never runs a real `command -v` lookup.
    const binaryPath = `${env.testDir}/.goopspec/ast-grep`;
    Bun.write(binaryPath, "#!/bin/sh\n"); // content does not matter; only exec-bit
    chmodSync(binaryPath, 0o755);

    ctx = createMockPluginContext({
      testDir: env.testDir,
      db: env.db,
    });

    // Inject a goopspec.json with binaryPaths so loadMergedConfig finds it.
    const configPath = `${env.testDir}/goopspec.json`;
    Bun.write(configPath, JSON.stringify({ binaryPaths: { "ast-grep": binaryPath } }));

    // Save original and install mock
    originalSpawn = Bun.spawn;
    spawnCalls = [];

    (Bun as { spawn: typeof Bun.spawn }).spawn = ((...args: unknown[]) => {
      spawnCalls.push({ args: args[0] as unknown[], opts: args[1] });
      return createMockProc({ stdout: SINGLE_MATCH, exitCode: 0 });
    }) as typeof Bun.spawn;
  });

  afterEach(() => {
    // Restore original
    (Bun as { spawn: typeof Bun.spawn }).spawn = originalSpawn;
    cleanup();
  });

  // -----------------------------------------------------------------------
  // Search mode
  // -----------------------------------------------------------------------

  describe("search mode", () => {
    it("returns formatted matches on exit 0", async () => {
      const tool = createAstGrepTool(ctx);
      const result = await tool.execute(
        {
          pattern: "console.log($$$)",
          language: "ts",
          paths: ["src"],
        },
        createMockToolContext(),
      );

      expect(result).toContain("Found 1 match");
      expect(result).toContain("src/index.ts");
      expect(result).toContain("console.log");
      expect(result).toContain("4:2 -> 4:13");
      expect(result).toContain("console.log('hello');");
    });

    it("returns clean no-matches message on exit 1 with empty stdout", async () => {
      (Bun as { spawn: typeof Bun.spawn }).spawn = ((...args: unknown[]) => {
        spawnCalls.push({ args: args[0] as unknown[], opts: args[1] });
        return createMockProc({ stdout: "", exitCode: 1 });
      }) as typeof Bun.spawn;

      const tool = createAstGrepTool(ctx);
      const result = await tool.execute(
        {
          pattern: "doesNotExist",
          language: "ts",
        },
        createMockToolContext(),
      );

      expect(result).toBe("No matches found.");
    });

    it("still formats matches on exit 1 when stdout contains JSON", async () => {
      (Bun as { spawn: typeof Bun.spawn }).spawn = ((...args: unknown[]) => {
        spawnCalls.push({ args: args[0] as unknown[], opts: args[1] });
        return createMockProc({ stdout: SINGLE_MATCH, exitCode: 1 });
      }) as typeof Bun.spawn;

      const tool = createAstGrepTool(ctx);
      const result = await tool.execute(
        {
          pattern: "console.log($$$)",
          language: "ts",
        },
        createMockToolContext(),
      );

      expect(result).toContain("Found 1 match");
    });
  });

  // -----------------------------------------------------------------------
  // Rewrite mode
  // -----------------------------------------------------------------------

  describe("rewrite mode", () => {
    it("dry-run includes -r but not -U and reports no files modified", async () => {
      (Bun as { spawn: typeof Bun.spawn }).spawn = ((...args: unknown[]) => {
        spawnCalls.push({ args: args[0] as unknown[], opts: args[1] });
        return createMockProc({ stdout: REWRITE_PREVIEW, exitCode: 0 });
      }) as typeof Bun.spawn;

      const tool = createAstGrepTool(ctx);
      const result = await tool.execute(
        {
          pattern: "foo",
          language: "ts",
          rewrite: "bar",
        },
        createMockToolContext(),
      );

      const args = spawnCalls[0]?.args as string[];
      expect(args).toContain("-r");
      const rIdx = args.indexOf("-r");
      expect(args[rIdx + 1]).toBe("bar");
      expect(args).not.toContain("-U");

      expect(result).toContain("bar");
      expect(result).toContain("No files were modified (dry-run)");
      expect(result).toContain("apply: true");
    });

    it("apply includes both -r and -U and reports files modified", async () => {
      (Bun as { spawn: typeof Bun.spawn }).spawn = ((...args: unknown[]) => {
        spawnCalls.push({ args: args[0] as unknown[], opts: args[1] });
        return createMockProc({ stdout: REWRITE_PREVIEW, exitCode: 0 });
      }) as typeof Bun.spawn;

      const tool = createAstGrepTool(ctx);
      const result = await tool.execute(
        {
          pattern: "foo",
          language: "ts",
          rewrite: "bar",
          apply: true,
        },
        createMockToolContext(),
      );

      const args = spawnCalls[0]?.args as string[];
      expect(args).toContain("-r");
      expect(args).toContain("-U");
      const rIdx = args.indexOf("-r");
      expect(args[rIdx + 1]).toBe("bar");

      expect(result).toContain("bar");
      expect(result).toContain("Rewrite applied. Modified 1 file.");
    });
  });

  // -----------------------------------------------------------------------
  // Missing binary
  // -----------------------------------------------------------------------

  describe("missing binary", () => {
    it("returns install hint when binary cannot be resolved and does NOT throw", async () => {
      // Remove the configured binary so resolveBinary falls through to PATH lookup.
      const testDir = ctx.sdk.directory;
      const binaryPath = `${testDir}/.goopspec/ast-grep`;
      Bun.write(binaryPath, "");
      chmodSync(binaryPath, 0o644);

      // The resolver will try `command -v ast-grep`; mock that to fail.
      (Bun as { spawn: typeof Bun.spawn }).spawn = ((...args: unknown[]) => {
        const cmdArgs = args[0] as string[];
        if (cmdArgs.includes("sh") && cmdArgs.some((a) => a.includes("command -v"))) {
          return createMockProc({ stdout: "", stderr: "not found", exitCode: 1 });
        }
        spawnCalls.push({ args: cmdArgs, opts: args[1] });
        return createMockProc({ stdout: SINGLE_MATCH, exitCode: 0 });
      }) as typeof Bun.spawn;

      const tool = createAstGrepTool(ctx);
      const result = await tool.execute(
        {
          pattern: "foo",
          language: "ts",
        },
        createMockToolContext(),
      );

      expect(result).toContain("Could not find the 'ast-grep' binary");
      expect(result).toContain("npm i -g @ast-grep/cli");
      expect(result).toContain("binaryPaths.ast-grep");
      expect(spawnCalls).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // Injection safety
  // -----------------------------------------------------------------------

  describe("injection safety", () => {
    it("passes pattern as a discrete args element, never a shell string", async () => {
      const tool = createAstGrepTool(ctx);
      await tool.execute(
        {
          pattern: "console.log($$$);",
          language: "ts",
        },
        createMockToolContext(),
      );

      const args = spawnCalls[0]?.args as string[];
      expect(args[0]).toContain("ast-grep"); // configured binary path
      expect(args).toContain("run");
      expect(args).toContain("-p");

      const pIdx = args.indexOf("-p");
      expect(args[pIdx + 1]).toBe("console.log($$$);");

      // The entire args array must be strings; no shell concatenation.
      for (const arg of args) {
        expect(typeof arg).toBe("string");
      }
    });
  });

  // -----------------------------------------------------------------------
  // Multi-file match counts
  // -----------------------------------------------------------------------

  describe("multi-file output", () => {
    it("counts matches across multiple files", async () => {
      (Bun as { spawn: typeof Bun.spawn }).spawn = ((...args: unknown[]) => {
        spawnCalls.push({ args: args[0] as unknown[], opts: args[1] });
        return createMockProc({ stdout: MULTIPLE_MATCHES, exitCode: 0 });
      }) as typeof Bun.spawn;

      const tool = createAstGrepTool(ctx);
      const result = await tool.execute(
        {
          pattern: ".",
          language: "ts",
        },
        createMockToolContext(),
      );

      expect(result).toContain("Found 2 matches");
      expect(result).toContain("one.ts");
      expect(result).toContain("two.ts");
    });
  });
});
