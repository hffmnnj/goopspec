import { detectRuntime } from "../../features/runtime/index.js";
import { log, logError } from "../../shared/logger.js";

export type TaskDelegationInput = {
  description: string;
  prompt: string;
  subagentType: string;
  projectDir: string;
  workflowId: string;
};

export type TaskDelegationResult = {
  ok: boolean;
  output?: string;
  error?: string;
};

/**
 * Delegates work to a subagent.
 *
 * Strategy:
 * - On omp: use omp's built-in `task` tool via tool call injection
 * - On base pi: return structured instructions for spawning a Pi session
 */
export async function delegateTask(input: TaskDelegationInput): Promise<TaskDelegationResult> {
  const runtimeInfo = detectRuntime();
  log("delegateTask", { runtime: runtimeInfo.runtime, subagentType: input.subagentType });

  try {
    if (runtimeInfo.runtime === "omp") {
      return {
        ok: true,
        output: [
          `## Subagent Task Delegation (omp mode)`,
          ``,
          `**Subagent type:** ${input.subagentType}`,
          `**Description:** ${input.description}`,
          ``,
          `Use the built-in \`task\` tool to delegate this work:`,
          ``,
          `\`\`\``,
          `task({`,
          `  description: "${input.description}",`,
          `  prompt: ${JSON.stringify(input.prompt).slice(0, 200)}...`,
          `})`,
          `\`\`\``,
          ``,
          `**Context to pass:**`,
          `- Project dir: ${input.projectDir}`,
          `- Workflow ID: ${input.workflowId}`,
        ].join("\n"),
      };
    }

    // Base Pi: return structured delegation instructions
    return {
      ok: true,
      output: [
        `## Subagent Task Delegation (pi mode)`,
        ``,
        `**Subagent type:** ${input.subagentType}`,
        `**Description:** ${input.description}`,
        ``,
        `Create a new Pi session to handle this task:`,
        `\`pi -p "${input.prompt.slice(0, 100)}..."\``,
        ``,
        `Or install pi-subagents for structured delegation:`,
        `\`pi install npm:pi-subagents\``,
        ``,
        `**Context:**`,
        `- Project dir: ${input.projectDir}`,
        `- Workflow ID: ${input.workflowId}`,
      ].join("\n"),
    };
  } catch (error) {
    logError("delegateTask failed", error);
    return { ok: false, error: String(error) };
  }
}
