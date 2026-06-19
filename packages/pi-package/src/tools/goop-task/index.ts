import { type Static, Type } from "@sinclair/typebox";
import type { GoopPiContext, PiEventContext } from "../../core/types.js";
import { StateManager } from "../../features/state/index.js";
import { delegateTask } from "./delegation.js";
import { logError } from "../../shared/logger.js";

const EXECUTOR_TYPES = [
  "goop-executor-low",
  "goop-executor-medium",
  "goop-executor-high",
  "goop-executor-frontend-low",
  "goop-executor-frontend-high",
  "goop-researcher",
  "goop-explorer",
  "goop-verifier",
  "goop-tester",
  "goop-debugger",
  "goop-writer",
] as const;

const TaskSchema = Type.Object({
  description: Type.String({ description: "Short 3-5 word description of the task" }),
  prompt: Type.String({ description: "Detailed task prompt for the subagent" }),
  subagent_type: Type.Union(
    EXECUTOR_TYPES.map((t) => Type.Literal(t)),
    { description: "Subagent executor type" },
  ),
  workflow_id: Type.Optional(Type.String({ description: "Workflow ID context to pass" })),
});

type TaskArgs = Static<typeof TaskSchema>;

export function createGoopTaskTool(ctx: GoopPiContext) {
  return {
    name: "goop_task" as const,
    description:
      "Delegate a task to a specialized subagent executor. Works on both base Pi and oh-my-pi. Choose executor tier based on task complexity.",
    parameters: TaskSchema,
    async execute(
      _toolCallId: string,
      args: TaskArgs,
      _signal: AbortSignal,
      _onUpdate: (text: string) => void,
      _piCtx: PiEventContext,
    ): Promise<string> {
      const sm = new StateManager(ctx.projectDir);
      try {
        const workflowId = args.workflow_id ?? sm.getActiveWorkflowId();
        const result = await delegateTask({
          description: args.description,
          prompt: args.prompt,
          subagentType: args.subagent_type,
          projectDir: ctx.projectDir,
          workflowId,
        });

        if (!result.ok) {
          return `Error delegating task: ${result.error ?? "unknown error"}`;
        }

        return result.output ?? "Task delegated.";
      } catch (error) {
        logError("goop_task failed", error);
        return `Error: ${error instanceof Error ? error.message : String(error)}`;
      } finally {
        sm.close();
      }
    },
  };
}
