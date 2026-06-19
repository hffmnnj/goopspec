import type { GoopPiContext, PiCommand, PiEventContext } from "../core/types.js";
import { StateManager } from "../features/state/index.js";
import { logError } from "../shared/logger.js";

export function createGoopStatusCommand(ctx: GoopPiContext): PiCommand {
  return {
    description: "Show current GoopSpec workflow state, phase, and progress.",
    async handler(_args: string[], piCtx: PiEventContext): Promise<void> {
      const sm = new StateManager(piCtx.projectDir ?? ctx.projectDir);
      try {
        const workflowId = sm.getActiveWorkflowId();
        const state = sm.getState(workflowId);
        const allWorkflows = sm.listWorkflows();

        const waveBar =
          state.totalWaves > 0
            ? `${"█".repeat(state.currentWave)}${"░".repeat(state.totalWaves - state.currentWave)} ${state.currentWave}/${state.totalWaves}`
            : "No waves defined";

        process.stdout.write(
          [
            "",
            "## GoopSpec · Status",
            `- **Workflow:** ${state.workflowId} | **Mode:** ${state.mode}`,
            `- **Phase:** ${state.phase} | **Spec:** ${state.specLocked ? "Locked" : "Unlocked"}`,
            `- **Interview:** ${state.interviewComplete ? "Complete" : "Pending"} | **Acceptance:** ${state.acceptanceConfirmed ? "Confirmed" : "Pending"}`,
            `- **Wave Progress:** ${waveBar}`,
            `- **Autopilot:** ${state.autopilot ? `ON${state.lazyAutopilot ? " (lazy)" : ""}` : "OFF"}`,
            "",
            `### Workflows (${allWorkflows.length})`,
            allWorkflows.map((id) => `${id === workflowId ? "> " : "  "}${id}`).join("\n"),
            "",
          ].join("\n"),
        );
      } catch (error) {
        logError("goop-status command failed", error);
      } finally {
        sm.close();
      }
    },
  };
}
