import type { GoopPiContext, PiCommand, PiEventContext } from "../core/types.js";
import { StateManager } from "../features/state/index.js";
import { logError } from "../shared/logger.js";

export function createGoopAcceptCommand(ctx: GoopPiContext): PiCommand {
  return {
    description: "Verify implementation against spec and request user acceptance.",
    async handler(_args: string[], piCtx: PiEventContext): Promise<void> {
      const sm = new StateManager(piCtx.projectDir ?? ctx.projectDir);
      try {
        const workflowId = sm.getActiveWorkflowId();
        const state = sm.getState(workflowId);

        process.stdout.write(
          [
            "",
            "## GoopSpec · Accept",
            `**Workflow:** ${workflowId} | **Wave:** ${state.currentWave}/${state.totalWaves}`,
            "",
            "Verifying implementation against specification.",
            "The agent will check all must-haves and request your explicit acceptance.",
            "",
          ].join("\n"),
        );

        sm.transitionPhase(workflowId, "accept");
      } catch (error) {
        logError("goop-accept command failed", error);
      } finally {
        sm.close();
      }
    },
  };
}
