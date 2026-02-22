/**
 * Compaction Hook — injects workflow state, spec, and ADL into
 * compaction context so agents resume coherently after resets.
 *
 * @module hooks/compaction-hook
 */

import type { PluginContext } from "../core/types.js";
import { log, logError } from "../shared/logger.js";

/** Imperative directive block for current workflow phase, wave, and lock status. */
export function buildWorkflowStateBlock(_ctx: PluginContext): string {
  return "";
}

/** Active SPEC.md content (full if <=200 lines, must-haves + out-of-scope otherwise). */
export function buildSpecBlock(_projectDir: string): string {
  return "";
}

/** Last 3-5 ADL entries with imperative framing. */
export function buildADLBlock(_ctx: PluginContext): string {
  return "";
}

/** Static tool re-hydration instructions — always injected last. */
export function buildToolInstructionsBlock(): string {
  return "";
}

/**
 * Create the experimental.session.compacting hook.
 *
 * Pushes non-empty builder results to `output.context`, with tool
 * instructions always last. Never throws — errors logged via `logError`.
 */
export function createCompactionHook(ctx: PluginContext) {
  return async (
    _input: unknown,
    output: { context: string[]; prompt?: string }
  ): Promise<void> => {
    log("Compaction hook triggered");

    try {
      const blocks = [
        buildWorkflowStateBlock(ctx),
        buildSpecBlock(ctx.input.directory),
        buildADLBlock(ctx),
      ];

      let pushed = 0;
      for (const block of blocks) {
        if (block.trim().length > 0) {
          output.context.push(block);
          pushed++;
        }
      }

      // Tool instructions always last
      const toolBlock = buildToolInstructionsBlock();
      if (toolBlock.trim().length > 0) {
        output.context.push(toolBlock);
        pushed++;
      }

      log("Compaction hook complete", { contextBlocksPushed: pushed });
    } catch (error) {
      logError("Compaction hook failed", error);
    }
  };
}
