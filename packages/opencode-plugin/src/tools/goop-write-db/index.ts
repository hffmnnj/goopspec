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
import { patchContent } from "../../shared/content-patch.js";
import { DOC_TYPE_FILENAMES, renderSidecars } from "../../shared/render-sidecars.js";
import { resolveWriteMode } from "../../shared/write-mode.js";

interface PatchArgs {
  old_string?: string;
  new_string?: string;
  replace_all?: boolean;
}

interface WriteDbItem {
  doc_type: DocType;
  content?: string;
  mode?: "replace" | "append";
}

type WriteDbItemWithPatch = WriteDbItem & PatchArgs;

/**
 * Render the persisted document length for a success message. An explicit
 * "empty document" label distinguishes an intentional zero-length write
 * from a bare "0 chars", which reads as though the content vanished. The
 * caller must be able to tell "I wrote an empty document" apart from
 * "something went wrong and my content disappeared".
 */
function describeWriteLength(len: number): string {
  return len === 0 ? "empty document" : `${len} chars`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function patchExistingDocument(
  db: PluginContext["db"],
  workflowId: string,
  docType: DocType,
  oldString: string,
  newString: string,
  replaceAll: boolean,
): import("../../shared/content-patch.js").PatchResult {
  const existing = db.getDocument(workflowId, docType)?.content ?? "";
  return patchContent(existing, oldString, newString, { replaceAll });
}

// ---------------------------------------------------------------------------
// Tool factory
// ---------------------------------------------------------------------------

export function createGoopWriteDbTool(ctx: PluginContext): ToolDefinition {
  return tool({
    description:
      "Write or update a workflow document in GoopSpecDB. Renders a markdown sidecar file.",
    args: {
      doc_type: tool.schema.enum(DOC_TYPES),
      content: tool.schema.string().optional(),
      workflow_id: tool.schema.string().optional(),
      mode: tool.schema.enum(["replace", "append"] as const).optional(),
      old_string: tool.schema.string().optional().describe("Exact existing text to replace"),
      new_string: tool.schema.string().optional().describe("Replacement text"),
      replace_all: tool.schema
        .boolean()
        .optional()
        .describe("Replace all occurrences instead of requiring a single match"),
      items: tool.schema
        .array(
          tool.schema.object({
            doc_type: tool.schema.enum(DOC_TYPES),
            content: tool.schema.string().optional(),
            mode: tool.schema.enum(["replace", "append"] as const).optional(),
            old_string: tool.schema.string().optional().describe("Exact existing text to replace"),
            new_string: tool.schema.string().optional().describe("Replacement text"),
            replace_all: tool.schema
              .boolean()
              .optional()
              .describe("Replace all occurrences instead of requiring a single match"),
          }),
        )
        .optional(),
    },
    async execute(
      args: {
        doc_type: DocType;
        content?: string;
        workflow_id?: string;
        mode?: "replace" | "append";
        old_string?: string;
        new_string?: string;
        replace_all?: boolean;
        items?: WriteDbItemWithPatch[];
      },
      _context: ToolContext,
    ): Promise<string> {
      try {
        // Batch/message-parity audit: goop_write_db and goop_blocker were
        // reviewed for batch-vs-single-path parity defects (batch mode
        // rejecting valid input, or batch and single paths disagreeing on
        // what they report). Both already route batch items through the shared
        // runBatch/formatBatchResult path and report per-item results
        // consistently with their single-item path, so no parity change was
        // required. Recorded to prevent re-auditing these two tools.
        const hasItems = Array.isArray(args.items) && args.items.length > 0;
        const resolution = resolveWriteMode({
          content: args.content,
          mode: args.mode,
          old_string: args.old_string,
          new_string: args.new_string,
          replace_all: args.replace_all,
          hasItems,
        });

        if (resolution.kind === "error") {
          return `Error in goop_write_db: ${resolution.message}`;
        }

        const workflowId = args.workflow_id ?? ctx.stateManager.getState().activeWorkflowId;

        if (resolution.kind === "batch") {
          const result = runBatch(ctx.db, args.items as WriteDbItemWithPatch[], (item) => {
            const itemResolution = resolveWriteMode({
              content: item.content,
              mode: item.mode,
              old_string: item.old_string,
              new_string: item.new_string,
              replace_all: item.replace_all,
            });

            if (itemResolution.kind === "error") {
              throw new Error(itemResolution.message);
            }
            if (itemResolution.kind === "batch" || itemResolution.kind === "none") {
              throw new Error("content is required when old_string is not provided");
            }

            ctx.db.deleteSections(workflowId, item.doc_type);

            if (itemResolution.kind === "patch") {
              const patchResult = patchExistingDocument(
                ctx.db,
                workflowId,
                item.doc_type,
                itemResolution.old_string,
                itemResolution.new_string,
                itemResolution.replace_all,
              );
              if (!patchResult.ok) {
                throw new Error(patchResult.error ?? "Patch failed");
              }
              ctx.db.upsertDocument(workflowId, item.doc_type, patchResult.content as string);
              ctx.db.appendEvent(workflowId, "doc_write", {
                doc_type: item.doc_type,
                mode: "patch",
                timestamp: Date.now(),
              });
              return `wrote ${item.doc_type}`;
            }

            if (itemResolution.mode === "append") {
              ctx.db.appendDocument(workflowId, item.doc_type, itemResolution.content);
              if (item.doc_type === "chronicle") {
                ctx.db.appendChronicleEvent(workflowId, itemResolution.content);
              }
            } else {
              ctx.db.upsertDocument(workflowId, item.doc_type, itemResolution.content);
            }

            ctx.db.appendEvent(workflowId, "doc_write", {
              doc_type: item.doc_type,
              mode: itemResolution.mode,
              timestamp: Date.now(),
            });

            return `wrote ${item.doc_type}`;
          });

          renderSidecars(ctx, workflowId);
          return formatBatchResult(result, "write-db");
        }

        if (resolution.kind === "none") {
          if (args.items?.length === 0) {
            return "Error in goop_write_db: items[] array is empty and no document content was provided";
          }
          return "Error in goop_write_db: content is required when old_string is not provided";
        }

        if (resolution.kind === "patch") {
          const patchResult = patchExistingDocument(
            ctx.db,
            workflowId,
            args.doc_type,
            resolution.old_string,
            resolution.new_string,
            resolution.replace_all,
          );
          if (!patchResult.ok) {
            return `Error in goop_write_db: ${patchResult.error}`;
          }

          ctx.db.upsertDocument(workflowId, args.doc_type, patchResult.content as string);
          ctx.db.appendEvent(workflowId, "doc_write", {
            doc_type: args.doc_type,
            mode: "patch",
            timestamp: Date.now(),
          });

          const updatedDoc = ctx.db.getDocument(workflowId, args.doc_type);
          const sidecarContent = updatedDoc?.content ?? patchResult.content ?? "";

          renderSidecars(ctx, workflowId);
          const filename = DOC_TYPE_FILENAMES[args.doc_type];

          return `Patched ${args.doc_type} for workflow '${workflowId}' (${describeWriteLength(sidecarContent.length)}, mode: patch). Sidecar: .goopspec/${workflowId}/${filename}`;
        }

        // Persist to DB (full-document write/append)
        ctx.db.deleteSections(workflowId, args.doc_type);
        if (resolution.mode === "append") {
          ctx.db.appendDocument(workflowId, args.doc_type, resolution.content);
          // Also insert chronicle event row when appending chronicle
          if (args.doc_type === "chronicle") {
            ctx.db.appendChronicleEvent(workflowId, resolution.content);
          }
        } else {
          ctx.db.upsertDocument(workflowId, args.doc_type, resolution.content);
        }

        // Log doc_write event
        ctx.db.appendEvent(workflowId, "doc_write", {
          doc_type: args.doc_type,
          mode: resolution.mode,
          timestamp: Date.now(),
        });

        // Read back the full document for sidecar (important for append mode)
        const updatedDoc = ctx.db.getDocument(workflowId, args.doc_type);
        const sidecarContent = updatedDoc?.content ?? resolution.content;

        renderSidecars(ctx, workflowId);
        const filename = DOC_TYPE_FILENAMES[args.doc_type];

        return `Written ${args.doc_type} for workflow '${workflowId}' (${describeWriteLength(sidecarContent.length)}, mode: ${resolution.mode}). Sidecar: .goopspec/${workflowId}/${filename}`;
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        return `Error in goop_write_db: ${msg}`;
      }
    },
  });
}
