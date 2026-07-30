/**
 * Auto-Progression Hook
 *
 * Automatically advances workflow phases when conditions are met.
 * Fires on `tool.execute.after` — checks state after every tool call
 * and transitions when the active workflow satisfies progression rules.
 *
 * Progression rules:
 * - execute → accept: when the configured final wave and all of its tasks are complete
 *
 * Guards:
 * - Idempotent: does not re-trigger if already in the target phase.
 * - Safe: totalWaves must be > 0 (no progression on uninitialised waves).
 * - Graceful: never throws — wrapped with safeHandler.
 */

import type { PluginContext } from "../core/types.js";
import { isCompleteStatus } from "../shared/status.js";
import type { HookFactory, Hooks } from "./types.js";
import { safeHandler } from "./utils.js";

/**
 * Create the auto-progression hook factory.
 *
 * Returns a `Partial<Hooks>` with a `tool.execute.after` handler that
 * checks wave-completion conditions and transitions execute → accept.
 */
export const createAutoProgressionHook: HookFactory = (ctx: PluginContext): Partial<Hooks> => {
  const handler: NonNullable<Hooks["tool.execute.after"]> = async (_input, output) => {
    const workflow = ctx.stateManager.getActiveWorkflow();

    // Only progress from execute phase
    if (workflow.phase !== "execute") return;

    const { totalWaves } = workflow;

    // Guard: totalWaves must be positive (waves are configured)
    if (totalWaves <= 0) return;

    const finalWave = ctx.db.getWave(ctx.stateManager.getActiveWorkflowId(), totalWaves);
    if (!finalWave) return;

    const finalWaveTasks = ctx.db.getWaveTasks(finalWave.id);
    const completedTaskCount = finalWaveTasks.filter((task) =>
      isCompleteStatus(task.status),
    ).length;

    if (!isCompleteStatus(finalWave.status) || completedTaskCount !== finalWaveTasks.length) return;

    // Transition execute → accept
    try {
      ctx.stateManager.transitionPhase("accept");
    } catch {
      // Transition may fail if already in accept (race) or invalid — ignore
      return;
    }

    // Log the auto-progression in the ADL
    ctx.stateManager.appendADL({
      timestamp: new Date().toISOString(),
      type: "observation",
      description: "Auto-progression: execute → accept",
      action: `Final wave ${finalWave.wave_number} status: ${finalWave.status}; task completion: ${completedTaskCount}/${finalWaveTasks.length}. Automatically advancing to accept phase.`,
    });

    // Append a notice to the tool output so the agent sees the transition
    output.output += `\n\n---\n## Auto-Progression: execute → accept\nFinal wave ${finalWave.wave_number} is ${finalWave.status}; ${completedTaskCount}/${finalWaveTasks.length} tasks complete. Workflow advanced to accept phase.\nRun \`/goop-accept\` to verify and accept the implementation.\n`;
  };

  return {
    "tool.execute.after": safeHandler("auto-progression", handler),
  };
};
