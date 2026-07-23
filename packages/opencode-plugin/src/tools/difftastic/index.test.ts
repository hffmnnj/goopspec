import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { chmodSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  createMockPluginContext,
  createMockToolContext,
  setupTestEnvironment,
} from "../../test-utils.js";
import type { PluginContext } from "../../test-utils.js";
import { createDifftasticTool } from "./index.js";

// ============================================================================
// Bun.spawn mock helpers
// ============================================================================

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

function createDifftasticJSON(
  overrides: {
    status?: string;
    chunks?: Array<Array<{ lhs?: unknown; rhs?: unknown }>>;
  } = {},
) {
  return JSON.stringify({
    language: "typescript",
    path: "example.ts",
    status: overrides.status ?? "changed",
    chunks: overrides.chunks ?? [
      [
        {
          lhs: {
            line_number: 1,
            changes: [{ start: 0, end: 4, content: "old", highlight: "normal" }],
          },
          rhs: {
            line_number: 1,
            changes: [{ start: 0, end: 4, content: "new", highlight: "normal" }],
          },
        },
      ],
    ],
  });
}

// ============================================================================
// Tests
// ============================================================================

describe("createDifftasticTool", () => {
  let ctx: PluginContext;
  let cleanup: () => void;
  let originalSpawn: typeof Bun.spawn;
  let spawnCalls: Array<{ args: unknown[]; opts: unknown }>;

  beforeEach(() => {
    const env = setupTestEnvironment("difftastic");
    cleanup = env.cleanup;

    const binaryPath = join(env.testDir, "difft");
    writeFileSync(binaryPath, "#!/bin/sh\necho mock");
    chmodSync(binaryPath, 0o755);

    const goopspecJsonPath = join(env.testDir, "goopspec.json");
    writeFileSync(
      goopspecJsonPath,
      JSON.stringify({ binaryPaths: { difft: binaryPath } }),
      "utf-8",
    );

    ctx = createMockPluginContext({
      testDir: env.testDir,
      db: env.db,
    });

    originalSpawn = Bun.spawn;
    spawnCalls = [];

    (Bun as { spawn: typeof Bun.spawn }).spawn = ((...args: unknown[]) => {
      spawnCalls.push({ args: args[0] as unknown[], opts: args[1] });
      return createMockProc({ stdout: "", exitCode: 0 });
    }) as typeof Bun.spawn;
  });

  afterEach(() => {
    (Bun as { spawn: typeof Bun.spawn }).spawn = originalSpawn;
    cleanup();
  });

  it("exit 0 reports meaningfully_changed:false", async () => {
    (Bun as { spawn: typeof Bun.spawn }).spawn = ((...args: unknown[]) => {
      spawnCalls.push({ args: args[0] as unknown[], opts: args[1] });
      return createMockProc({ stdout: "", exitCode: 0 });
    }) as typeof Bun.spawn;

    const tool = createDifftasticTool(ctx);
    const result = await tool.execute(
      { oldPath: "old.ts", newPath: "new.ts" },
      createMockToolContext(),
    );

    expect(result).toContain("meaningfully_changed: false");
  });

  it("exit 1 reports meaningfully_changed:true and full diff summary", async () => {
    (Bun as { spawn: typeof Bun.spawn }).spawn = ((...args: unknown[]) => {
      spawnCalls.push({ args: args[0] as unknown[], opts: args[1] });
      return createMockProc({
        stdout: createDifftasticJSON(),
        exitCode: 1,
      });
    }) as typeof Bun.spawn;

    const tool = createDifftasticTool(ctx);
    const result = await tool.execute(
      { oldPath: "old.ts", newPath: "new.ts" },
      createMockToolContext(),
    );

    expect(result).toContain("meaningfully_changed: true");
    expect(result).toContain("Language: typescript");
    expect(result).toContain("Status: changed");
    expect(result).toContain("old");
    expect(result).toContain("new");
  });

  it("exit 2 is treated as an error", async () => {
    (Bun as { spawn: typeof Bun.spawn }).spawn = ((...args: unknown[]) => {
      spawnCalls.push({ args: args[0] as unknown[], opts: args[1] });
      return createMockProc({
        stdout: "",
        stderr: "invalid usage",
        exitCode: 2,
      });
    }) as typeof Bun.spawn;

    const tool = createDifftasticTool(ctx);
    const result = await tool.execute(
      { oldPath: "old.ts", newPath: "new.ts" },
      createMockToolContext(),
    );

    expect(result).toContain("difftastic failed (exit 2)");
    expect(result).toContain("invalid usage");
    expect(result).not.toContain("meaningfully_changed: true");
    expect(result).not.toContain("meaningfully_changed: false");
  });

  it("checkOnly true uses fast path with --check-only and --exit-code", async () => {
    (Bun as { spawn: typeof Bun.spawn }).spawn = ((...args: unknown[]) => {
      spawnCalls.push({ args: args[0] as unknown[], opts: args[1] });
      return createMockProc({ stdout: "", exitCode: 1 });
    }) as typeof Bun.spawn;

    const tool = createDifftasticTool(ctx);
    const result = await tool.execute(
      { oldPath: "old.ts", newPath: "new.ts", checkOnly: true },
      createMockToolContext(),
    );

    expect(spawnCalls).toHaveLength(1);
    const args = spawnCalls[0]?.args as string[];
    expect(args).toContain("--check-only");
    expect(args).toContain("--exit-code");
    expect(args).not.toContain("--display");
    expect(args).not.toContain("json");

    expect(result).toContain("meaningfully_changed: true");
    expect(result).toContain("Structural/syntactic changes detected.");
  });

  it("missing binary returns install hint without spawning", async () => {
    (Bun as { spawn: typeof Bun.spawn }).spawn = ((...args: unknown[]) => {
      spawnCalls.push({ args: args[0] as unknown[], opts: args[1] });
      return createMockProc({
        stdout: "",
        stderr: "command not found",
        exitCode: 127,
      });
    }) as typeof Bun.spawn;

    const emptyCtx = createMockPluginContext({
      testDir: `${ctx.sdk.directory}-missing`,
      db: ctx.db,
    });

    const tool = createDifftasticTool(emptyCtx);
    const result = await tool.execute(
      { oldPath: "old.ts", newPath: "new.ts" },
      createMockToolContext(),
    );

    expect(result).toContain("Could not find the 'difft' binary");
    expect(result).toContain("brew install difftastic");
    expect(spawnCalls).toHaveLength(1);
  });

  it("passes oldPath and newPath as discrete args array elements", async () => {
    (Bun as { spawn: typeof Bun.spawn }).spawn = ((...args: unknown[]) => {
      spawnCalls.push({ args: args[0] as unknown[], opts: args[1] });
      return createMockProc({ stdout: "", exitCode: 0 });
    }) as typeof Bun.spawn;

    const tool = createDifftasticTool(ctx);
    await tool.execute({ oldPath: "src/old.ts", newPath: "src/new.ts" }, createMockToolContext());

    const args = spawnCalls[0]?.args as string[];
    expect(args[args.length - 2]).toBe("src/old.ts");
    expect(args[args.length - 1]).toBe("src/new.ts");
    expect(args).toHaveLength(6);
  });

  it("aliases old/new to oldPath/newPath", async () => {
    (Bun as { spawn: typeof Bun.spawn }).spawn = ((...args: unknown[]) => {
      spawnCalls.push({ args: args[0] as unknown[], opts: args[1] });
      return createMockProc({ stdout: "", exitCode: 0 });
    }) as typeof Bun.spawn;

    const tool = createDifftasticTool(ctx);
    await tool.execute({ old: "a.ts", new: "b.ts" }, createMockToolContext());

    const args = spawnCalls[0]?.args as string[];
    expect(args).toContain("a.ts");
    expect(args).toContain("b.ts");
  });

  it("handles non-JSON stdout gracefully", async () => {
    (Bun as { spawn: typeof Bun.spawn }).spawn = ((...args: unknown[]) => {
      spawnCalls.push({ args: args[0] as unknown[], opts: args[1] });
      return createMockProc({ stdout: "not valid json", exitCode: 1 });
    }) as typeof Bun.spawn;

    const tool = createDifftasticTool(ctx);
    const result = await tool.execute(
      { oldPath: "old.ts", newPath: "new.ts" },
      createMockToolContext(),
    );

    expect(result).toContain("meaningfully_changed: true");
    expect(result).toContain("No parseable structural diff output.");
  });

  it("returns error message when tool spawn fails — does NOT throw", async () => {
    const env = setupTestEnvironment("difftastic-spawn-fail");
    const failCleanup = env.cleanup;

    const binaryPath = join(env.testDir, "difft");
    writeFileSync(binaryPath, "#!/bin/sh\necho mock");
    chmodSync(binaryPath, 0o755);

    const goopspecJsonPath = join(env.testDir, "goopspec.json");
    writeFileSync(
      goopspecJsonPath,
      JSON.stringify({ binaryPaths: { difft: binaryPath } }),
      "utf-8",
    );

    const failCtx = createMockPluginContext({
      testDir: env.testDir,
      db: env.db,
    });

    (Bun as { spawn: typeof Bun.spawn }).spawn = ((
      cmd: string | string[] | ReadonlyArray<string>,
      ...rest: unknown[]
    ) => {
      const cmdArgs = Array.isArray(cmd) ? (cmd as string[]) : [cmd as string];
      if (cmdArgs[0]?.endsWith("/difft")) {
        throw new Error("spawn failed: difft not found");
      }
      return originalSpawn(cmd as string[], ...(rest as [object?]));
    }) as typeof Bun.spawn;

    const tool = createDifftasticTool(failCtx);
    const result = await tool.execute(
      { oldPath: "old.ts", newPath: "new.ts" },
      createMockToolContext(),
    );

    expect(result).toContain("difftastic failed (exit -1)");
    expect(result).toContain("spawn failed: difft not found");

    failCleanup();
  });
});
