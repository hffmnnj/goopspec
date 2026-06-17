import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool";
import type { PluginContext, ToolContext } from "../../core/types.js";
import {
  branchNameSchema,
  inferWorkflowIdFromBranch,
} from "../../features/worktree/branch-name.js";
import {
  copyFiles,
  loadWorktreeConfig,
  runHooks,
  symlinkDirs,
} from "../../features/worktree/config.js";
import { createWorktree } from "../../features/worktree/git.js";
import { openTerminal } from "../../features/worktree/terminal.js";
import { log, logError } from "../../shared/logger.js";

type OpenCodeClientLike = {
  session?: {
    fork: (params: {
      path: { id: string };
      body: Record<string, unknown>;
    }) => Promise<{ data?: { id?: string } }>;
  };
};

export function createWorktreeCreateTool(ctx: PluginContext): ToolDefinition {
  return tool({
    description:
      "Create a new git worktree for isolated development, fork the current OpenCode session, and open a terminal.",
    args: {
      branch: tool.schema.string().describe("Branch name for the worktree (e.g., 'feature/my-feature')"),
      baseBranch: tool.schema
        .string()
        .optional()
        .describe("Base branch to create from (defaults to HEAD)"),
    },
    async execute(args, toolCtx: ToolContext): Promise<string> {
      const branchResult = branchNameSchema.safeParse(args.branch);
      if (!branchResult.success) {
        return `Invalid branch name: ${branchResult.error.issues[0]?.message ?? "invalid"}`;
      }

      if (args.baseBranch) {
        const baseResult = branchNameSchema.safeParse(args.baseBranch);
        if (!baseResult.success) {
          return `Invalid base branch name: ${baseResult.error.issues[0]?.message ?? "invalid"}`;
        }
      }

      const createResult = await createWorktree(ctx.input.directory, args.branch, args.baseBranch);
      if (!createResult.ok) {
        return `Failed to create worktree: ${createResult.error}`;
      }

      const worktreePath = createResult.value;
      const workflowId = inferWorkflowIdFromBranch(args.branch);
      log("Created worktree", { worktreePath, branch: args.branch, workflowId });

      const config = await loadWorktreeConfig(ctx.input.directory);
      await copyFiles(ctx.input.directory, worktreePath, config.sync.copyFiles);
      await symlinkDirs(ctx.input.directory, worktreePath, config.sync.symlinkDirs);
      await runHooks(worktreePath, config.hooks.postCreate);

      let command = "opencode";
      try {
        const client = ctx.input.client as OpenCodeClientLike;
        if (client.session?.fork) {
          const forked = await client.session.fork({
            path: { id: toolCtx.sessionID },
            body: {},
          });

          const forkedId = forked.data?.id;
          if (forkedId) {
            command = `opencode --session ${forkedId}`;
          }
        }
      } catch (error) {
        logError("Failed to fork OpenCode session for worktree", error);
      }

      try {
        const terminalResult = await openTerminal(worktreePath, command, args.branch);
        if (!terminalResult.success) {
          logError("Failed to open terminal for worktree", terminalResult.error);
        }
      } catch (error) {
        logError("Unexpected terminal open failure", error);
      }

      return `Worktree created at ${worktreePath}\n\nA new terminal has been opened with OpenCode.`;
    },
  });
}
