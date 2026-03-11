/**
 * GoopSpec Status Tool
 * Shows current workflow state, phase, and pending tasks
 * 
 * @module tools/goop-status
 */

import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool";
import type { PluginContext, GoopState, ToolContext } from "../../core/types.js";
import { getActiveAgents } from "../../features/team/registry.js";

/**
 * Generate a text progress bar
 */
function generateProgressBar(progress: number, width: number = 10): string {
  const filled = Math.round(progress * width);
  const empty = width - filled;
  return `[${"█".repeat(filled)}${"░".repeat(empty)}]`;
}

interface PhaseGuidance {
  current: string;
  next: { command: string; description: string };
  alternatives: Array<{ command: string; when: string }>;
}

/**
 * Get guidance for current phase including next steps
 */
function getPhaseGuidance(phase: string, specLocked: boolean): PhaseGuidance {
  const guidance: Record<string, PhaseGuidance> = {
    idle: {
      current: "No active workflow. Ready for a new task.",
      next: { command: "/goop-plan", description: "Start planning a new feature or task" },
      alternatives: [
        { command: "/goop-quick", when: "for small, well-defined fixes" },
        { command: "/goop-resume", when: "to continue from a saved checkpoint" },
      ],
    },
    plan: {
      current: "Gathering requirements and defining scope.",
      next: { command: "/goop-execute", description: "Begin implementation after plan confirmation and spec lock" },
      alternatives: [
        { command: "/goop-research", when: "if there are unknowns to investigate" },
        { command: "/goop-pause", when: "to save progress and continue later" },
      ],
    },
    research: {
      current: "Investigating unknowns and gathering technical context.",
      next: { command: "/goop-plan", description: "Integrate research findings and finalize the plan" },
      alternatives: [
        { command: "/goop-execute", when: "if planning is finalized and spec is already locked" },
        { command: "/goop-research", when: "for additional research on related topics" },
      ],
    },
    specify: specLocked ? {
      current: "Specification is locked. Ready for implementation.",
      next: { command: "/goop-execute", description: "Begin wave-based implementation" },
      alternatives: [
        { command: "/goop-amend", when: "to modify the locked specification" },
      ],
    } : {
      current: "Reviewing specification before locking.",
      next: { command: "/goop-plan", description: "Return to planning to confirm and lock the specification" },
      alternatives: [
        { command: "/goop-plan", when: "to revise requirements" },
      ],
    },
    execute: {
      current: "Implementing the blueprint in waves.",
      next: { command: "/goop-accept", description: "Verify work and request acceptance when complete" },
      alternatives: [
        { command: "/goop-status", when: "to check wave progress" },
        { command: "/goop-pause", when: "to save a checkpoint and continue later" },
      ],
    },
    accept: {
      current: "Verifying implementation against specification.",
      next: { command: "/goop-accept", description: "Complete acceptance and finalize archival after explicit user approval" },
      alternatives: [
        { command: "/goop-execute", when: "if issues need to be fixed" },
        { command: "/goop-milestone", when: "to start the next milestone" },
      ],
    },
  };
  
  return guidance[phase] || {
    current: "Unknown phase.",
    next: { command: "/goop-status", description: "Check current state" },
    alternatives: [],
  };
}

/**
 * Format next steps from phase guidance
 */
function formatNextSteps(guidance: PhaseGuidance): string[] {
  const lines: string[] = [];
  
  lines.push(`**Current:** ${guidance.current}`);
  lines.push("");
  lines.push(`👉 **Next:** \`${guidance.next.command}\` - ${guidance.next.description}`);
  
  if (guidance.alternatives.length > 0) {
    lines.push("");
    lines.push("**Alternatives:**");
    for (const alt of guidance.alternatives) {
      lines.push(`- \`${alt.command}\` ${alt.when}`);
    }
  }
  
  return lines;
}

/**
 * Format workflow status for display
 */
