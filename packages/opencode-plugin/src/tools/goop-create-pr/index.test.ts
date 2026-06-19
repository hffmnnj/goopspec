import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import {
  createMockPluginContext,
  createMockToolContext,
  setupTestEnvironment,
} from "../../test-utils.js";
import type { PluginContext } from "../../test-utils.js";
import { createGoopCreatePrTool } from "./index.js";

// ============================================================================
// Bun.spawn mock helpers
// ============================================================================

/**
 * Create a mock spawn result that mimics what Bun.spawn returns.
 *
 * The tool reads stdout/stderr via `new Response(proc.stdout).text()` and
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

describe("createGoopCreatePrTool", () => {
  let ctx: PluginContext;
  let cleanup: () => void;
  let originalSpawn: typeof Bun.spawn;
  let spawnCalls: Array<{ args: unknown[]; opts: unknown }>;

  beforeEach(() => {
    const env = setupTestEnvironment("goop-create-pr");
    cleanup = env.cleanup;
    ctx = createMockPluginContext({ testDir: env.testDir, db: env.db });

    // Save original and install mock
    originalSpawn = Bun.spawn;
    spawnCalls = [];

    // Default mock: successful PR creation
    (Bun as { spawn: typeof Bun.spawn }).spawn = ((...args: unknown[]) => {
      spawnCalls.push({ args: args[0] as unknown[], opts: args[1] });
      return createMockProc({
        stdout: "https://github.com/owner/repo/pull/42\n",
        exitCode: 0,
      });
    }) as typeof Bun.spawn;
  });

  afterEach(() => {
    // Restore original
    (Bun as { spawn: typeof Bun.spawn }).spawn = originalSpawn;
    cleanup();
  });

  // -----------------------------------------------------------------------
  // Terminology gate
  // -----------------------------------------------------------------------

  describe("terminology gate", () => {
    it('blocks when title contains "wave" (error severity)', async () => {
      const tool = createGoopCreatePrTool(ctx);
      const result = await tool.execute(
        {
          title: "Complete wave 1 changes",
          body: "Clean body text",
          branch: "feat/clean-branch",
        },
        createMockToolContext(),
      );

      expect(result).toContain("Blocked");
      expect(result).toContain("wave");
      expect(spawnCalls).toHaveLength(0); // gh should NOT be called
    });

    it('blocks when body contains "MH-3"', async () => {
      const tool = createGoopCreatePrTool(ctx);
      const result = await tool.execute(
        {
          title: "Add feature",
          body: "Implements MH-3 requirement",
          branch: "feat/feature",
        },
        createMockToolContext(),
      );

      expect(result).toContain("Blocked");
      expect(result).toContain("MH-3");
      expect(result).toContain("requirement");
      expect(spawnCalls).toHaveLength(0);
    });

    it('blocks when body contains "goop-executor"', async () => {
      const tool = createGoopCreatePrTool(ctx);
      const result = await tool.execute(
        {
          title: "Add tests",
          body: "Written by goop-executor-medium agent",
          branch: "feat/tests",
        },
        createMockToolContext(),
      );

      expect(result).toContain("Blocked");
      expect(result).toContain("goop-executor");
      expect(spawnCalls).toHaveLength(0);
    });

    it("does NOT block when content contains only warn-severity terms", async () => {
      const tool = createGoopCreatePrTool(ctx);
      const result = await tool.execute(
        {
          title: "Update blueprint docs",
          body: "Revised the handoff and goopspec references",
          branch: "feat/docs",
        },
        createMockToolContext(),
      );

      // Should proceed to gh (not blocked)
      expect(result).not.toContain("Blocked");
      expect(spawnCalls).toHaveLength(1);
    });

    it("passes clean content and proceeds to gh", async () => {
      const tool = createGoopCreatePrTool(ctx);
      const result = await tool.execute(
        {
          title: "Add user authentication",
          body: "Implements JWT-based auth flow",
          branch: "feat/auth",
        },
        createMockToolContext(),
      );

      expect(result).toContain("PR Created");
      expect(result).toContain("https://github.com/");
      expect(spawnCalls).toHaveLength(1);
    });

    it("violation list mentions the forbidden term and its suggested replacement", async () => {
      const tool = createGoopCreatePrTool(ctx);
      const result = await tool.execute(
        {
          title: "Finish wave 2/4",
          body: "Clean body",
          branch: "feat/clean",
        },
        createMockToolContext(),
      );

      expect(result).toContain("Blocked");
      // Should mention the match and replacement
      expect(result).toContain("wave 2/4");
      expect(result).toContain("phase");
    });
  });

  // -----------------------------------------------------------------------
  // gh CLI execution
  // -----------------------------------------------------------------------

  describe("gh CLI execution", () => {
    it("calls gh with correct base branch", async () => {
      const tool = createGoopCreatePrTool(ctx);
      await tool.execute(
        {
          title: "Add feature",
          body: "Description",
          branch: "feat/feature",
          base: "develop",
        },
        createMockToolContext(),
      );

      expect(spawnCalls).toHaveLength(1);
      const args = spawnCalls[0]!.args as string[];
      expect(args).toContain("--base");
      const baseIdx = args.indexOf("--base");
      expect(args[baseIdx + 1]).toBe("develop");
    });

    it("calls gh with --draft flag when draft: true", async () => {
      const tool = createGoopCreatePrTool(ctx);
      await tool.execute(
        {
          title: "Add feature",
          body: "Description",
          branch: "feat/feature",
          draft: true,
        },
        createMockToolContext(),
      );

      expect(spawnCalls).toHaveLength(1);
      const args = spawnCalls[0]!.args as string[];
      expect(args).toContain("--draft");
    });

    it("does NOT pass --draft when draft: false or omitted", async () => {
      const tool = createGoopCreatePrTool(ctx);

      // draft: false
      await tool.execute(
        {
          title: "Add feature",
          body: "Description",
          branch: "feat/feature",
          draft: false,
        },
        createMockToolContext(),
      );

      expect(spawnCalls).toHaveLength(1);
      const args1 = spawnCalls[0]!.args as string[];
      expect(args1).not.toContain("--draft");

      // Reset calls
      spawnCalls.length = 0;

      // draft omitted
      await tool.execute(
        {
          title: "Another feature",
          body: "Description",
          branch: "feat/another",
        },
        createMockToolContext(),
      );

      expect(spawnCalls).toHaveLength(1);
      const args2 = spawnCalls[0]!.args as string[];
      expect(args2).not.toContain("--draft");
    });

    it('uses "main" as default base when base not specified', async () => {
      const tool = createGoopCreatePrTool(ctx);
      await tool.execute(
        {
          title: "Add feature",
          body: "Description",
          branch: "feat/feature",
        },
        createMockToolContext(),
      );

      expect(spawnCalls).toHaveLength(1);
      const args = spawnCalls[0]!.args as string[];
      const baseIdx = args.indexOf("--base");
      expect(baseIdx).toBeGreaterThan(-1);
      expect(args[baseIdx + 1]).toBe("main");
    });

    it("returns PR URL from stdout on success", async () => {
      const tool = createGoopCreatePrTool(ctx);
      const result = await tool.execute(
        {
          title: "Add feature",
          body: "Description",
          branch: "feat/feature",
        },
        createMockToolContext(),
      );

      expect(result).toContain("https://github.com/owner/repo/pull/42");
    });
  });

  // -----------------------------------------------------------------------
  // Error handling
  // -----------------------------------------------------------------------

  describe("error handling", () => {
    it("returns error message when gh exits with non-zero code — does NOT throw", async () => {
      // Override spawn to return failure
      (Bun as { spawn: typeof Bun.spawn }).spawn = ((...args: unknown[]) => {
        spawnCalls.push({ args: args[0] as unknown[], opts: args[1] });
        return createMockProc({
          stdout: "",
          stderr: "fatal: not a git repository",
          exitCode: 1,
        });
      }) as typeof Bun.spawn;

      const tool = createGoopCreatePrTool(ctx);
      const result = await tool.execute(
        {
          title: "Add feature",
          body: "Description",
          branch: "feat/feature",
        },
        createMockToolContext(),
      );

      expect(result).toContain("Failed");
      expect(result).toContain("exit");
      expect(result).toContain("1");
      expect(result).toContain("not a git repository");
    });

    it("returns error message when Bun.spawn throws — does NOT throw", async () => {
      // Override spawn to throw
      (Bun as { spawn: typeof Bun.spawn }).spawn = (() => {
        throw new Error("spawn failed: gh not found");
      }) as unknown as typeof Bun.spawn;

      const tool = createGoopCreatePrTool(ctx);
      const result = await tool.execute(
        {
          title: "Add feature",
          body: "Description",
          branch: "feat/feature",
        },
        createMockToolContext(),
      );

      expect(result).toContain("Error");
      expect(result).toContain("spawn failed");
    });

    it("handles empty title gracefully", async () => {
      const tool = createGoopCreatePrTool(ctx);
      // Empty title should not crash — it either passes the gate (no terms) or proceeds
      const result = await tool.execute(
        {
          title: "",
          body: "Some description",
          branch: "feat/branch",
        },
        createMockToolContext(),
      );

      // Should not throw, should return some result
      expect(typeof result).toBe("string");
      expect((result as string).length).toBeGreaterThan(0);
    });
  });
});
