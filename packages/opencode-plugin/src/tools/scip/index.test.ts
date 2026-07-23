import { chmodSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import {
  createMockPluginContext,
  createMockToolContext,
  setupTestEnvironment,
} from "../../test-utils.js";
import type { PluginContext } from "../../test-utils.js";
import { createScipTool } from "./index.js";

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

/**
 * Build a deterministic SCIP JSON dump that can be filtered by the tool.
 *
 * Contains:
 * - one definition occurrence for `sym:foo` in src/foo.ts (range length 3)
 * - one reference occurrence for `sym:foo` in src/bar.ts (range length 4)
 * - one implementation relationship pointing at `sym:foo` on `sym:fooImpl`
 *   plus a definition occurrence for `sym:fooImpl`
 */
function buildScipIndex() {
  return {
    documents: [
      {
        relativePath: "src/foo.ts",
        occurrences: [
          {
            range: [10, 5, 15],
            symbol: "sym:foo",
            symbol_roles: 0x1, // definition
          },
          {
            range: [12, 8, 12, 13],
            symbol: "sym:foo",
            symbolRoles: 0x0, // reference
          },
        ],
      },
      {
        relativePath: "src/bar.ts",
        occurrences: [
          {
            range: [20, 7, 25],
            symbol: "sym:foo",
            symbol_roles: 0x0, // reference
          },
        ],
      },
      {
        relativePath: "src/fooImpl.ts",
        occurrences: [
          {
            range: [30, 9, 40],
            symbol: "sym:fooImpl",
            symbol_roles: 0x1, // definition
          },
        ],
        symbols: [
          {
            symbol: "sym:fooImpl",
            relationships: [
              {
                symbol: "sym:foo",
                isImplementation: true,
              },
            ],
          },
        ],
      },
    ],
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("createScipTool", () => {
  let ctx: PluginContext;
  let cleanup: () => void;
  let originalSpawn: typeof Bun.spawn;
  let spawnCalls: Array<{ args: unknown[]; opts: unknown }>;

  beforeEach(() => {
    const env = setupTestEnvironment("scip-tool");
    cleanup = env.cleanup;
    ctx = createMockPluginContext({ testDir: env.testDir, db: env.db });

    originalSpawn = Bun.spawn;
    spawnCalls = [];

    // Default mock: return an empty SCIP index so tests that opt into a real
    // index can override spawn per-test.
    (Bun as { spawn: typeof Bun.spawn }).spawn = ((...args: unknown[]) => {
      spawnCalls.push({ args: args[0] as unknown[], opts: args[1] });
      return createMockProc({ stdout: JSON.stringify({ documents: [] }) });
    }) as typeof Bun.spawn;
  });

  afterEach(() => {
    (Bun as { spawn: typeof Bun.spawn }).spawn = originalSpawn;
    cleanup();
  });

  // -----------------------------------------------------------------------
  // definitions
  // -----------------------------------------------------------------------

  it("returns definition location with UTF-16 offsets preserved", async () => {
    (Bun as { spawn: typeof Bun.spawn }).spawn = ((...args: unknown[]) => {
      spawnCalls.push({ args: args[0] as unknown[], opts: args[1] });
      return createMockProc({ stdout: JSON.stringify(buildScipIndex()) });
    }) as typeof Bun.spawn;

    // Use a temp, configured scip binary so resolveBinary takes the config branch
    // and never runs `command -v`.
    const scipBin = join(ctx.sdk.directory, "scip");
    writeFileSync(scipBin, "#!/bin/sh\necho mock scip", "utf-8");
    chmodSync(scipBin, 0o755);
    writeFileSync(
      join(ctx.sdk.directory, "goopspec.json"),
      JSON.stringify({ binaryPaths: { scip: scipBin } }),
      "utf-8",
    );

    const indexPath = join(ctx.sdk.directory, "index.scip");
    writeFileSync(indexPath, "dummy index bytes", "utf-8");

    const tool = createScipTool(ctx);
    const result = await tool.execute(
      { action: "definitions", symbol: "sym:foo", index_path: indexPath },
      createMockToolContext(),
    );

    expect(result).toContain("Found 1 definition");
    expect(result).toContain("src/foo.ts [10:5 -> 10:15]");
    expect(result).toContain("(UTF-16 columns)");
    expect(result).not.toContain("src/bar.ts");

    // The range in the mocked JSON is [10,5,15] — the tool must preserve that
    // shape and not force it into a four-element range.
    const args = spawnCalls[0]?.args as string[];
    expect(args).toContain("print");
    expect(args).toContain("--json");
    expect(args).toContain(indexPath);
  });

  // -----------------------------------------------------------------------
  // references
  // -----------------------------------------------------------------------

  it("returns references and excludes definitions", async () => {
    (Bun as { spawn: typeof Bun.spawn }).spawn = ((...args: unknown[]) => {
      spawnCalls.push({ args: args[0] as unknown[], opts: args[1] });
      return createMockProc({ stdout: JSON.stringify(buildScipIndex()) });
    }) as typeof Bun.spawn;

    const scipBin = join(ctx.sdk.directory, "scip");
    writeFileSync(scipBin, "#!/bin/sh\necho mock scip", "utf-8");
    chmodSync(scipBin, 0o755);
    writeFileSync(
      join(ctx.sdk.directory, "goopspec.json"),
      JSON.stringify({ binaryPaths: { scip: scipBin } }),
      "utf-8",
    );

    const indexPath = join(ctx.sdk.directory, "index.scip");
    writeFileSync(indexPath, "dummy", "utf-8");

    const tool = createScipTool(ctx);
    const result = await tool.execute(
      { action: "references", symbol: "sym:foo", index_path: indexPath },
      createMockToolContext(),
    );

    expect(result).toContain("Found 2 references:");
    expect(result).toContain("src/foo.ts [12:8 -> 12:13]");
    expect(result).toContain("src/bar.ts [20:7 -> 20:25]");
    expect(result).not.toContain("[10:5 -> 10:15]"); // definition excluded
  });

  // -----------------------------------------------------------------------
  // implementations
  // -----------------------------------------------------------------------

  it("returns implementations when isImplementation relationships exist", async () => {
    (Bun as { spawn: typeof Bun.spawn }).spawn = ((...args: unknown[]) => {
      spawnCalls.push({ args: args[0] as unknown[], opts: args[1] });
      return createMockProc({ stdout: JSON.stringify(buildScipIndex()) });
    }) as typeof Bun.spawn;

    const scipBin = join(ctx.sdk.directory, "scip");
    writeFileSync(scipBin, "#!/bin/sh\necho mock scip", "utf-8");
    chmodSync(scipBin, 0o755);
    writeFileSync(
      join(ctx.sdk.directory, "goopspec.json"),
      JSON.stringify({ binaryPaths: { scip: scipBin } }),
      "utf-8",
    );

    const indexPath = join(ctx.sdk.directory, "index.scip");
    writeFileSync(indexPath, "dummy", "utf-8");

    const tool = createScipTool(ctx);
    const result = await tool.execute(
      { action: "implementations", symbol: "sym:foo", index_path: indexPath },
      createMockToolContext(),
    );

    expect(result).toContain("Found 1 implementation:");
    expect(result).toContain("src/fooImpl.ts [30:9 -> 30:40]");
  });

  // -----------------------------------------------------------------------
  // no-index guidance
  // -----------------------------------------------------------------------

  it("returns actionable guidance when the index file is missing and does not spawn", async () => {
    const tool = createScipTool(ctx);
    const result = await tool.execute(
      {
        action: "definitions",
        symbol: "sym:foo",
        index_path: join(ctx.sdk.directory, "missing.scip"),
      },
      createMockToolContext(),
    );

    expect(result).toContain("No SCIP index found");
    expect(result).toContain("Run the SCIP tool with action `index` first");
    expect(spawnCalls).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // index action success
  // -----------------------------------------------------------------------

  it("generates the index and reports its path when scip-typescript succeeds", async () => {
    const tsIndexer = join(ctx.sdk.directory, "scip-typescript");
    writeFileSync(tsIndexer, "#!/bin/sh\necho done", "utf-8");
    chmodSync(tsIndexer, 0o755);
    writeFileSync(
      join(ctx.sdk.directory, "goopspec.json"),
      JSON.stringify({ binaryPaths: { "scip-typescript": tsIndexer } }),
      "utf-8",
    );

    const tool = createScipTool(ctx);
    const result = await tool.execute({ action: "index" }, createMockToolContext());

    expect(result).toContain("Generated SCIP index at");
    expect(result).toContain(join(ctx.sdk.directory, "index.scip"));

    expect(spawnCalls).toHaveLength(1);
    const args = spawnCalls[0]?.args as string[];
    expect(args[0]).toBe(tsIndexer);
    expect(args).toContain("index");
  });

  // -----------------------------------------------------------------------
  // index action / missing binary
  // -----------------------------------------------------------------------

  it("returns install hint when scip-typescript is unresolvable", async () => {
    // No binary on disk and Bun.spawn defaults return an empty index, so PATH
    // lookup (`command -v`) is what resolveViaWhich tries. Force that to fail.
    (Bun as { spawn: typeof Bun.spawn }).spawn = ((...args: unknown[]) => {
      spawnCalls.push({ args: args[0] as unknown[], opts: args[1] });
      const argv = args[0] as string[];
      // Reject the `command -v scip-typescript` lookup as if sh ran it.
      if (argv.length >= 3 && argv[2] === "command -v scip-typescript") {
        return createMockProc({ stdout: "", stderr: "", exitCode: 1 });
      }
      return createMockProc({ stdout: JSON.stringify({ documents: [] }) });
    }) as typeof Bun.spawn;

    const tool = createScipTool(ctx);
    const result = await tool.execute({ action: "index" }, createMockToolContext());

    expect(result).toContain("Could not find the 'scip-typescript' binary");
    expect(result).toContain("npm i -g @sourcegraph/scip-typescript");
  });

  // -----------------------------------------------------------------------
  // missing scip (query) binary
  // -----------------------------------------------------------------------

  it("returns install hint when scip is unresolvable", async () => {
    (Bun as { spawn: typeof Bun.spawn }).spawn = ((...args: unknown[]) => {
      spawnCalls.push({ args: args[0] as unknown[], opts: args[1] });
      const argv = args[0] as string[];
      if (argv.length >= 3 && argv[2] === "command -v scip") {
        return createMockProc({ stdout: "", stderr: "", exitCode: 1 });
      }
      return createMockProc({ stdout: JSON.stringify({ documents: [] }) });
    }) as typeof Bun.spawn;

    const indexPath = join(ctx.sdk.directory, "index.scip");
    writeFileSync(indexPath, "dummy", "utf-8");

    const tool = createScipTool(ctx);
    const result = await tool.execute(
      { action: "references", symbol: "sym:foo", index_path: indexPath },
      createMockToolContext(),
    );

    expect(result).toContain("Could not find the 'scip' CLI");
    expect(result).toContain("https://github.com/scip-code/scip/releases");
  });

  // -----------------------------------------------------------------------
  // injection safety
  // -----------------------------------------------------------------------

  it("passes symbol and path as discrete spawn args, never concatenated", async () => {
    (Bun as { spawn: typeof Bun.spawn }).spawn = ((...args: unknown[]) => {
      spawnCalls.push({ args: args[0] as unknown[], opts: args[1] });
      return createMockProc({ stdout: JSON.stringify({ documents: [] }) });
    }) as typeof Bun.spawn;

    const scipBin = join(ctx.sdk.directory, "scip");
    writeFileSync(scipBin, "#!/bin/sh\necho mock scip", "utf-8");
    chmodSync(scipBin, 0o755);
    writeFileSync(
      join(ctx.sdk.directory, "goopspec.json"),
      JSON.stringify({ binaryPaths: { scip: scipBin } }),
      "utf-8",
    );

    const indexPath = join(ctx.sdk.directory, "index.scip");
    writeFileSync(indexPath, "dummy", "utf-8");

    const tool = createScipTool(ctx);
    await tool.execute(
      {
        action: "definitions",
        symbol: "sym;foo | cat",
        index_path: indexPath,
      },
      createMockToolContext(),
    );

    expect(spawnCalls).toHaveLength(1);
    const args = spawnCalls[0]?.args as string[];
    expect(Array.isArray(args)).toBe(true);

    // The subprocess helper uses an args array, so the index path and the scip
    // command options are discrete elements. The symbol is NOT passed to the
    // scip CLI at all — it is filtered in-memory after parsing JSON.
    expect(args).toEqual([scipBin, "print", "--json", indexPath]);
  });
});
