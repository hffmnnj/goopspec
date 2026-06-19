import { Type, type Static } from "@sinclair/typebox";
import type { GoopPiContext, PiEventContext, WorkflowPhase } from "../../core/types.js";
import { StateManager } from "../../features/state/index.js";
import { logError } from "../../shared/logger.js";

const StateSchema = Type.Object({
  action: Type.Union(
    [
      Type.Literal("get"),
      Type.Literal("transition"),
      Type.Literal("create-workflow"),
      Type.Literal("set-active-workflow"),
      Type.Literal("lock-spec"),
      Type.Literal("unlock-spec"),
      Type.Literal("complete-interview"),
      Type.Literal("confirm-acceptance"),
      Type.Literal("update-wave"),
      Type.Literal("set-autopilot"),
      Type.Literal("list-workflows"),
    ],
    { description: "State action to perform" },
  ),
  workflow_id: Type.Optional(Type.String()),
  phase: Type.Optional(Type.String({ description: "Target phase for transition action" })),
  current_wave: Type.Optional(Type.Number()),
  total_waves: Type.Optional(Type.Number()),
  autopilot: Type.Optional(Type.Boolean()),
  lazy: Type.Optional(Type.Boolean()),
});

type StateArgs = Static<typeof StateSchema>;

export function createGoopStateTool(ctx: GoopPiContext) {
  return {
    name: "goop_state" as const,
    description:
      "Read or modify GoopSpec workflow state. Actions: get, transition, create-workflow, set-active-workflow, lock-spec, unlock-spec, complete-interview, confirm-acceptance, update-wave, set-autopilot, list-workflows.",
    parameters: StateSchema,
    async execute(
      _toolCallId: string,
      args: StateArgs,
      _signal: AbortSignal,
      _onUpdate: (text: string) => void,
      _piCtx: PiEventContext,
    ): Promise<string> {
      const sm = new StateManager(ctx.projectDir);
      try {
        const workflowId = args.workflow_id ?? sm.getActiveWorkflowId();

        switch (args.action) {
          case "get": {
            const state = sm.getState(workflowId);
            return [
              "## GoopSpec State",
              `- **Workflow ID:** ${state.workflowId} | **Docs:** \`.goopspec/${state.workflowId}/\``,
              `- **Phase:** ${state.phase} | **Mode:** ${state.mode}`,
              `- **Interview:** ${state.interviewComplete ? "Complete" : "Pending"} | **Spec:** ${state.specLocked ? "Locked" : "Unlocked"}`,
              `- **Acceptance:** ${state.acceptanceConfirmed ? "Confirmed" : "Pending"} | **Wave:** ${state.currentWave}/${state.totalWaves}`,
              `- **Autopilot:** ${state.autopilot ? `ON${state.lazyAutopilot ? " (lazy)" : ""}` : "OFF"}`,
            ].join("\n");
          }

          case "transition": {
            if (!args.phase) return "Error: 'phase' is required for transition action";
            const result = sm.transitionPhase(workflowId, args.phase as WorkflowPhase);
            if (!result.ok) return `Error: ${result.error}`;
            return `Phase transitioned to **${args.phase}**.`;
          }

          case "create-workflow": {
            sm.createWorkflow(workflowId);
            return `Workflow **${workflowId}** created.`;
          }

          case "set-active-workflow": {
            sm.setActiveWorkflowId(workflowId);
            return `Active workflow switched to **${workflowId}**.`;
          }

          case "lock-spec": {
            sm.lockSpec(workflowId);
            return "Specification **locked**.";
          }

          case "unlock-spec": {
            sm.unlockSpec(workflowId);
            return "Specification **unlocked**.";
          }

          case "complete-interview": {
            sm.completeInterview(workflowId);
            return "Interview marked as **complete**.";
          }

          case "confirm-acceptance": {
            sm.confirmAcceptance(workflowId);
            return "Acceptance **confirmed**.";
          }

          case "update-wave": {
            const cw = args.current_wave ?? 0;
            const tw = args.total_waves ?? 0;
            sm.updateWave(workflowId, cw, tw);
            return `Wave progress updated to **${cw}/${tw}**.`;
          }

          case "set-autopilot": {
            sm.setAutopilot(workflowId, args.autopilot ?? false, args.lazy ?? false);
            return `Autopilot set to **${args.autopilot ? `ON${args.lazy ? " (lazy)" : ""}` : "OFF"}**.`;
          }

          case "list-workflows": {
            const workflows = sm.listWorkflows();
            const active = sm.getActiveWorkflowId();
            if (workflows.length === 0) return "No workflows found.";
            return workflows.map((id) => `${id === active ? "> " : "  "}${id}`).join("\n");
          }

          default:
            return `Unknown action: ${String(args.action)}`;
        }
      } catch (error) {
        logError("goop_state failed", error);
        return `Error: ${error instanceof Error ? error.message : String(error)}`;
      } finally {
        sm.close();
      }
    },
  };
}
