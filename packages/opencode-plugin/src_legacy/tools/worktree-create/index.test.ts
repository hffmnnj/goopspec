import { afterEach, beforeAll, beforeEach, describe, expect, it, mock } from "bun:test";
import type { PluginContext } from "../../core/types.js";
import { createMockPluginContext, createMockToolContext, setupTestEnvironment } from "../../test-utils.js";

const createWorktreeMock = mock(async () => ({ ok: true as const, value: "/tmp/test-worktree" }));
const openTerminalMock = mock(async () => ({ success: true }));

// Re-export all named exports so mock.module doesn't strip them from other test files.
// Bun's mock.module replaces the entire module globally — omitting an export causes
// "Export named 'X' not found" errors in any test that imports it.
const realGit = await import("../../features/worktree/git.js");
const realTerminal = await import("../../features/worktree/terminal.js");

mock.module("../../features/worktree/git.js", () => ({
  ...realGit,
  createWorktree: createWorktreeMock,
}));

mock.module("../../features/worktree/terminal.js", () => ({
  ...realTerminal,
  openTerminal: openTerminalMock,
}));

let createWorktreeCreateTool: (ctx: PluginContext) => {
  description: string;
  args: Record<string, unknown>;
  execute: (args: { branch: string; baseBranch?: string }, toolCtx: ReturnType<typeof createMockToolContext>) => Promise<string>;
};

describe("worktree_create tool", () => {
  let ctx: PluginContext;
  let cleanup: () => void;
  let forkMock: ReturnType<typeof mock>;

  beforeAll(async () => {
    ({ createWorktreeCreateTool } = await import("./index.js"));
  });

  beforeEach(() => {
    const env = setupTestEnvironment("worktree-create-tool-test");
    cleanup = env.cleanup;

    forkMock = mock(async () => ({ data: { id: "test-session" } }));
    ctx = createMockPluginContext({ testDir: env.testDir });
    ctx.input.client = {
      session: {
        fork: forkMock,
      },
    };

    createWorktreeMock.mockReset();
    createWorktreeMock.mockResolvedValue({ ok: true, value: `${env.testDir}-worktree` });
    openTerminalMock.mockReset();
    openTerminalMock.mockResolvedValue({ success: true });
  });

  afterEach(() => {
    cleanup();
  });

  it("creates a valid tool definition", () => {
    const tool = createWorktreeCreateTool(ctx);

    expect(tool.description).toContain("git worktree");
    expect(tool.args).toHaveProperty("branch");
    expect(tool.args).toHaveProperty("baseBranch");
    expect(typeof tool.execute).toBe("function");
  });

  it("rejects invalid branch names", async () => {
    const tool = createWorktreeCreateTool(ctx);
    const result = await tool.execute(
      { branch: "feat;rm -rf /" },
      createMockToolContext({ directory: ctx.input.directory }),
    );

    expect(result).toContain("Invalid branch name");
    expect(createWorktreeMock).not.toHaveBeenCalled();
  });

  it("rejects empty branch names", async () => {
    const tool = createWorktreeCreateTool(ctx);
    const result = await tool.execute(
      { branch: "" },
      createMockToolContext({ directory: ctx.input.directory }),
    );

    expect(result).toContain("Invalid branch name");
    expect(createWorktreeMock).not.toHaveBeenCalled();
  });

  it("creates worktree, forks session, and opens terminal with forked session", async () => {
    const tool = createWorktreeCreateTool(ctx);
    const toolCtx = createMockToolContext({
      directory: ctx.input.directory,
      sessionID: "session-123",
    });

    const result = await tool.execute({ branch: "feat/my-feature" }, toolCtx);

    expect(createWorktreeMock).toHaveBeenCalledWith(ctx.input.directory, "feat/my-feature", undefined);
    expect(forkMock).toHaveBeenCalledWith({ path: { id: "session-123" }, body: {} });
    expect(openTerminalMock).toHaveBeenCalledWith(
      `${ctx.input.directory}-worktree`,
      "opencode --session test-session",
      "feat/my-feature",
    );
    expect(result).toContain(`Worktree created at ${ctx.input.directory}-worktree`);
  });

  it("opens terminal without session flag when fork fails", async () => {
    forkMock.mockReset();
    forkMock.mockRejectedValue(new Error("fork failed"));

    const tool = createWorktreeCreateTool(ctx);
    const toolCtx = createMockToolContext({
      directory: ctx.input.directory,
      sessionID: "session-456",
    });

    const result = await tool.execute({ branch: "feat/fallback" }, toolCtx);

    expect(openTerminalMock).toHaveBeenCalledWith(
      `${ctx.input.directory}-worktree`,
      "opencode",
      "feat/fallback",
    );
    expect(result).toContain("Worktree created at");
  });
});
