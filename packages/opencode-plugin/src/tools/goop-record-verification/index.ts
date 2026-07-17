/**
 * goop_record_verification tool — record a workflow verification check result.
 *
 * Persists per-wave verification outcomes to GoopSpecDB and logs a
 * verification_record event for auditability.
 *
 * @module tools/goop-record-verification
 */

import { tool } from "../../core/sdk-compat.js";
import type { ToolContext, ToolDefinition } from "../../core/sdk-compat.js";
import type { PluginContext } from "../../core/types.js";
import { formatBatchResult, runBatch } from "../../features/db/batch.js";

const VERIFICATION_CHECK_NAMES = ["typecheck", "test", "lint", "custom"] as const;
type VerificationCheckName = (typeof VERIFICATION_CHECK_NAMES)[number];

const VERIFICATION_TOOL_STATUSES = ["pass", "fail", "skip"] as const;
type VerificationToolStatus = (typeof VERIFICATION_TOOL_STATUSES)[number];

interface VerificationPayload {
  check_name: VerificationCheckName;
  status: VerificationToolStatus;
  wave_id?: number;
  detail?: string;
  workflow_id?: string;
}

// ---------------------------------------------------------------------------
// Per-item processing
// ---------------------------------------------------------------------------

function processVerificationItem(
  ctx: PluginContext,
  defaultWorkflowId: string,
  item: VerificationPayload,
): string {
  const workflowId = item.workflow_id ?? defaultWorkflowId;

  const verificationId = ctx.db.insertVerification(workflowId, {
    wave_id: item.wave_id,
    check_name: item.check_name,
    status: item.status,
    detail: item.detail,
  });

  ctx.db.appendEvent(workflowId, "verification_record", {
    verification_id: verificationId,
    wave_id: item.wave_id ?? null,
    check_name: item.check_name,
    status: item.status,
    detail: item.detail ?? null,
    timestamp: Date.now(),
  });

  const waveLabel = item.wave_id === undefined ? "workflow" : `wave ${item.wave_id}`;
  return (
    `Recorded ${item.check_name}=${item.status} verification for ${waveLabel} ` +
    `in workflow '${workflowId}'.`
  );
}

// ---------------------------------------------------------------------------
// Tool factory
// ---------------------------------------------------------------------------

export function createGoopRecordVerificationTool(ctx: PluginContext): ToolDefinition {
  return tool({
    description: "Record a workflow verification check result in GoopSpecDB.",
    args: {
      check_name: tool.schema.enum(VERIFICATION_CHECK_NAMES).optional(),
      status: tool.schema.enum(VERIFICATION_TOOL_STATUSES).optional(),
      wave_id: tool.schema.number().optional(),
      detail: tool.schema.string().optional(),
      workflow_id: tool.schema.string().optional(),
      items: tool.schema
        .array(
          tool.schema.object({
            check_name: tool.schema.enum(VERIFICATION_CHECK_NAMES),
            status: tool.schema.enum(VERIFICATION_TOOL_STATUSES),
            wave_id: tool.schema.number().optional(),
            detail: tool.schema.string().optional(),
            workflow_id: tool.schema.string().optional(),
          }),
        )
        .optional(),
    },
    async execute(
      args: {
        check_name?: VerificationCheckName;
        status?: VerificationToolStatus;
        wave_id?: number;
        detail?: string;
        workflow_id?: string;
        items?: VerificationPayload[];
      },
      _context: ToolContext,
    ): Promise<string> {
      try {
        const workflowId = args.workflow_id ?? ctx.stateManager.getState().activeWorkflowId;

        if (args.items !== undefined) {
          const result = runBatch(ctx.db, args.items, (item) =>
            processVerificationItem(ctx, workflowId, item),
          );
          return formatBatchResult(result, "record-verification");
        }

        if (args.check_name === undefined || args.status === undefined) {
          return "Error: 'check_name' and 'status' are required when no items batch is provided.";
        }

        return processVerificationItem(ctx, workflowId, {
          check_name: args.check_name,
          status: args.status,
          wave_id: args.wave_id,
          detail: args.detail,
        });
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        return `Error in goop_record_verification: ${msg}`;
      }
    },
  });
}
