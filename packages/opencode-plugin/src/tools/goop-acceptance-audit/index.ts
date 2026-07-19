/**
 * goop_acceptance_audit tool — one-call acceptance gate audit.
 *
 * Combines blockers, verifications, and waves into a single read-only result
 * for the /goop-accept gate. Does not mutate state or render sidecars.
 *
 * @module tools/goop-acceptance-audit
 */

import { tool } from "../../core/sdk-compat.js";
import type { ToolContext, ToolDefinition } from "../../core/sdk-compat.js";
import type { PluginContext } from "../../core/types.js";
import type { BlockerRow, VerificationRow } from "../../features/db/types.js";
import { formatWaves } from "../../features/db/wave-format.js";

// ---------------------------------------------------------------------------
// Blocker formatting (mirrors goop-blocker)
// ---------------------------------------------------------------------------

function formatTimestamp(value: number | null): string {
  return value === null ? "none" : new Date(value * 1000).toISOString();
}

function formatBlocker(blocker: BlockerRow): string {
  return [
    `- #${blocker.id} [${blocker.severity}] ${blocker.status}`,
    `  - Description: ${blocker.description}`,
    `  - Wave: ${blocker.wave_id ?? "none"}`,
    `  - Resolution: ${blocker.resolution ?? "none"}`,
    `  - Created: ${formatTimestamp(blocker.created_at)}`,
    `  - Resolved: ${formatTimestamp(blocker.resolved_at)}`,
  ].join("\n");
}

function formatBlockers(workflowId: string, rows: BlockerRow[]): string {
  if (rows.length === 0) {
    return `No open blockers for workflow '${workflowId}'.`;
  }

  return `# Blockers\n\n${rows.map(formatBlocker).join("\n\n")}`;
}

// ---------------------------------------------------------------------------
// Verification formatting
// ---------------------------------------------------------------------------

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

export function createGoopAcceptanceAuditTool(ctx: PluginContext): ToolDefinition {
  return tool({
    description: "One-call acceptance gate audit combining blockers, verifications, and waves.",
    args: {
      workflow_id: tool.schema.string().optional(),
      wave_ids: tool.schema.array(tool.schema.number()).optional(),
      include_all_blockers: tool.schema.boolean().optional(),
    },
    async execute(
      args: {
        workflow_id?: string;
        wave_ids?: number[];
        include_all_blockers?: boolean;
      },
      _context: ToolContext,
    ): Promise<string> {
      try {
        const workflowId = args.workflow_id ?? ctx.stateManager.getState().activeWorkflowId;
        const waveIds = args.wave_ids;
        const blockerStatus = args.include_all_blockers ? undefined : "open";

        const blockers = ctx.db.getBlockers(workflowId, blockerStatus);
        const verifications =
          waveIds !== undefined && waveIds.length > 0
            ? ctx.db.getVerifications(workflowId, undefined, waveIds)
            : ctx.db.getVerifications(workflowId);
        const waves =
          waveIds !== undefined && waveIds.length > 0
            ? ctx.db.getWaves(workflowId, waveIds)
            : ctx.db.getWaves(workflowId);

        const result = {
          blockers: formatBlockers(workflowId, blockers),
          verifications: formatVerifications(workflowId, verifications),
          waves: formatWaves(ctx.db, workflowId, waves, waveIds),
        };

        return `<!--\n${JSON.stringify(result, null, 2)}\n-->`;
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        return `Error in goop_acceptance_audit: ${msg}`;
      }
    },
  });
}
