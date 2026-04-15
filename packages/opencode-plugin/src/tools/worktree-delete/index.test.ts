import { afterEach, beforeAll, beforeEach, describe, expect, it, mock } from "bun:test";
import type { PluginContext } from "../../core/types.js";
import { createMockPluginContext, createMockToolContext, setupTestEnvironment } from "../../test-utils.js";

const gitMock = mock(async () => ({ ok: true as const, value: "" }));
const removeWorktreeMock = mock(async () => ({ ok: true as const, value: undefined }));
const loadWorktreeConfigMock = mock(async () => ({
  sync: { copyFiles: [], symlinkDirs: [], exclude: [] },
  hooks: { postCreate: [], preDelete: [] },
}));
const runHooksMock = mock(async () => {});

// Re-export all named exports so mock.module doesn't strip them from other test files.
// Bun's mock.module replaces the entire module globally — omitting an export causes
// "Export named 'X' not found" errors in any test that imports it.
const realGit = await import("../../features/worktree/git.js");
const realConfig = await import("../../features/worktree/config.js");

mock.module("../../features/worktree/git.js", () => ({
  ...realGit,
  git: gitMock,
  removeWorktree: removeWorktreeMock,
}));

mock.module("../../features/worktree/config.js", () => ({
  ...realConfig,
  loadWorktreeConfig: loadWorktreeConfigMock,
  runHooks: runHooksMock,
}));

let createWorktreeDeleteTool: (ctx: PluginContext) => {
  description: string;
  args: Record<string, unknown>;
  execute: (args: { reason: string }, toolCtx: ReturnType<typeof createMockToolContext>) => Promise<string>;
};

describe("worktree_delete tool", () => {
  let ctx: PluginContext;
  let cleanup: () => void;

  beforeAll(async () => {
    ({ createWorktreeDeleteTool } = await import("./index.js"));
  });

  beforeEach(() => {
    const env = setupTestEnvironment("worktree-delete-tool-test");
    cleanup = env.cleanup;

    ctx = createMockPluginContext({ testDir: env.testDir });
    ctx.input.worktree = `${env.testDir}-worktree`;

    gitMock.mockReset();
    gitMock.mockResolvedValue({ ok: true, value: "" });
    removeWorktreeMock.mockReset();
    removeWorktreeMock.mockResolvedValue({ ok: true, value: undefined });
    loadWorktreeConfigMock.mockReset();
    loadWorktreeConfigMock.mockResolvedValue({
      sync: { copyFiles: [], symlinkDirs: [], exclude: [] },
      hooks: { postCreate: [], preDelete: ["echo preparing delete"] },
    });
    runHooksMock.mockReset();
    runHooksMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
  });

  it("returns error when not in worktree", async () => {
    ctx.input.worktree = "";
    const tool = createWorktreeDeleteTool(ctx);
    const result = await tool.execute(
      { reason: "done" },
      createMockToolContext({ directory: ctx.input.directory }),
    );

    expect(result).toContain("Not currently in a worktree");
    expect(gitMock).not.toHaveBeenCalled();
  });

  it("tool is exported as ToolDefinition", () => {
    const tool = createWorktreeDeleteTool(ctx);
    expect(tool.description).toContain("Delete the current worktree");
    expect(typeof tool.execute).toBe("function");
  });

  it("has correct args schema", () => {
    const tool = createWorktreeDeleteTool(ctx);
    expect(tool.args).toHaveProperty("reason");
  });

  it("runs hooks, snapshots, and removes worktree", async () => {
    const tool = createWorktreeDeleteTool(ctx);
    const result = await tool.execute(
      { reason: "completed task" },
      createMockToolContext({ directory: ctx.input.directory, worktree: ctx.input.worktree }),
    );

    expect(loadWorktreeConfigMock).toHaveBeenCalledWith(ctx.input.directory);
    expect(runHooksMock).toHaveBeenCalledWith(ctx.input.worktree, ["echo preparing delete"]);
    expect(gitMock).toHaveBeenNthCalledWith(1, ["add", "-A"], ctx.input.worktree);
    expect(gitMock).toHaveBeenNthCalledWith(
      2,
      ["commit", "-m", "chore(worktree): session snapshot", "--allow-empty"],
      ctx.input.worktree,
    );
    expect(removeWorktreeMock).toHaveBeenCalledWith(ctx.input.directory, ctx.input.worktree);
    expect(result).toContain("Worktree committed and removed");
  });
});
