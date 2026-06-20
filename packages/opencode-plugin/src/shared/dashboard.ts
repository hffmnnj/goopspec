import type { PluginContext, WorkflowState } from "../core/types.js";

interface DashboardRow {
  workflowId: string;
  active: boolean;
  phase: string;
  wave: string;
  openBlockers: number;
  lastActivity: number | null;
}

function escapeMarkdownCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function formatLastActivity(value: number | null): string {
  if (value === null) return "—";
  return new Date(value * 1000).toISOString();
}

function workflowWave(wf: WorkflowState | undefined): string {
  if (!wf) return "0/0";
  return `${wf.currentWave}/${wf.totalWaves}`;
}

function compareLastActivityDesc(a: DashboardRow, b: DashboardRow): number {
  if (a.lastActivity === b.lastActivity) return a.workflowId.localeCompare(b.workflowId);
  if (a.lastActivity === null) return 1;
  if (b.lastActivity === null) return -1;
  return b.lastActivity - a.lastActivity;
}

export function buildDashboard(ctx: PluginContext): string {
  try {
    const state = ctx.stateManager.getState();
    const summaries = ctx.db.getWorkflowSummaries();
    const summaryById = new Map(summaries.map((summary) => [summary.workflow_id, summary]));
    const workflowIds = new Set([...Object.keys(state.workflows), ...summaryById.keys()]);

    const rows: DashboardRow[] = [...workflowIds].map((workflowId) => {
      const wf = state.workflows[workflowId];
      const summary = summaryById.get(workflowId);
      return {
        workflowId,
        active: workflowId === state.activeWorkflowId,
        phase: wf?.phase ?? "unknown",
        wave: workflowWave(wf),
        openBlockers: summary?.open_blockers ?? 0,
        lastActivity: summary?.last_activity ?? null,
      };
    });

    rows.sort(compareLastActivityDesc);

    const lines = [
      "# Workflow Dashboard",
      "",
      "| Workflow | Phase | Wave | Open Blockers | Last Activity |",
      "|----------|-------|------|---------------|---------------|",
      ...rows.map((row) => {
        const workflow = `${row.active ? "▶ " : ""}${row.workflowId}`;
        return `| ${escapeMarkdownCell(workflow)} | ${escapeMarkdownCell(row.phase)} | ${escapeMarkdownCell(row.wave)} | ${row.openBlockers} | ${formatLastActivity(row.lastActivity)} |`;
      }),
    ];

    return lines.join("\n");
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return `Error in goop_dashboard: ${msg}`;
  }
}
