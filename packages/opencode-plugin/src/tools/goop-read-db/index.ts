/**
 * goop_read_db tool — read a workflow document from the GoopSpecDB.
 *
 * Retrieves document content by doc_type for a given workflow (defaults to
 * the active workflow). Returns the raw markdown content or a clear
 * "not found" message.
 *
 * @module tools/goop-read-db
 */

import { DOC_TYPES } from "../../features/db/types.js";
import type { DocType } from "../../features/db/types.js";
import { tool } from "../../core/sdk-compat.js";
import type { ToolContext, ToolDefinition } from "../../core/sdk-compat.js";
import type { PluginContext } from "../../core/types.js";

// ---------------------------------------------------------------------------
// Tool factory
// ---------------------------------------------------------------------------

export function createGoopReadDbTool(ctx: PluginContext): ToolDefinition {
  return tool({
    description:
      "Read a workflow document from the GoopSpecDB by doc_type.\n\n" +
      "Args:\n" +
      "- doc_type: Document type (spec, blueprint, chronicle, adl, handoff, requirements, research)\n" +
      "- workflow_id: Optional workflow ID (defaults to active workflow)",
    args: {
      doc_type: tool.schema.enum(DOC_TYPES),
      workflow_id: tool.schema.string().optional(),
    },
    async execute(
      args: {
        doc_type: DocType;
        workflow_id?: string;
      },
      _context: ToolContext,
    ): Promise<string> {
      try {
        const workflowId =
          args.workflow_id ?? ctx.stateManager.getState().activeWorkflowId;

        const doc = ctx.db.getDocument(workflowId, args.doc_type);

        if (doc) {
          return doc.content;
        }

        return `No ${args.doc_type} document found for workflow '${workflowId}'. Use goop_write_db to create it.`;
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        return `Error in goop_read_db: ${msg}`;
      }
    },
  });
}
