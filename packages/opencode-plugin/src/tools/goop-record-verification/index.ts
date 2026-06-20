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

const VERIFICATION_CHECK_NAMES = ["typecheck", "test", "lint", "custom"] as const;
type VerificationCheckName = (typeof VERIFICATION_CHECK_NAMES)[number];

const VERIFICATION_TOOL_STATUSES = ["pass", "fail", "skip"] as const;
type VerificationToolStatus = (typeof VERIFICATION_TOOL_STATUSES)[number];

// ---------------------------------------------------------------------------
// Tool factory
// ---------------------------------------------------------------------------

export function createGoopRecordVerificationTool(ctx: PluginContext): ToolDefinition {
  return tool({
    description:
      "Record a workflow verification check result in GoopSpecDB.\n\n" +
      "Args:\n" +
      "- check_name: Verification check name (typecheck, test, lint, custom)\n" +
      "- status: Check status (pass, fail, skip)\n" +
      "- wave_id: Optional wave ID to associate with the check\n" +
      "- detail: Optional check details\n" +
      "- workflow_id: Optional workflow ID (defaults to active workflow)",
    args: {
      check_name: tool.schema.enum(VERIFICATION_CHECK_NAMES),
      status: tool.schema.enum(VERIFICATION_TOOL_STATUSES),
      wave_id: tool.schema.number().optional(),
      detail: tool.schema.string().optional(),
      workflow_id: tool.schema.string().optional(),
    },
    async execute(
      args: {
        check_name: VerificationCheckName;
        status: VerificationToolStatus;
        wave_id?: number;
        detail?: string;
        workflow_id?: string;
      },
      _context: ToolContext,
    ): Promise<string> {
      try {
        const workflowId = args.workflow_id ?? ctx.stateManager.getState().activeWorkflowId;

        const verificationId = ctx.db.insertVerification(workflowId, {
          wave_id: args.wave_id,
          check_name: args.check_name,
          status: args.status,
          detail: args.detail,
        });

        ctx.db.appendEvent(workflowId, "verification_record", {
          verification_id: verificationId,
          wave_id: args.wave_id ?? null,
          check_name: args.check_name,
          status: args.status,
          detail: args.detail ?? null,
          timestamp: Date.now(),
        });

        const waveLabel = args.wave_id === undefined ? "workflow" : `wave ${args.wave_id}`;
        return (
          `Recorded ${args.check_name}=${args.status} verification for ${waveLabel} ` +
          `in workflow '${workflowId}'.`
        );
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        return `Error in goop_record_verification: ${msg}`;
      }
    },
  });
}
