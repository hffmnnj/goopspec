/**
 * goop_write_section tool — write a structured workflow document section.
 *
 * Persists one section to SQLite, logs a doc_section_write event, and renders
 * the assembled document sidecar under `.goopspec/<workflowId>/`.
 *
 * @module tools/goop-write-section
 */

import { tool } from "../../core/sdk-compat.js";
import type { ToolContext, ToolDefinition } from "../../core/sdk-compat.js";
import type { PluginContext } from "../../core/types.js";
import { formatBatchResult, runBatch } from "../../features/db/batch.js";
import { DOC_TYPES } from "../../features/db/types.js";
import type { DocType } from "../../features/db/types.js";
import { DOC_TYPE_FILENAMES, renderSidecars } from "../../shared/render-sidecars.js";

const MIGRATED_LEGACY_CONTENT_KEY = "_migrated-legacy-content";

type WriteSectionItem = {
  doc_type: DocType;
  section_key: string;
  content: string;
  position?: number;
};

// ---------------------------------------------------------------------------
// Tool factory
// ---------------------------------------------------------------------------

export function createGoopWriteSectionTool(ctx: PluginContext): ToolDefinition {
  function migrateLegacyContent(workflowId: string, docType: DocType, sectionKey: string): void {
    if (ctx.db.getSections(workflowId, docType).length > 0) return;

    const legacyContent = ctx.db.getDocument(workflowId, docType)?.content;
    if (legacyContent === undefined || legacyContent.length === 0) return;
    if (sectionKey === MIGRATED_LEGACY_CONTENT_KEY) {
      throw new Error(
        `Section key '${MIGRATED_LEGACY_CONTENT_KEY}' is reserved for legacy migration`,
      );
    }

    ctx.db.upsertSection(workflowId, docType, MIGRATED_LEGACY_CONTENT_KEY, legacyContent, 0);
  }

  function writeSection(
    workflowId: string,
    item: WriteSectionItem,
    shouldCheckForLegacyContent = true,
  ): void {
    if (shouldCheckForLegacyContent) {
      migrateLegacyContent(workflowId, item.doc_type, item.section_key);
    }
    ctx.db.upsertSection(workflowId, item.doc_type, item.section_key, item.content, item.position);
    ctx.db.appendEvent(workflowId, "doc_section_write", {
      doc_type: item.doc_type,
      section_key: item.section_key,
      timestamp: Date.now(),
    });
  }

  return tool({
    description:
      "Write, update, or delete a structured workflow document section in GoopSpecDB. " +
      "Section writes are separate from full-document goop_write_db writes and render the assembled section sidecar.",
    args: {
      action: tool.schema.enum(["write", "delete"] as const).optional(),
      doc_type: tool.schema.enum(DOC_TYPES),
      section_key: tool.schema.string().optional(),
      content: tool.schema.string().optional(),
      position: tool.schema.number().optional(),
      workflow_id: tool.schema.string().optional(),
      items: tool.schema
        .array(
          tool.schema.object({
            doc_type: tool.schema.enum(DOC_TYPES),
            section_key: tool.schema.string(),
            content: tool.schema.string(),
            position: tool.schema.number().optional(),
          }),
        )
        .optional(),
    },
    async execute(
      args: {
        action?: "write" | "delete";
        doc_type: DocType;
        section_key?: string;
        content?: string;
        position?: number;
        workflow_id?: string;
        items?: WriteSectionItem[];
      },
      _context: ToolContext,
    ): Promise<string> {
      try {
        const action = args.action ?? "write";
        const workflowId = args.workflow_id ?? ctx.stateManager.getState().activeWorkflowId;

        if (action === "delete") {
          if (args.items !== undefined) {
            return "Error in goop_write_section: action 'delete' does not support items";
          }
          if (!args.section_key) {
            return "Error in goop_write_section: section_key is required for action 'delete'";
          }

          const deleted = ctx.db.deleteSection(workflowId, args.doc_type, args.section_key);
          if (deleted) {
            ctx.db.appendEvent(workflowId, "doc_section_delete", {
              doc_type: args.doc_type,
              section_key: args.section_key,
              timestamp: Date.now(),
            });
          }
          renderSidecars(ctx, workflowId);
          return deleted
            ? `Deleted section '${args.section_key}' for ${args.doc_type} in workflow '${workflowId}'.`
            : `No section '${args.section_key}' found for ${args.doc_type} in workflow '${workflowId}'.`;
        }

        if (args.items !== undefined) {
          const checkedDocTypes = new Set<DocType>();
          const result = runBatch(ctx.db, args.items, (item) => {
            const shouldCheckForLegacyContent = !checkedDocTypes.has(item.doc_type);
            checkedDocTypes.add(item.doc_type);
            writeSection(workflowId, item, shouldCheckForLegacyContent);

            return `wrote ${item.doc_type}/${item.section_key}`;
          });

          renderSidecars(ctx, workflowId);
          return formatBatchResult(result, "write-section");
        }

        if (args.section_key === undefined || args.content === undefined) {
          return "Error in goop_write_section: section_key and content are required for action 'write'";
        }

        writeSection(workflowId, {
          doc_type: args.doc_type,
          section_key: args.section_key,
          content: args.content,
          position: args.position,
        });

        const sidecarContent = ctx.db.assembleDocument(workflowId, args.doc_type);
        renderSidecars(ctx, workflowId);
        const filename = DOC_TYPE_FILENAMES[args.doc_type];

        return `Written section '${args.section_key}' for ${args.doc_type} in workflow '${workflowId}' (${sidecarContent.length} assembled chars). Sidecar: .goopspec/${workflowId}/${filename}`;
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        return `Error in goop_write_section: ${msg}`;
      }
    },
  });
}
