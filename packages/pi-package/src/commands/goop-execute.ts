import type { GoopPiContext, PiCommand, PiEventContext } from "../core/types.js";
import { StateManager } from "../features/state/index.js";
import { logError } from "../shared/logger.js";

export function createGoopExecuteCommand(ctx: GoopPiContext): PiCommand {
  return {
    description: "Execute the blueprint wave by wave. Requires a locked specification.",
    async handler(_args: string[], piCtx: PiEventContext): Promise<void> {
      const sm = new StateManager(piCtx.projectDir ?? ctx.projectDir);
      try {
        const workflowId = sm.getActiveWorkflowId();
        const state = sm.getState(workflowId);

        if (!state.specLocked) {
          process.stdout.write(
            "\n## GoopSpec · Blocked\n\nSpecification must be locked before execution.\n\n→ Run: `/goop-plan`\n\n",
          );
          return;
        }

        process.stdout.write(
          [
            "",
            "## GoopSpec · Execute",
            `**Workflow:** ${workflowId} | **Wave:** ${state.currentWave}/${state.totalWaves}`,
            "",
            "Executing blueprint. The agent will implement tasks wave by wave.",
            "",
          ].join("\n"),
        );

        sm.transitionPhase(workflowId, "execute");
      } catch (error) {
        logError("goop-execute command failed", error);
      } finally {
        sm.close();
      }
    },
  };
}
