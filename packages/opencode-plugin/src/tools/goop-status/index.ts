import { tool } from "../../core/sdk-compat.js";
import type { ToolContext, ToolDefinition } from "../../core/sdk-compat.js";
import type { PluginContext, WorkflowState } from "../../core/types.js";

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

const PHASE_ICONS: Record<string, string> = {
  idle: "\u{1F52E}",
  discuss: "\u{1F4AC}",
  plan: "\u{1F4CB}",
  execute: "\u26A1",
  accept: "\u2705",
};

function phaseIcon(phase: string): string {
  return PHASE_ICONS[phase] ?? "\u{1F52E}";
}

function progressBar(current: number, total: number, width = 10): string {
  if (total <= 0) return "";
  const ratio = Math.min(current / total, 1);
  const filled = Math.round(ratio * width);
  const empty = width - filled;
  return `[${"█".repeat(filled)}${"░".repeat(empty)}] ${current}/${total}`;
}

function flag(value: boolean, label: string): string {
  return value ? `\u2713 ${label}` : `\u2717 ${label}`;
}

// ---------------------------------------------------------------------------
// Phase guidance
// ---------------------------------------------------------------------------

interface PhaseGuidance {
  description: string;
  next: string;
  command: string;
}

function getPhaseGuidance(wf: WorkflowState): PhaseGuidance {
  switch (wf.phase) {
    case "idle":
      return {
        description: "No active workflow. Ready for a new task.",
        next: "Start planning a new feature or task",
        command: "/goop-discuss",
      };
    case "discuss":
      return {
        description: "Gathering requirements through conversation.",
        next: "Create specification and execution plan",
        command: "/goop-plan",
      };
    case "plan":
      return {
        description: "Creating specification and execution blueprint.",
        next: wf.specLocked
          ? "Begin wave-based implementation"
          : "Confirm and lock the specification, then execute",
        command: wf.specLocked ? "/goop-execute" : "/goop-plan",
      };
    case "execute":
      return {
        description: "Implementing the blueprint in waves.",
        next: "Verify work and request acceptance",
        command: "/goop-accept",
      };
    case "accept":
      return {
        description: "Verifying implementation against specification.",
        next: "Complete acceptance after user approval",
        command: "/goop-accept",
      };
    default:
      return {
        description: "Unknown phase.",
        next: "Check current state",
        command: "/goop-status",
      };
  }
}

// ---------------------------------------------------------------------------
// Status formatter
// ---------------------------------------------------------------------------

export function formatStatus(
  activeId: string,
  wf: WorkflowState,
  allIds: string[],
  projectDir: string,
): string {
  const guidance = getPhaseGuidance(wf);
  const lines: string[] = [];

  lines.push("## \u{1F52E} GoopSpec \u00B7 Status");
  lines.push("");

  // Core state
  lines.push(`- **Project:** ${projectDir.split("/").pop() ?? projectDir}`);
  lines.push(`- **Workflow:** ${activeId} | **Phase:** ${phaseIcon(wf.phase)} ${wf.phase}`);
  lines.push(`- **Mode:** ${wf.mode} | **Depth:** ${wf.depth}`);

  // Flags
  lines.push(
    `- ${flag(wf.interviewComplete, "Interview")} | ${flag(wf.specLocked, "Spec Locked")} | ${flag(wf.acceptanceConfirmed, "Accepted")}`,
  );

  // Autopilot
  if (wf.autopilot) {
    lines.push(`- **Autopilot:** ON${wf.lazyAutopilot ? " (lazy)" : ""}`);
  }

  // Wave progress
  if (wf.totalWaves > 0) {
    lines.push("");
    lines.push("### Wave Progress");
    lines.push(`${progressBar(wf.currentWave, wf.totalWaves)}`);
  }

  // Checkpoint
  if (wf.checkpoint) {
    lines.push(`- **Checkpoint:** ${wf.checkpoint}`);
  }

  // Guidance
  lines.push("");
  lines.push("### Current Phase");
  lines.push(`${guidance.description}`);
  lines.push("");
  lines.push(`**Next:** ${guidance.next}`);
  lines.push(`**Command:** \`${guidance.command}\``);

  // Multi-workflow summary
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

// ---------------------------------------------------------------------------
// Tool factory
// ---------------------------------------------------------------------------

export function createGoopStatusTool(ctx: PluginContext): ToolDefinition {
  return tool({
    description:
      "Show current GoopSpec workflow state, phase, progress, and next steps. " +
      "Use this to understand where the workflow is and what to do next.",
    args: {
      verbose: tool.schema.boolean().optional(),
    },
    async execute(_args: { verbose?: boolean }, _context: ToolContext): Promise<string> {
      try {
        const state = ctx.stateManager.getState();
        const activeId = state.activeWorkflowId;
        const wf = state.workflows[activeId];

        if (!wf) {
          return "## \u{1F52E} GoopSpec \u00B7 Status\n\nNo active workflow found. Run `/goop-discuss` to start.";
        }

        const allIds = ctx.stateManager.listWorkflowIds();
        return formatStatus(activeId, wf, allIds, ctx.sdk.directory);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        return `## \u{1F52E} GoopSpec \u00B7 Status\n\n**Error:** ${msg}`;
      }
    },
  });
}
