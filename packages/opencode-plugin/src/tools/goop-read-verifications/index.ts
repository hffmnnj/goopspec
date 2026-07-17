/**
 * goop_read_verifications tool — read workflow verification check results.
 *
 * Returns a concise markdown report with a summary line for acceptance gates.
 *
 * @module tools/goop-read-verifications
 */

import { tool } from "../../core/sdk-compat.js";
import type { ToolContext, ToolDefinition } from "../../core/sdk-compat.js";
import type { PluginContext } from "../../core/types.js";
import type { VerificationRow } from "../../features/db/types.js";

function isFailingStatus(status: string): boolean {
  return status === "fail" || status === "failed";
}

function formatCreatedAt(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toISOString();
}

function compareVerifications(a: VerificationRow, b: VerificationRow): number {
  const aWave = a.wave_id ?? Number.MAX_SAFE_INTEGER;
  const bWave = b.wave_id ?? Number.MAX_SAFE_INTEGER;
  if (aWave !== bWave) return aWave - bWave;
  if (a.created_at !== b.created_at) return a.created_at - b.created_at;
  return a.id - b.id;
}

function formatVerificationGroup(waveLabel: string, rows: VerificationRow[]): string {
  const lines = [`### ${waveLabel}`];
  for (const row of rows) {
    const detail = row.detail ? ` — ${row.detail}` : "";
    const wave = row.wave_id === null ? "workflow" : `wave_id=${row.wave_id}`;
    lines.push(
      `- ${formatCreatedAt(row.created_at)} — ${row.check_name}: ${row.status} (${wave})${detail}`,
    );
  }
  return lines.join("\n");
}

function formatVerifications(workflowId: string, rows: VerificationRow[]): string {
  if (rows.length === 0) {
    return `No verifications found for workflow '${workflowId}'.`;
  }

  const sortedRows = [...rows].sort(compareVerifications);
  const failingCount = sortedRows.filter((row) => isFailingStatus(row.status)).length;
  const statusLine = failingCount === 0 ? "Status: all green" : `Status: ${failingCount} failing`;
  const groups = new Map<string, VerificationRow[]>();

  for (const row of sortedRows) {
    const key = row.wave_id === null ? "Workflow" : `Wave ${row.wave_id}`;
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }

  return [
    `# Verifications for ${workflowId}`,
    statusLine,
    "",
    ...[...groups].map(([key, group]) => formatVerificationGroup(key, group)),
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Tool factory
// ---------------------------------------------------------------------------

export function createGoopReadVerificationsTool(ctx: PluginContext): ToolDefinition {
  return tool({
    description: "Read workflow verification check results from GoopSpecDB.",
    args: {
      wave_id: tool.schema.number().optional(),
      wave_ids: tool.schema.array(tool.schema.number()).optional(),
      workflow_id: tool.schema.string().optional(),
    },
    async execute(
      args: {
        wave_id?: number;
        wave_ids?: number[];
        workflow_id?: string;
      },
      _context: ToolContext,
    ): Promise<string> {
      try {
        const workflowId = args.workflow_id ?? ctx.stateManager.getState().activeWorkflowId;
        const hasBatch = args.wave_ids !== undefined && args.wave_ids.length > 0;
        const verifications = hasBatch
          ? ctx.db.getVerifications(workflowId, undefined, args.wave_ids)
          : ctx.db.getVerifications(workflowId, args.wave_id);
        return formatVerifications(workflowId, verifications);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        return `Error in goop_read_verifications: ${msg}`;
      }
    },
  });
}
