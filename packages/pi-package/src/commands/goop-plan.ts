import type { GoopPiContext, PiCommand, PiEventContext } from "../core/types.js";
import { StateManager } from "../features/state/index.js";
import { logError } from "../shared/logger.js";

export function createGoopPlanCommand(ctx: GoopPiContext): PiCommand {
  return {
    description: "Create SPEC.md and BLUEPRINT.md from requirements. Locks the specification.",
    async handler(_args: string[], piCtx: PiEventContext): Promise<void> {
      const sm = new StateManager(piCtx.projectDir ?? ctx.projectDir);
      try {
        const workflowId = sm.getActiveWorkflowId();
        const state = sm.getState(workflowId);

        if (!state.interviewComplete) {
          process.stdout.write(
            "\n## GoopSpec · Blocked\n\nDiscovery interview must be complete before planning.\n\n→ Run: `/goop-discuss`\n\n",
          );
          return;
        }

        process.stdout.write(
          [
            "",
            "## GoopSpec · Plan",
            `**Workflow:** ${workflowId}`,
            "",
            "Creating specification and blueprint from requirements.",
            "The agent will produce SPEC.md and BLUEPRINT.md.",
            "",
          ].join("\n"),
        );

        sm.transitionPhase(workflowId, "plan");
      } catch (error) {
        logError("goop-plan command failed", error);
      } finally {
        sm.close();
      }
    },
  };
}
