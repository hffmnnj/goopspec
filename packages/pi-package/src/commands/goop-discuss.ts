import type { GoopPiContext, PiCommand, PiEventContext } from "../core/types.js";
import { StateManager } from "../features/state/index.js";
import { logError } from "../shared/logger.js";

export function createGoopDiscussCommand(ctx: GoopPiContext): PiCommand {
  return {
    description:
      "Start GoopSpec discovery interview. Captures vision, must-haves, constraints, and risks.",
    async handler(_args: string[], piCtx: PiEventContext): Promise<void> {
      const sm = new StateManager(piCtx.projectDir ?? ctx.projectDir);
      try {
        const workflowId = sm.getActiveWorkflowId();
        const state = sm.getState(workflowId);
        process.stdout.write(
          [
            "",
            "## GoopSpec · Discuss",
            `**Workflow:** ${workflowId} | **Phase:** ${state.phase}`,
            "",
            "Starting discovery interview. The agent will ask about:",
            "1. Vision — what are we building?",
            "2. Must-haves — what must be true for success?",
            "3. Constraints — what limits us?",
            "4. Out of scope — what are we NOT building?",
            "5. Assumptions — what do we assume is true?",
            "6. Risks — what could go wrong?",
            "",
            "The agent will write REQUIREMENTS.md when complete.",
            "",
          ].join("\n"),
        );

        if (state.phase !== "discuss") {
          sm.transitionPhase(workflowId, "discuss");
        }
      } catch (error) {
        logError("goop-discuss command failed", error);
      } finally {
        sm.close();
      }
    },
  };
}
