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

function isPatchActive(patch: PatchArgs): boolean {
  return patch.old_string !== undefined;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function patchExistingDocument(
  db: PluginContext["db"],
  workflowId: string,
  docType: DocType,
  patch: PatchArgs,
): import("../../shared/content-patch.js").PatchResult {
  if (!isPatchActive(patch)) {
    return {
      ok: false,
      matchCount: 0,
      error: "old_string is required for patch mode",
    };
  }

  const existing = db.getDocument(workflowId, docType)?.content ?? "";
  return patchContent(existing, patch.old_string as string, patch.new_string ?? "", {
    replaceAll: patch.replace_all ?? false,
  });
}

function resolveContentForWrite(
  db: PluginContext["db"],
  workflowId: string,
  item: WriteDbItemWithPatch,
): string {
  if (isPatchActive(item)) {
    const patchResult = patchExistingDocument(db, workflowId, item.doc_type, {
      old_string: item.old_string,
      new_string: item.new_string,
      replace_all: item.replace_all,
    });
    if (!patchResult.ok) {
      throw new Error(patchResult.error ?? "Patch failed");
    }

    return patchResult.content as string;
  }

  if (item.content === undefined) {
    throw new Error("content is required when old_string is not provided");
  }

  return item.content;
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
        if (args.items !== undefined) {
          const workflowId = args.workflow_id ?? ctx.stateManager.getState().activeWorkflowId;
          const result = runBatch(ctx.db, args.items, (item) => {
            const itemMode = item.mode ?? "replace";
            const itemContent = resolveContentForWrite(ctx.db, workflowId, item);

            ctx.db.deleteSections(workflowId, item.doc_type);

            if (itemMode === "append") {
              ctx.db.appendDocument(workflowId, item.doc_type, itemContent);
              if (item.doc_type === "chronicle") {
                ctx.db.appendChronicleEvent(workflowId, itemContent);
              }
            } else {
              ctx.db.upsertDocument(workflowId, item.doc_type, itemContent);
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

        if (isPatchActive(args)) {
          const patchResult = patchExistingDocument(ctx.db, workflowId, args.doc_type, {
            old_string: args.old_string,
            new_string: args.new_string,
            replace_all: args.replace_all,
          });
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

          return `Patched ${args.doc_type} for workflow '${workflowId}' (${sidecarContent.length} chars, mode: patch). Sidecar: .goopspec/${workflowId}/${filename}`;
        }

        if (args.content === undefined) {
          return "Error in goop_write_db: content is required when old_string is not provided";
        }

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