async function formatStatus(state: GoopState | null, verbose: boolean, ctx: PluginContext): Promise<string> {
  const lines: string[] = [];
  
  // Handle missing or incomplete state
  if (!state) {
    lines.push("## 🔮 GoopSpec · Status");
    lines.push("");
    lines.push("⏳ Not initialized");
    lines.push("");
    lines.push("→ Run `/goop-discuss` to start a new project.");
    lines.push("");
    lines.push("---");
    return lines.join("\n");
  }
  
  // Project info
  const projectName = state.project?.name || "Unknown";
  const initialized = state.project?.initialized || "Not set";
  
  // Workflow status with new fields
  const workflow = state.workflow || { 
    phase: "idle", 
    mode: "standard",
    depth: "standard",
    researchOptIn: false,
    specLocked: false,
    acceptanceConfirmed: false,
    currentWave: 0,
    totalWaves: 0,
    lastActivity: "Never" 
  };

  // Phase display with visual indicator
  const phaseIcons: Record<string, string> = {
    idle: "⚪",
    plan: "📝",
    research: "🔍",
    specify: "📋",
    execute: "🔨",
    accept: "✅",
  };

  // Mode display with icon
  const modeIcons: Record<string, string> = {
    quick: "⚡",
    standard: "📦",
    comprehensive: "🏗️",
    milestone: "🎯",
  };

  // Build workflows section (shared between compact and verbose)
  const workflows = ctx.stateManager.listWorkflows?.() ?? [];
  const activeWorkflowId = ctx.stateManager.getActiveWorkflowId?.() ?? "default";

  let workflowsSection = "";
  if (workflows.length > 1) {
    const rows = workflows.map(wf => {
      const prefix = wf.isActive ? "►" : " ";
      return `${prefix} ${wf.workflowId}`;
    }).join(", ");
    workflowsSection = `\n- **Workflows:** ${workflows.length} active (${rows})`;
  } else if (workflows.length === 1) {
    workflowsSection = `\n- **Workflow:** ${activeWorkflowId}`;
  }

  if (!verbose) {
    lines.push("## 🔮 GoopSpec · Status");
    lines.push(`**Project:** ${projectName}`);

    const phaseIcon = phaseIcons[workflow.phase] || "⚪";
    const modeIcon = modeIcons[workflow.mode] || "📦";
    lines.push(`- **Phase:** ${phaseIcon} ${workflow.phase || "idle"} | **Mode:** ${modeIcon} ${workflow.mode || "standard"}`);

    const interviewComplete = workflow.interviewComplete;
    const interviewStatus = interviewComplete ? "✅" : "⏳";
    const specStatus = workflow.specLocked ? "🔒" : "🔓";
    const acceptedStatus = workflow.acceptanceConfirmed ? "✅" : "⏳";
    lines.push(`- **Interview:** ${interviewStatus} | **Spec:** ${specStatus} | **Accepted:** ${acceptedStatus}`);

    if (workflow.totalWaves > 0) {
      const progress = workflow.currentWave / workflow.totalWaves;
      const progressBar = generateProgressBar(progress);
      lines.push(`- **Wave:** ${workflow.currentWave}/${workflow.totalWaves} ${progressBar}`);
    }

    if (workflowsSection) {
      lines.push(workflowsSection);
    }

    const activeAgents = await getActiveAgents();
    if (activeAgents.length > 0) {
      lines.push("");
      lines.push("## Active Agents");
      for (const agent of activeAgents) {
        const rawTaskSummary = agent.task?.trim() || "No task specified";
        const taskSummary = rawTaskSummary.length > 80
          ? `${rawTaskSummary.slice(0, 77)}...`
          : rawTaskSummary;
        const fileCount = agent.claimedFiles.length;
        const fileLabel = fileCount === 1 ? "file" : "files";
        lines.push(`- **${agent.type}** — ${taskSummary} [${fileCount} ${fileLabel}]`);
      }
    }

    const guidance = getPhaseGuidance(workflow.phase, workflow.specLocked);
    lines.push("");
    lines.push(`→ Next: \`${guidance.next.command}\` — ${guidance.next.description}`);

    return lines.join("\n");
  }

  lines.push("## 🔮 GoopSpec · Status");
  lines.push(`**Project:** ${projectName} | **Initialized:** ${initialized}`);

  const phaseIcon = phaseIcons[workflow.phase] || "⚪";
  const modeIcon = modeIcons[workflow.mode] || "📦";
  lines.push(`- **Phase:** ${phaseIcon} ${workflow.phase || "idle"} | **Mode:** ${modeIcon} ${workflow.mode || "standard"}`);

  const interviewComplete = workflow.interviewComplete;
  const interviewStatus = interviewComplete ? "✅" : "⏳";
  const specStatus = workflow.specLocked ? "🔒" : "🔓";
  const acceptedStatus = workflow.acceptanceConfirmed ? "✅" : "⏳";
  lines.push(`- **Interview:** ${interviewStatus} | **Spec:** ${specStatus} | **Accepted:** ${acceptedStatus}`);

  if (workflow.totalWaves > 0) {
    const progress = workflow.currentWave / workflow.totalWaves;
    const progressBar = generateProgressBar(progress);
    lines.push(`- **Wave:** ${workflow.currentWave}/${workflow.totalWaves} ${progressBar}`);
  }

  if (workflowsSection) {
    lines.push(workflowsSection);
  }

  // Verbose: detailed workflow table when multiple workflows exist
  if (workflows.length > 1) {
    lines.push("");
    lines.push("### Workflows");
    lines.push(`| | ID | Phase | Wave | Spec |`);
    lines.push(`|---|---|---|---|---|`);
    for (const wf of workflows) {
      const prefix = wf.isActive ? "►" : " ";
      const spec = wf.specLocked ? "🔒" : "🔓";
      lines.push(`| ${prefix} | ${wf.workflowId} | ${wf.phase} | ${wf.currentWave}/${wf.totalWaves} | ${spec} |`);
    }
  }

  const execution = state.execution || {
    completedPhases: [],
    activeCheckpointId: null,
    pendingTasks: [],
    currentMilestone: undefined,
  };

  lines.push(`- **Last Activity:** ${workflow.lastActivity || "Never"}`);
  lines.push(`- **Checkpoint:** ${execution.activeCheckpointId || "None"}`);

  const phases = execution.completedPhases || [];
  const phaseCount = phases.length;
  let phaseSummary = "None";
  if (phaseCount > 0) {
    const lastThree = phases.slice(-3).join(" → ");
    phaseSummary = phaseCount <= 3
      ? `${phaseCount} ${phaseCount === 1 ? "phase" : "phases"} (${lastThree})`
      : `${phaseCount} phases (... → ${lastThree})`;
  }
  lines.push(`- **Phases:** ${phaseSummary}`);
  lines.push(`- **Pending Tasks:** ${execution.pendingTasks?.length || 0}`);

  if (execution.pendingTasks?.length > 0) {
    for (const task of execution.pendingTasks) {
      const statusIcon = {
        pending: "⏳",
        in_progress: "🔄",
        completed: "✅",
        failed: "❌",
      }[task.status] || "⏳";
      lines.push(`  - ${statusIcon} ${task.name} (${task.status})`);
    }
  }

  const activeAgents = await getActiveAgents();
  if (activeAgents.length > 0) {
    lines.push("");
    lines.push("## Active Agents");
    for (const agent of activeAgents) {
      const rawTaskSummary = agent.task?.trim() || "No task specified";
      const taskSummary = rawTaskSummary.length > 80
        ? `${rawTaskSummary.slice(0, 77)}...`
        : rawTaskSummary;
      const fileCount = agent.claimedFiles.length;
      const fileLabel = fileCount === 1 ? "file" : "files";
      lines.push(`- **${agent.type}** — ${taskSummary} [${fileCount} ${fileLabel}]`);
    }
  }

  const guidance = getPhaseGuidance(workflow.phase, workflow.specLocked);
  void formatNextSteps(guidance);
  lines.push("");
  lines.push(`→ Next: \`${guidance.next.command}\` — ${guidance.next.description}`);
  if (guidance.alternatives.length > 0) {
    const altSummary = guidance.alternatives
      .slice(0, 2)
      .map((alt) => `\`${alt.command}\` ${alt.when}`)
      .join(", ");
    lines.push(`**Also:** ${altSummary}`);
  }

  return lines.join("\n");
}

/**
 * Create the goop_status tool
 */
export function createGoopStatusTool(ctx: PluginContext): ToolDefinition {
  return tool({
    description: "Show current GoopSpec workflow state, phase, and pending tasks",
    args: {
      verbose: tool.schema.boolean().optional(),
    },
    async execute(args, _context: ToolContext): Promise<string> {
      const state = ctx.stateManager.getState();
      return await formatStatus(state, args.verbose ?? false, ctx);
    },
  });
}
