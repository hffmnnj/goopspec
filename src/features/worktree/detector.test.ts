import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { detectWorktree } from "./detector.js";
import {
  createMockPluginContext,
  setupTestEnvironment,
} from "../../test-utils.js";
import type { PluginContext } from "../../core/types.js";

describe("detectWorktree", () => {
  let ctx: PluginContext;
  let cleanup: () => void;
  let testDir: string;

  beforeEach(() => {
    const env = setupTestEnvironment("worktree-detector");
    cleanup = env.cleanup;
    testDir = env.testDir;
  });

  afterEach(() => cleanup());

  it("returns correct shape with all required fields", async () => {
    ctx = createMockPluginContext({ testDir });
    // Override worktree to empty so primary path is skipped
    ctx.input.worktree = "";

    const result = await detectWorktree(ctx);

    expect(result).toHaveProperty("isWorktree");
    expect(result).toHaveProperty("worktreePath");
    expect(result).toHaveProperty("branchName");
    expect(result).toHaveProperty("inferredWorkflowId");
    expect(typeof result.isWorktree).toBe("boolean");
  });

  it("returns isWorktree: true when ctx.input.worktree is set", async () => {
    ctx = createMockPluginContext({ testDir });
    ctx.input.worktree = "/fake/worktree/path";

    const result = await detectWorktree(ctx);

    expect(result.isWorktree).toBe(true);
    expect(result.worktreePath).toBe("/fake/worktree/path");
  });

  it("returns isWorktree: false when ctx.input.worktree is empty and not in a worktree", async () => {
    ctx = createMockPluginContext({ testDir });
    ctx.input.worktree = "";
    // testDir is a temp dir, not a git repo — git commands will fail gracefully
    ctx.input.directory = testDir;

    const result = await detectWorktree(ctx);

    expect(result.isWorktree).toBe(false);
    expect(result.worktreePath).toBeNull();
    expect(result.branchName).toBeNull();
    expect(result.inferredWorkflowId).toBeNull();
  });

  it("returns isWorktree: false when ctx.input.worktree is whitespace-only", async () => {
    ctx = createMockPluginContext({ testDir });
    ctx.input.worktree = "   ";
    ctx.input.directory = testDir;

    const result = await detectWorktree(ctx);

    // Whitespace-only is treated as empty
    expect(result.isWorktree).toBe(false);
  });

  it("handles non-git directory gracefully in fallback path", async () => {
    ctx = createMockPluginContext({ testDir });
    ctx.input.worktree = "";
    ctx.input.directory = testDir;

    const result = await detectWorktree(ctx);

    expect(result.isWorktree).toBe(false);
    expect(result.worktreePath).toBeNull();
  });

  it("includes inferredWorkflowId when worktree path is set and branch is detectable", async () => {
    ctx = createMockPluginContext({ testDir });
    ctx.input.worktree = "/some/worktree";
    // Point directory at the actual repo root so git rev-parse works
    ctx.input.directory = process.cwd();

    const result = await detectWorktree(ctx);

    expect(result.isWorktree).toBe(true);
    expect(result.worktreePath).toBe("/some/worktree");
    // branchName will be whatever the current branch is (or null for detached HEAD)
    if (result.branchName) {
      expect(typeof result.branchName).toBe("string");
      expect(result.branchName.length).toBeGreaterThan(0);
      // inferredWorkflowId should also be a string when branch is present
      expect(typeof result.inferredWorkflowId).toBe("string");
    }
  });
});
