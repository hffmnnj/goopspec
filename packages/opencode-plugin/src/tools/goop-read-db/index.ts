/**
 * goop_read_db tool — read workflow documents from the GoopSpecDB.
 *
 * Supports single-doc mode (doc_type) and batch mode (doc_types) for loading
 * multiple documents in one call. Returns raw markdown content or clear
 * "not found" messages.
 *
 * @module tools/goop-read-db
 */

import { tool } from "../../core/sdk-compat.js";
import type { ToolContext, ToolDefinition } from "../../core/sdk-compat.js";
import type { PluginContext } from "../../core/types.js";
import { DOC_TYPES } from "../../features/db/types.js";
import type { DocType } from "../../features/db/types.js";

// ---------------------------------------------------------------------------
// Tool factory
// ---------------------------------------------------------------------------

export function createGoopReadDbTool(ctx: PluginContext): ToolDefinition {
  function readDocumentContent(workflowId: string, docType: DocType): string | null {
    return ctx.db.resolveDocumentContent(workflowId, docType);
  }

  return tool({
    description:
      "Read whole workflow documents from GoopSpecDB. WHEN TO USE: Load one doc_type or several doc_types[] in one call. WHEN NOT TO USE: goop_read_section for keyed sections; goop_adl({action:\"read\"}) for the ADL (it is an append-log of structured events, not a document row, so doc_type:\"adl\" returns \"No adl document found\"); goop_search_docs to find content across workflows. RETURNS: Raw markdown (single) or docs under \"## {doc_type}\" headings joined by \"---\"; a \"not found\" message names goop_write_db as the creator. CAVEATS: Valid doc_types: spec, blueprint, chronicle, adl, handoff, requirements, research; unknown types list the valid set.",
    args: {
      doc_type: tool.schema
        .string()
        .optional()
        .describe(
          "Single document type to load; prefer doc_types[] when loading more than one.",
        ),
      doc_types: tool.schema
        .array(tool.schema.string())
        .optional()
        .describe(
          "Batch of document types to load in one call; preferred over repeated doc_type calls.",
        ),
      workflow_id: tool.schema
        .string()
        .optional()
        .describe("Target workflow id; omit to use the active workflow."),
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
        const workflowId = args.workflow_id ?? ctx.stateManager.getState().activeWorkflowId;

        // Determine which types to load
        const hasBatch = args.doc_types && args.doc_types.length > 0;
        const hasSingle = args.doc_type !== undefined && args.doc_type !== "";

        if (hasBatch) {
          // Batch mode — validate all entries
          const requestedTypes = args.doc_types ?? [];
          const invalid = requestedTypes.filter((t) => !DOC_TYPES.includes(t as DocType));
          if (invalid.length > 0) {
            return `Unknown doc_type(s): ${invalid.join(", ")}. Valid types: ${DOC_TYPES.join(", ")}`;
          }

          // Load all docs
          const sections = requestedTypes.map((docType) => {
            const content = readDocumentContent(workflowId, docType as DocType);
            const renderedContent =
              content ?? `_(No ${docType} document found. Use goop_write_db to create it.)_`;
            return `## ${docType}\n\n${renderedContent}`;
          });

          return sections.join("\n\n---\n\n");
        }

        if (hasSingle) {
          // Single mode — validate and load
          if (!DOC_TYPES.includes(args.doc_type as DocType)) {
            return `Unknown doc_type: ${args.doc_type}. Valid types: ${DOC_TYPES.join(", ")}`;
          }

          const content = readDocumentContent(workflowId, args.doc_type as DocType);

          if (content !== null) {
            return content;
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
