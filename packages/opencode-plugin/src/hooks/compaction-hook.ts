/**
 * Compaction Hook — preserves GoopSpec workflow state across session compaction.
 *
 * Uses the `experimental.session.compacting` hook to replace `output.prompt`
 * with a bounded continuation prompt. This ensures the post-compaction model
 * receives the active workflow, phase, wave progress, and next action.
 *
 * If no valid workflow can be resolved, the hook stands down without mutating
 * either output field.
 *
 * @module hooks/compaction-hook
 */

import type { CompactionHandoffSnapshot, PluginContext } from "../core/types.js";
import {
  type WorkflowContinuationDetail,
  buildContinuationPrompt,
  collectContinuationDetail,
} from "../shared/continuation-prompt.js";
import { log, logError } from "../shared/logger.js";
import { clearCompactionHaltState } from "./compaction-halt/index.js";
import type { HookFactory, Hooks } from "./types.js";
import { safeHandler } from "./utils.js";

function isCompactionHandoffSnapshot(value: unknown): value is CompactionHandoffSnapshot {
  if (value === null || typeof value !== "object") return false;
  const handoff = value as Partial<CompactionHandoffSnapshot>;
  return (
    typeof handoff.workflowId === "string" &&
    typeof handoff.phase === "string" &&
    typeof handoff.mode === "string" &&
    typeof handoff.depth === "string" &&
    typeof handoff.specLocked === "boolean" &&
    typeof handoff.interviewComplete === "boolean" &&
    typeof handoff.acceptanceConfirmed === "boolean" &&
    typeof handoff.currentWave === "number" &&
    typeof handoff.totalWaves === "number" &&
    typeof handoff.autopilot === "boolean" &&
    typeof handoff.lazyAutopilot === "boolean" &&
    (typeof handoff.branch === "string" || handoff.branch === undefined) &&
    typeof handoff.nextStep === "string" &&
    typeof handoff.capturedAtMs === "number"
  );
}

/**
 * Rebind the live active-workflow binding to the snapshot workflow when they differ.
 * Returns the workflowId that should be reported in the survival block.
 */
function reconcileActiveWorkflowBinding(
  ctx: PluginContext,
  snapshotWorkflowId: string,
): { workflowId: string; rebound: boolean } {
  const liveActiveId = ctx.stateManager.getActiveWorkflowId();
  if (liveActiveId === snapshotWorkflowId) {
    return { workflowId: snapshotWorkflowId, rebound: false };
  }

  log("compaction survival: rebinding active workflow to snapshot workflow", {
    from: liveActiveId,
    to: snapshotWorkflowId,
  });

  const restored = ctx.stateManager.restoreActiveWorkflowBinding(snapshotWorkflowId);
  if (restored) {
    return { workflowId: snapshotWorkflowId, rebound: true };
  }

  logError(
    "compaction survival: snapshot workflow does not exist in live state; falling back to live binding",
    { snapshotWorkflowId, liveActiveId },
  );

  return { workflowId: liveActiveId, rebound: false };
}

// ---------------------------------------------------------------------------
// Hook factory
// ---------------------------------------------------------------------------

/**
 * Create the compaction hook that replaces the default continuation prompt.
 *
 * It leaves both output fields unchanged when workflow state is unavailable.
 */
export const createCompactionHook: HookFactory = (ctx: PluginContext): Partial<Hooks> => {
  const handler = safeHandler(
    "experimental.session.compacting",
    async (
      input: { sessionID: string },
      output: { context: string[]; prompt?: string },
    ): Promise<void> => {
      const sessionID = input.sessionID;
      const rawHandoff = sessionID ? ctx.compactionHandoff.get(sessionID) : undefined;
      const snapshot = isCompactionHandoffSnapshot(rawHandoff) ? rawHandoff : undefined;

      if (rawHandoff === undefined) {
        logError(
          "compaction handoff snapshot was unavailable; continuing without it",
          new Error("No handoff snapshot for compacting session"),
        );
      } else if (snapshot === undefined) {
        logError("compaction handoff snapshot was malformed; continuing without it", rawHandoff);
      }

      if (sessionID) {
        ctx.compactionHandoff.delete(sessionID);
        ctx.pendingCompactions.delete(sessionID);
        clearCompactionHaltState(sessionID);
      }

      try {
        let detail: WorkflowContinuationDetail | undefined;
        if (snapshot) {
          const reconciliation = reconcileActiveWorkflowBinding(ctx, snapshot.workflowId);
          detail = collectContinuationDetail(
            ctx,
            reconciliation.workflowId === snapshot.workflowId ? snapshot : undefined,
          );
        } else {
          detail = collectContinuationDetail(ctx);
        }

        if (detail === undefined) return;

        const prompt = buildContinuationPrompt(detail);
        if (!prompt.trim()) return;

        output.prompt = prompt;
      } catch (error) {
        logError("compaction continuation prompt failed; continuing without it", error);
      }
    },
  );

  return {
    "experimental.session.compacting": handler,
  };
};
