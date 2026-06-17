/**
 * GoopSpec State Tool
 * Safe, atomic state operations for agents to update workflow state
 * 
 * This tool provides a safe interface for agents to update state.json
 * without directly editing the file, preventing race conditions and
 * edit conflicts.
 * 
 * @module tools/goop-state
 */

import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool";
import type { PluginContext, ToolContext, WorkflowPhase, TaskMode, WorkflowDepth } from "../../core/types.js";
import { log } from "../../shared/logger.js";

const VALID_PHASES: WorkflowPhase[] = ["idle", "plan", "research", "specify", "execute", "accept"];
const VALID_MODES: TaskMode[] = ["quick", "standard", "comprehensive", "milestone"];
const VALID_DEPTHS: WorkflowDepth[] = ["shallow", "standard", "deep"];

/**
 * Create the goop_state tool
 */
export function createGoopStateTool(ctx: PluginContext): ToolDefinition {
  return tool({
    description: `Safe atomic state operations for GoopSpec workflow. Use this instead of directly editing state.json.

Actions:
- 'get': Read current state (returns full state object)
- 'transition': Change workflow phase (validates transitions)
- 'complete-interview': Mark discovery interview as complete
- 'reset-interview': Reset interview status (for starting fresh)
- 'lock-spec': Lock the specification contract
- 'unlock-spec': Unlock the specification (use with caution)
- 'confirm-acceptance': Confirm work acceptance
- 'reset-acceptance': Reset acceptance status
- 'set-mode': Set task mode (quick/standard/comprehensive/milestone)
- 'set-depth': Set workflow depth (shallow/standard/deep)
- 'set-autopilot': Enable or disable autopilot mode (supports optional lazy mode)
- 'update-wave': Update wave progress (call ONLY after wave completes — setting currentWave=totalWaves triggers auto-progression to accept)
- 'reset': Reset entire workflow to idle state
- 'list-workflows': List all workflows with status table
- 'set-active-workflow': Switch the active workflow (requires workflowId)
- 'create-workflow': Create a new workflow entry (requires workflowId in kebab-case)

IMPORTANT: Always use this tool instead of Read/Edit on state.json to avoid conflicts.`,
    args: {
      action: tool.schema.enum([
        "get",
        "transition",
        "complete-interview",
        "reset-interview",
        "lock-spec",
        "unlock-spec",
        "confirm-acceptance",
        "reset-acceptance",
        "set-mode",
        "set-depth",
        "set-autopilot",
        "update-wave",
        "reset",
        "list-workflows",
        "set-active-workflow",
        "create-workflow",
      ]),
      workflowId: tool.schema.string().optional(),
      phase: tool.schema.string().optional(),
      mode: tool.schema.string().optional(),
      depth: tool.schema.string().optional(),
      autopilot: tool.schema.boolean().optional(),
      lazy: tool.schema.boolean().optional(),
      currentWave: tool.schema.number().optional(),
      totalWaves: tool.schema.number().optional(),
      force: tool.schema.boolean().optional(),
    },
    async execute(args, _context: ToolContext): Promise<string> {
      const { action } = args;
      
      log("goop_state action", { action, args });

      switch (action) {
        case "get": {
          const state = ctx.stateManager.getState();
          const workflow = state.workflow;
          
          const phaseIcons: Record<string, string> = {
            idle: "🔮",
            plan: "📋",
            research: "🔬",
            specify: "📜",
            execute: "⚡",
            accept: "✅",
          };
          const phaseIcon = phaseIcons[workflow.phase] || "🔮";
          const initializedDate = state.project.initialized.includes("T")
            ? state.project.initialized.split("T")[0]
            : state.project.initialized;
          const interviewDate = workflow.interviewCompletedAt
            ? (workflow.interviewCompletedAt.includes("T")
              ? workflow.interviewCompletedAt.split("T")[0]
              : workflow.interviewCompletedAt)
            : null;
          const phases = state.execution.completedPhases;
          const phaseCount = phases.length;
          let phaseSummary = "None";
          if (phaseCount > 0) {
            const lastThree = phases.slice(-3).join(" → ");
            phaseSummary = phaseCount <= 3
              ? `${phaseCount} ${phaseCount === 1 ? "phase" : "phases"} (${lastThree})`
              : `${phaseCount} phases (... → ${lastThree})`;
          }
          
          const activeWorkflowId = ctx.stateManager.getActiveWorkflowId?.() ?? "default";
          const resolvedWorkflowId = workflow.workflowId ?? activeWorkflowId;
          const workflowDocPrefix = activeWorkflowId === "default"
            ? ".goopspec/"
            : `.goopspec/${activeWorkflowId}/`;

          return `## 🔮 GoopSpec · State
- **Project:** ${state.project.name} | **Initialized:** ${initializedDate}
- **Workflow ID:** ${resolvedWorkflowId} | **Active Workflow:** ${activeWorkflowId} | **Docs:** \`${workflowDocPrefix}\`
- **Phase:** ${phaseIcon} ${workflow.phase} | **Mode:** ${workflow.mode} | **Depth:** ${workflow.depth}
- **Interview:** ${workflow.interviewComplete ? "✓ Complete" : "⏳ Pending"}${interviewDate ? ` (${interviewDate})` : ""} | **Spec:** ${workflow.specLocked ? "🔒 Locked" : "🔓 Unlocked"}
- **Acceptance:** ${workflow.acceptanceConfirmed ? "✓ Confirmed" : "⏳ Pending"} | **Wave:** ${workflow.currentWave}/${workflow.totalWaves}
- **Checkpoint:** ${state.execution.activeCheckpointId || "None"}
- **Phases:** ${phaseSummary}
- **Pending Tasks:** ${state.execution.pendingTasks.length}

---`;
        }

        case "transition": {
          if (!args.phase) {
            return "Error: 'phase' is required for transition action.\n\nValid phases: " + VALID_PHASES.join(", ");
          }
          
          const phase = args.phase as WorkflowPhase;
          if (!VALID_PHASES.includes(phase)) {
            return `Error: Invalid phase '${args.phase}'.\n\nValid phases: ${VALID_PHASES.join(", ")}`;
          }
          
          const success = ctx.stateManager.transitionPhase(phase, args.force ?? false);
          if (success) {
            const state = ctx.stateManager.getState();
            return `Phase transitioned to: ${phase}\n\nCurrent state:\n- Phase: ${state.workflow.phase}\n- Interview Complete: ${state.workflow.interviewComplete}\n- Spec Locked: ${state.workflow.specLocked}`;
          } else {
            const currentState = ctx.stateManager.getState();
            return `Error: Invalid phase transition from '${currentState.workflow.phase}' to '${phase}'.\n\nUse force=true to override (not recommended).\n\nValid transitions from '${currentState.workflow.phase}': Check workflow documentation.`;
          }
        }

        case "complete-interview": {
          ctx.stateManager.completeInterview();
          return `✓ Interview marked as complete.

→ Proceed to planning with \`/goop-plan\``;
        }

        case "reset-interview": {
          ctx.stateManager.resetInterview();
          return `✓ Interview status reset.

→ Run \`/goop-discuss\` to start a new discovery interview.`;
        }

        case "lock-spec": {
          ctx.stateManager.lockSpec();
          const confirmedState = ctx.stateManager.getState();
          if (!confirmedState.workflow.specLocked) {
            return "✗ Error: Spec lock failed — state did not confirm. Retry this action.";
          }
          return `🔒 Specification locked. Confirmed: specLocked = true.

The specification is now frozen. Changes require \`/goop-amend\`.

→ Run \`/goop-execute\` to begin implementation.`;
        }

        case "unlock-spec": {
          ctx.stateManager.unlockSpec();
          return `🔓 Specification unlocked.

⚠️ Warning: Unlocking the spec should only be done when amendments are needed.`;
        }

        case "confirm-acceptance": {
          ctx.stateManager.confirmAcceptance();
          return `✓ Acceptance confirmed.

Work has been verified and accepted.

→ Run \`/goop-accept\` to execute finalization and archival in the same flow.`;
        }

        case "reset-acceptance": {
          ctx.stateManager.resetAcceptance();
          return `✓ Acceptance status reset.

Work needs to be re-verified.`;
        }

        case "set-mode": {
          if (!args.mode) {
            return "✗ Error: 'mode' is required for set-mode action.\n\nValid modes: " + VALID_MODES.join(", ");
          }
          
          const mode = args.mode as TaskMode;
          if (!VALID_MODES.includes(mode)) {
            return `✗ Error: Invalid mode '${args.mode}'.\n\nValid modes: ${VALID_MODES.join(", ")}`;
          }
          
          ctx.stateManager.setMode(mode);
          return `✓ Task mode set to: ${mode}`;
        }

        case "set-depth": {
          if (!args.depth) {
            return "✗ Error: 'depth' is required for set-depth action.\n\nValid depths: " + VALID_DEPTHS.join(", ");
          }
          
          const depth = args.depth as WorkflowDepth;
          if (!VALID_DEPTHS.includes(depth)) {
            return `✗ Error: Invalid depth '${args.depth}'.\n\nValid depths: ${VALID_DEPTHS.join(", ")}`;
          }
          
          ctx.stateManager.updateWorkflow({ depth });
          return `✓ Workflow depth set to: ${depth}`;
        }

        case "set-autopilot": {
          if (args.autopilot === undefined) {
            return "✗ Error: 'autopilot' (boolean) is required for set-autopilot action.";
          }

          if (!args.autopilot) {
            ctx.stateManager.updateWorkflow({ autopilot: false, lazyAutopilot: false });
            return `✓ Autopilot disabled. Manual confirmation will be required between phases.`;
          }

          if (args.lazy) {
            ctx.stateManager.updateWorkflow({ autopilot: true, lazyAutopilot: true });
            return `✓ Lazy Autopilot enabled. The full pipeline will run with zero questions — all decisions inferred from your initial prompt. Pauses only at final acceptance.`;
          }

          ctx.stateManager.updateWorkflow({ autopilot: true, lazyAutopilot: false });
          return `✓ Autopilot enabled. The full pipeline (discuss → plan → execute) will run unattended, pausing only at final acceptance.`;
        }

        case "update-wave": {
          if (args.currentWave === undefined || args.totalWaves === undefined) {
            return "✗ Error: Both 'currentWave' and 'totalWaves' are required for update-wave action.";
          }
          
          if (args.currentWave < 0 || args.totalWaves < 0) {
            return "✗ Error: Wave numbers must be non-negative.";
          }
          
          if (args.currentWave > args.totalWaves) {
            return "✗ Error: currentWave cannot be greater than totalWaves.";
          }
          
          ctx.stateManager.updateWaveProgress(args.currentWave, args.totalWaves);
          const progressMsg = `✓ Wave progress: ${args.currentWave}/${args.totalWaves}`;
          if (args.currentWave === args.totalWaves) {
            return progressMsg + `\n\n⚠️ currentWave = totalWaves: auto-progression to accept will fire after this tool call. Only call update-wave(${args.currentWave}, ${args.totalWaves}) after Wave ${args.currentWave} tasks have fully completed.`;
          }
          return progressMsg;
        }

        case "reset": {
          ctx.stateManager.resetWorkflow();
          return `✓ Workflow reset to idle state.

All workflow flags cleared. Ready for a new task.

→ Run \`/goop-discuss\` to start.`;
        }

        case "list-workflows": {
          const workflows = ctx.stateManager.listWorkflows?.() ?? [];
          if (workflows.length === 0) {
            return "No workflows found. Run `/goop-discuss` to create one.";
          }
          const activeId = ctx.stateManager.getActiveWorkflowId?.() ?? "default";
          const rows = workflows.map(wf => {
            const prefix = wf.workflowId === activeId ? "►" : " ";
            const waveStr = `${wf.currentWave}/${wf.totalWaves}`;
            const spec = wf.specLocked ? "🔒" : "🔓";
            const date = wf.lastActivity?.split("T")[0] ?? "—";
            return `${prefix} ${wf.workflowId.padEnd(20)} ${wf.phase.padEnd(8)} Wave ${waveStr.padEnd(6)} ${spec} ${date}`;
          });
          return `## Workflows\n\n  ${"ID".padEnd(20)} ${"Phase".padEnd(8)} ${"Wave".padEnd(10)} Spec Date\n${rows.join("\n")}\n\nActive: ${activeId}`;
        }

        case "set-active-workflow": {
          if (!args.workflowId) {
            return "✗ Error: 'workflowId' is required for set-active-workflow action.";
          }
          const success = ctx.stateManager.setActiveWorkflow(args.workflowId);
          if (!success) {
            return `✗ Error: Workflow '${args.workflowId}' not found. Use list-workflows to see available workflows.`;
          }
          ctx.workflowId = args.workflowId;
          return `✓ Active workflow set to: ${args.workflowId}`;
        }

        case "create-workflow": {
          if (!args.workflowId) {
            return "✗ Error: 'workflowId' is required for create-workflow action.";
          }
          if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(args.workflowId) || args.workflowId.length < 2) {
            return `✗ Error: Invalid workflow ID '${args.workflowId}'. Must be kebab-case (lowercase letters, numbers, hyphens), min 2 chars.`;
          }
          const existing = ctx.stateManager.getWorkflow(args.workflowId);
          if (existing) {
            return `✓ Workflow '${args.workflowId}' already exists (no-op).\n\nWorkflow ID: ${existing.workflowId}\nPhase: ${existing.phase}\n\n→ Use set-active-workflow to bind this session to it.`;
          }
          const workflow = ctx.stateManager.createWorkflow(args.workflowId);
          return `✓ Workflow '${args.workflowId}' created.\n\nWorkflow ID: ${workflow.workflowId}\nPhase: ${workflow.phase}\n\n→ Call set-active-workflow to bind this session to the new workflow.`;
        }

        default:
          return "Unknown action. Valid actions: get, transition, complete-interview, reset-interview, lock-spec, unlock-spec, confirm-acceptance, reset-acceptance, set-mode, set-depth, set-autopilot (supports optional lazy), update-wave, reset, list-workflows, set-active-workflow, create-workflow";
      }
    },
  });
}
