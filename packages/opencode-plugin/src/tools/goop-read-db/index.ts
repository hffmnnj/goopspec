/**
 * goop_read_db tool — read workflow documents from the GoopSpecDB.
 *
 * Supports single-doc mode (doc_type) and batch mode (doc_types) for loading
 * multiple documents in one call. Returns raw markdown content or clear
 * "not found" messages.
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
      "Read workflow documents from the GoopSpecDB.\n\n" +
      "Args:\n" +
      "- doc_type: Single document type (spec, blueprint, chronicle, adl, handoff, requirements, research)\n" +
      "- doc_types: Array of document types for batch loading (e.g. [\"spec\", \"blueprint\"])\n" +
      "- workflow_id: Optional workflow ID (defaults to active workflow)\n\n" +
      "Provide either doc_type (single) or doc_types (batch). " +
      "Batch mode returns each document under a ## heading separated by ---.",
    args: {
      doc_type: tool.schema.string().optional(),
      doc_types: tool.schema.array(tool.schema.string()).optional(),
      workflow_id: tool.schema.string().optional(),
    },
    async execute(
      args: {
        doc_type?: string;
        doc_types?: string[];
        workflow_id?: string;
      },
      _context: ToolContext,
    ): Promise<string> {
      try {
        const workflowId =
          args.workflow_id ?? ctx.stateManager.getState().activeWorkflowId;

        // Determine which types to load
        const hasBatch = args.doc_types && args.doc_types.length > 0;
        const hasSingle = args.doc_type !== undefined && args.doc_type !== "";

        if (hasBatch) {
          // Batch mode — validate all entries
          const requestedTypes = args.doc_types!;
          const invalid = requestedTypes.filter(
            (t) => !DOC_TYPES.includes(t as DocType),
          );
          if (invalid.length > 0) {
            return `Unknown doc_type(s): ${invalid.join(", ")}. Valid types: ${DOC_TYPES.join(", ")}`;
          }

          // Load all docs
          const sections = requestedTypes.map((docType) => {
            const doc = ctx.db.getDocument(workflowId, docType as DocType);
            const content =
              doc?.content ??
              `_(No ${docType} document found. Use goop_write_db to create it.)_`;
            return `## ${docType}\n\n${content}`;
          });

          return sections.join("\n\n---\n\n");
        }

        if (hasSingle) {
          // Single mode — validate and load
          if (!DOC_TYPES.includes(args.doc_type as DocType)) {
            return `Unknown doc_type: ${args.doc_type}. Valid types: ${DOC_TYPES.join(", ")}`;
          }

          const doc = ctx.db.getDocument(
            workflowId,
            args.doc_type as DocType,
          );

          if (doc) {
            return doc.content;
          }

          return `No ${args.doc_type} document found for workflow '${workflowId}'. Use goop_write_db to create it.`;
        }

        return `Provide doc_type or doc_types. Valid types: ${DOC_TYPES.join(", ")}`;
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        return `Error in goop_read_db: ${msg}`;
      }
    },
  });
}
