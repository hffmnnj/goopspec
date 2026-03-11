import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool";
import type { PluginContext, ToolContext } from "../../core/types.js";
import { loadWorktreeConfig, runHooks } from "../../features/worktree/config.js";
import { git, removeWorktree } from "../../features/worktree/git.js";
import { log, logError } from "../../shared/logger.js";

export function createWorktreeDeleteTool(ctx: PluginContext): ToolDefinition {
  return tool({
    description:
      "Delete the current worktree and clean up. All changes will be committed as a snapshot before removal.",
    args: {
      reason: tool.schema
        .string()
        .describe("Brief explanation of why you are calling this tool"),
    },
    async execute(args, _toolCtx: ToolContext): Promise<string> {
      if (!ctx.input.worktree) {
        return "❌ Not currently in a worktree. This tool can only be called from inside a worktree session.";
      }

      const worktreePath = ctx.input.worktree;
      const mainRepoRoot = ctx.input.directory;

      log("Deleting worktree with snapshot", {
        reason: args.reason,
        worktreePath,
        mainRepoRoot,
      });

      const config = await loadWorktreeConfig(mainRepoRoot);
      await runHooks(worktreePath, config.hooks.preDelete);

      const addResult = await git(["add", "-A"], worktreePath);
      if (!addResult.ok) {
        logError("Failed to stage worktree changes before delete", {
          worktreePath,
          error: addResult.error,
        });
      }

      const commitResult = await git(
        ["commit", "-m", "chore(worktree): session snapshot", "--allow-empty"],
        worktreePath,
      );
      if (!commitResult.ok) {
        logError("Failed to commit worktree snapshot before delete", {
          worktreePath,
          error: commitResult.error,
        });
      }

      const removeResult = await removeWorktree(mainRepoRoot, worktreePath);
      if (!removeResult.ok) {
        logError("Failed to remove worktree after snapshot", {
          worktreePath,
          error: removeResult.error,
        });
      }

      return "✅ Worktree committed and removed.\n\nAll changes were committed as a snapshot before cleanup.";
    },
  });
}
