/**
 * GoopSpec State Tool
 *
 * Safe, atomic state operations for agents to update workflow state.
 * All mutations flow through the StateManager — never edits state.json directly.
 *
 * This is the ONLY sanctioned mutation boundary for workflow state.
 *
 * @module tools/goop-state
 */

import { TASK_MODES, WORKFLOW_DEPTHS, WORKFLOW_PHASES } from "../../core/constants.js";
import type { TaskMode, WorkflowDepth, WorkflowPhase } from "../../core/constants.js";
import { tool } from "../../core/sdk-compat.js";
import type { ToolContext, ToolDefinition } from "../../core/sdk-compat.js";
import type { PluginContext, WorkflowState } from "../../core/types.js";
import { renderSidecars } from "../../shared/render-sidecars.js";

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function isValidPhase(value: string): value is WorkflowPhase {
  return (WORKFLOW_PHASES as readonly string[]).includes(value);
}

function isValidMode(value: string): value is TaskMode {
  return (TASK_MODES as readonly string[]).includes(value);
}

function isValidDepth(value: string): value is WorkflowDepth {
  return (WORKFLOW_DEPTHS as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Action enum
// ---------------------------------------------------------------------------

const STATE_ACTIONS = [
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
] as const;

type StateAction = (typeof STATE_ACTIONS)[number];

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

const PHASE_ICONS: Record<string, string> = {
  idle: "\u{1F52E}",
  discuss: "\u{1F4AC}",
  plan: "\u{1F4CB}",
  execute: "\u26A1",
  accept: "\u2705",
};

function formatGetResponse(
  activeId: string,
  wf: WorkflowState,
  projectName: string,
  allIds: string[],
): string {
  const icon = PHASE_ICONS[wf.phase] ?? "\u{1F52E}";
  const interviewDate = wf.interviewComplete ? "\u2713 Complete" : "\u2717 Pending";
  const specStatus = wf.specLocked ? "\u{1F512} Locked" : "\u{1F513} Unlocked";
  const acceptStatus = wf.acceptanceConfirmed ? "\u2713 Confirmed" : "\u23F3 Pending";

  const lines: string[] = [];
  lines.push("## \u{1F52E} GoopSpec \u00B7 State");
  lines.push(
    `- **Project:** ${projectName} | **Workflow ID:** ${activeId} | **Docs:** \`.goopspec/${activeId === "default" ? "" : `${activeId}/`}\``,
  );
  lines.push(`- **Phase:** ${icon} ${wf.phase} | **Mode:** ${wf.mode} | **Depth:** ${wf.depth}`);
  lines.push(`- **Interview:** ${interviewDate} | **Spec:** ${specStatus}`);
  lines.push(`- **Acceptance:** ${acceptStatus} | **Wave:** ${wf.currentWave}/${wf.totalWaves}`);

  if (wf.checkpoint) {
    lines.push(`- **Checkpoint:** ${wf.checkpoint}`);
  }
  if (wf.autopilot) {
    lines.push(`- **Autopilot:** ON${wf.lazyAutopilot ? " (lazy)" : ""}`);
  }

  if (allIds.length > 1) {
    lines.push("");
    lines.push("### Workflows");
    for (const id of allIds) {
      const marker = id === activeId ? "\u25B6" : " ";
      lines.push(`- ${marker} ${id}`);
    }
  }

  return lines.join("\n");
}

function formatWorkflowList(activeId: string, workflows: Record<string, WorkflowState>): string {
  const ids = Object.keys(workflows);
  if (ids.length === 0) return "No workflows found.";

  const lines: string[] = [];
  lines.push("## \u{1F52E} GoopSpec \u00B7 Workflows");
  lines.push("");
  lines.push("| Active | ID | Phase | Mode | Spec | Wave |");
  lines.push("|--------|----|-------|------|------|------|");

  for (const id of ids) {
    const wf = workflows[id];
    const marker = id === activeId ? "\u25B6" : " ";
    const spec = wf.specLocked ? "\u{1F512}" : "\u{1F513}";
    const wave = wf.totalWaves > 0 ? `${wf.currentWave}/${wf.totalWaves}` : "-";
    lines.push(`| ${marker} | ${id} | ${wf.phase} | ${wf.mode} | ${spec} | ${wave} |`);
  }

  return lines.join("\n");
}

function renderStatusAfterMutation(ctx: PluginContext): void {
  try {
    const activeWorkflowId = ctx.stateManager.getState().activeWorkflowId;
    renderSidecars(ctx, activeWorkflowId, { status: true });
  } catch {
    // STATUS.md is best-effort and must never break state mutation responses.
  }
}

// ---------------------------------------------------------------------------
// Tool factory
// ---------------------------------------------------------------------------

export function createGoopStateTool(ctx: PluginContext): ToolDefinition {
  return tool({
    description:
      "Safe atomic state operations for GoopSpec workflow. Use this instead of directly editing state.json. " +
      "This is the ONLY sanctioned mutation boundary for workflow state.",
    args: {
      action: tool.schema.enum(STATE_ACTIONS),
      phase: tool.schema.string().optional(),
      mode: tool.schema.string().optional(),
      depth: tool.schema.string().optional(),
      autopilot: tool.schema.boolean().optional(),
      lazy: tool.schema.boolean().optional(),
      currentWave: tool.schema.number().optional(),
      totalWaves: tool.schema.number().optional(),
      workflowId: tool.schema.string().optional(),
      force: tool.schema.boolean().optional(),
      activate: tool.schema.boolean().optional(),
    },
    async execute(
      args: {
        action: StateAction;
        phase?: string;
        mode?: string;
        depth?: string;
        autopilot?: boolean;
        lazy?: boolean;
        currentWave?: number;
        totalWaves?: number;
        workflowId?: string;
        force?: boolean;
        activate?: boolean;
      },
      _context: ToolContext,
    ): Promise<string> {
      try {
        return executeAction(ctx, args);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        return `**Error (goop_state):** ${msg}`;
      }
    },
  });
}

// ---------------------------------------------------------------------------
// Action dispatcher
// ---------------------------------------------------------------------------

function executeAction(
  ctx: PluginContext,
  args: {
    action: StateAction;
    phase?: string;
    mode?: string;
    depth?: string;
    autopilot?: boolean;
    lazy?: boolean;
    currentWave?: number;
    totalWaves?: number;
    workflowId?: string;
    force?: boolean;
    activate?: boolean;
  },
): string {
  const { action } = args;
  const sm = ctx.stateManager;

  switch (action) {
    // -- Read ---------------------------------------------------------------
    case "get": {
      const state = sm.getState();
      const activeId = state.activeWorkflowId;
      const wf = state.workflows[activeId];
      if (!wf) return "No active workflow found.";
      const projectName = ctx.sdk.directory.split("/").pop() ?? ctx.sdk.directory;
      return formatGetResponse(activeId, wf, projectName, Object.keys(state.workflows));
    }

    // -- Phase transition ---------------------------------------------------
    case "transition": {
      if (!args.phase) return "**Error:** `phase` is required for transition.";
      if (!isValidPhase(args.phase)) {
        return `**Error:** Invalid phase "${args.phase}". Valid: ${WORKFLOW_PHASES.join(", ")}`;
      }
      sm.transitionPhase(args.phase, args.force ?? false);
      renderStatusAfterMutation(ctx);
      return `Phase transitioned to **${args.phase}**.`;
    }

    // -- Interview ----------------------------------------------------------
    case "complete-interview": {
      sm.completeInterview();
      renderStatusAfterMutation(ctx);
      return "Interview marked as **complete**.";
    }
    case "reset-interview": {
      sm.resetInterview();
      renderStatusAfterMutation(ctx);
      return "Interview status **reset**.";
    }

    // -- Spec lock ----------------------------------------------------------
    case "lock-spec": {
      sm.lockSpec();
      renderStatusAfterMutation(ctx);
      return "Specification **locked**. \u{1F512}";
    }
    case "unlock-spec": {
      sm.unlockSpec();
      renderStatusAfterMutation(ctx);
      return "Specification **unlocked**. \u{1F513}";
    }

    // -- Acceptance ---------------------------------------------------------
    case "confirm-acceptance": {
      sm.confirmAcceptance();
      renderStatusAfterMutation(ctx);
      return "Acceptance **confirmed**. \u2705";
    }
    case "reset-acceptance": {
      sm.resetAcceptance();
      renderStatusAfterMutation(ctx);
      return "Acceptance status **reset**.";
    }

    // -- Mode ---------------------------------------------------------------
    case "set-mode": {
      if (!args.mode) return "**Error:** `mode` is required for set-mode.";
      if (!isValidMode(args.mode)) {
        return `**Error:** Invalid mode "${args.mode}". Valid: ${TASK_MODES.join(", ")}`;
      }
      sm.setMode(args.mode);
      renderStatusAfterMutation(ctx);
      return `Mode set to **${args.mode}**.`;
    }

    // -- Depth --------------------------------------------------------------
    case "set-depth": {
      if (!args.depth) return "**Error:** `depth` is required for set-depth.";
      if (!isValidDepth(args.depth)) {
        return `**Error:** Invalid depth "${args.depth}". Valid: ${WORKFLOW_DEPTHS.join(", ")}`;
      }
      sm.setDepth(args.depth);
      renderStatusAfterMutation(ctx);
      return `Depth set to **${args.depth}**.`;
    }

    // -- Autopilot ----------------------------------------------------------
    case "set-autopilot": {
      if (args.autopilot == null) {
        return "**Error:** `autopilot` (boolean) is required for set-autopilot.";
      }
      sm.updateWorkflow({
        autopilot: args.autopilot,
        lazyAutopilot: args.autopilot ? (args.lazy ?? false) : false,
      });
      renderStatusAfterMutation(ctx);
      const label = args.autopilot ? `ON${args.lazy ? " (lazy)" : ""}` : "OFF";
      return `Autopilot set to **${label}**.`;
    }

    // -- Wave progress ------------------------------------------------------
    case "update-wave": {
      if (args.currentWave == null || args.totalWaves == null) {
        return "**Error:** `currentWave` and `totalWaves` are required for update-wave.";
      }
      sm.updateWaveProgress(args.currentWave, args.totalWaves);
      renderStatusAfterMutation(ctx);
      return `Wave progress updated to **${args.currentWave}/${args.totalWaves}**.`;
    }

    // -- Reset --------------------------------------------------------------
    case "reset": {
      sm.resetWorkflow();
      renderStatusAfterMutation(ctx);
      return "Active workflow **reset** to idle.";
    }

    // -- Workflow CRUD ------------------------------------------------------
    case "list-workflows": {
      const state = sm.getState();
      return formatWorkflowList(state.activeWorkflowId, state.workflows);
    }

    case "set-active-workflow": {
      if (!args.workflowId) {
        return "**Error:** `workflowId` is required for set-active-workflow.";
      }
      sm.setActiveWorkflow(args.workflowId);
      renderStatusAfterMutation(ctx);
      return `Active workflow switched to **${args.workflowId}**.`;
    }

    case "create-workflow": {
      if (!args.workflowId) {
        return "**Error:** `workflowId` is required for create-workflow.";
      }
      sm.createWorkflow(args.workflowId);
      if (args.activate) {
        sm.setActiveWorkflow(args.workflowId);
      }
      renderStatusAfterMutation(ctx);
      return args.activate
        ? `Workflow **${args.workflowId}** created and activated.`
        : `Workflow **${args.workflowId}** created.`;
    }

    default: {
      const exhaustive: never = action;
      return `**Error:** Unknown action "${exhaustive as string}".`;
    }
  }
}
