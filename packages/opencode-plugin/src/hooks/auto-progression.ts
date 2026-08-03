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
 * - Manual: a persisted forced-transition override pauses progression until
 *   the operator explicitly clears it through `goop_state`.
 * - Graceful: never throws — wrapped with safeHandler.
 */

import type { PluginContext } from "../core/types.js";
import { isWaveVerified } from "../features/enforcement/verifier-stage.js";
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

    // A forced phase correction is durable operator intent. Do not undo it
    // until the operator explicitly returns control to automatic progression.
    if (workflow.manualOverride) return;

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

    // Task completion alone is not sufficient — the final wave must also
    // carry at least one passing or explicit-skip verification row. Guidance
    // names the exact next dispatch so lazy autopilot keeps moving.
    const verificationRows = ctx.db.getVerifications(
      ctx.stateManager.getActiveWorkflowId(),
      finalWave.id,
    );
    if (!isWaveVerified(verificationRows)) {
      output.output += `\n\n---\n## Blocked: execute → accept\nFinal wave ${finalWave.wave_number} tasks are complete, but no passing or explicit-skip verification is recorded for it. Dispatch goop-wave-verifier for wave ${finalWave.wave_number}, record a pass or skip verification row (goop_write_wave verifications[]), then retry.\n`;
      return;
    }

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
