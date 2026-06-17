import * as path from "node:path";
import type { PluginContext } from "../../core/types.js";
import { inferWorkflowIdFromBranch } from "./branch-name.js";
import { git } from "./git.js";
import { log, logError } from "../../shared/logger.js";

export interface WorktreeDetectionResult {
  isWorktree: boolean;
  worktreePath: string | null;
  branchName: string | null;
  inferredWorkflowId: string | null;
}

/**
 * Detect if the current session is running inside a git worktree.
 *
 * Primary path: ctx.input.worktree is non-empty — OpenCode already tells us.
 * Fallback path: compare git rev-parse --git-dir vs --git-common-dir.
 *
 * Returns the worktree path, branch name, and inferred workflow ID.
 */
export async function detectWorktree(ctx: PluginContext): Promise<WorktreeDetectionResult> {
  const not: WorktreeDetectionResult = {
    isWorktree: false,
    worktreePath: null,
    branchName: null,
    inferredWorkflowId: null,
  };

  try {
    const cwd = ctx.input.directory;

    // PRIMARY PATH: ctx.input.worktree is set by OpenCode when inside a worktree
    if (ctx.input.worktree && ctx.input.worktree.trim() !== "") {
      const worktreePath = ctx.input.worktree;

      const branchResult = await git(["rev-parse", "--abbrev-ref", "HEAD"], cwd);
      const branchName =
        branchResult.ok && branchResult.value !== "HEAD" ? branchResult.value : null;
      const inferredWorkflowId = branchName ? inferWorkflowIdFromBranch(branchName) : null;

      log("Worktree detected via ctx.input.worktree", { worktreePath, branchName });
      return { isWorktree: true, worktreePath, branchName, inferredWorkflowId };
    }

    // FALLBACK PATH: git rev-parse comparison
    const gitDirResult = await git(["rev-parse", "--git-dir"], cwd);
    if (!gitDirResult.ok) return not;

    const commonDirResult = await git(["rev-parse", "--git-common-dir"], cwd);
    if (!commonDirResult.ok) return not;

    const gitDir = path.resolve(cwd, gitDirResult.value);
    const commonDir = path.resolve(cwd, commonDirResult.value);

    // If they differ, we're in a worktree
    if (gitDir === commonDir) return not;

    const branchResult = await git(["rev-parse", "--abbrev-ref", "HEAD"], cwd);
    const branchName =
      branchResult.ok && branchResult.value !== "HEAD" ? branchResult.value : null;
    const inferredWorkflowId = branchName ? inferWorkflowIdFromBranch(branchName) : null;

    log("Worktree detected via git dir comparison", { gitDir, commonDir, branchName });
    return { isWorktree: true, worktreePath: cwd, branchName, inferredWorkflowId };
  } catch (error) {
    logError("Worktree detection failed", error);
    return not;
  }
}
