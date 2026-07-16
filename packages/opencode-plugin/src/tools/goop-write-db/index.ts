/**
 * goop_write_db tool — write or update a workflow document in GoopSpecDB.
 *
 * Persists the document to SQLite, logs a doc_write event, and renders
 * a markdown sidecar file under `.goopspec/<workflowId>/`.
 *
 * @module tools/goop-write-db
 */

import { tool } from "../../core/sdk-compat.js";
import type { ToolContext, ToolDefinition } from "../../core/sdk-compat.js";
import type { PluginContext } from "../../core/types.js";
import { formatBatchResult, runBatch } from "../../features/db/batch.js";
import { DOC_TYPES } from "../../features/db/types.js";
import type { DocType } from "../../features/db/types.js";
import { DOC_TYPE_FILENAMES, renderSidecars } from "../../shared/render-sidecars.js";

// ---------------------------------------------------------------------------
// Tool factory
// ---------------------------------------------------------------------------

export function createGoopWriteDbTool(ctx: PluginContext): ToolDefinition {
  return tool({
    description:
      "Write or update a workflow document in GoopSpecDB. Renders a markdown sidecar file.\n\n" +
      "Args:\n" +
      "- doc_type: Document type (spec, blueprint, chronicle, adl, handoff, requirements, research)\n" +
      "- content: Markdown body to write\n" +
      "- workflow_id: Optional workflow ID (defaults to active workflow)\n" +
      "- mode: 'replace' (default) overwrites; 'append' concatenates to existing content\n" +
      "- items: Optional batch of document writes for the same workflow_id",
    args: {
      doc_type: tool.schema.enum(DOC_TYPES),
      content: tool.schema.string(),
      workflow_id: tool.schema.string().optional(),
      mode: tool.schema.enum(["replace", "append"] as const).optional(),
      items: tool.schema
        .array(
          tool.schema.object({
            doc_type: tool.schema.enum(DOC_TYPES),
            content: tool.schema.string(),
            mode: tool.schema.enum(["replace", "append"] as const).optional(),
          }),
        )
        .optional(),
    },
    async execute(
      args: {
        doc_type: DocType;
        content: string;
        workflow_id?: string;
        mode?: "replace" | "append";
        items?: Array<{ doc_type: DocType; content: string; mode?: "replace" | "append" }>;
      },
      _context: ToolContext,
    ): Promise<string> {
      try {
        if (args.items !== undefined) {
          const workflowId = args.workflow_id ?? ctx.stateManager.getState().activeWorkflowId;
          const result = runBatch(ctx.db, args.items, (item) => {
            const itemMode = item.mode ?? "replace";

            ctx.db.deleteSections(workflowId, item.doc_type);

            if (itemMode === "append") {
              ctx.db.appendDocument(workflowId, item.doc_type, item.content);
              if (item.doc_type === "chronicle") {
                ctx.db.appendChronicleEvent(workflowId, item.content);
              }
            } else {
              ctx.db.upsertDocument(workflowId, item.doc_type, item.content);
            }

            ctx.db.appendEvent(workflowId, "doc_write", {
              doc_type: item.doc_type,
              mode: itemMode,
              timestamp: Date.now(),
            });

            return `wrote ${item.doc_type}`;
          });

          renderSidecars(ctx, workflowId);
          return formatBatchResult(result, "write-db");
        }

        const workflowId = args.workflow_id ?? ctx.stateManager.getState().activeWorkflowId;
        const mode = args.mode ?? "replace";

        // Persist to DB
        ctx.db.deleteSections(workflowId, args.doc_type);
        if (mode === "append") {
          ctx.db.appendDocument(workflowId, args.doc_type, args.content);
          // Also insert chronicle event row when appending chronicle
          if (args.doc_type === "chronicle") {
            ctx.db.appendChronicleEvent(workflowId, args.content);
          }
        } else {
          ctx.db.upsertDocument(workflowId, args.doc_type, args.content);
        }

        // Log doc_write event
        ctx.db.appendEvent(workflowId, "doc_write", {
          doc_type: args.doc_type,
          mode,
          timestamp: Date.now(),
        });

        // Read back the full document for sidecar (important for append mode)
        const updatedDoc = ctx.db.getDocument(workflowId, args.doc_type);
        const sidecarContent = updatedDoc?.content ?? args.content;

        renderSidecars(ctx, workflowId);
        const filename = DOC_TYPE_FILENAMES[args.doc_type];

        return `Written ${args.doc_type} for workflow '${workflowId}' (${sidecarContent.length} chars, mode: ${mode}). Sidecar: .goopspec/${workflowId}/${filename}`;
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        return `Error in goop_write_db: ${msg}`;
      }
    },
  });
}
