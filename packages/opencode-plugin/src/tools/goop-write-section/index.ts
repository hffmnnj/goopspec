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
import { patchContent } from "../../shared/content-patch.js";
import { DOC_TYPE_FILENAMES, renderSidecars } from "../../shared/render-sidecars.js";
import { resolveWriteMode } from "../../shared/write-mode.js";

const MIGRATED_LEGACY_CONTENT_KEY = "_migrated-legacy-content";

interface PatchArgs {
  old_string?: string;
  new_string?: string;
  replace_all?: boolean;
}

type WriteSectionItem = {
  doc_type: DocType;
  section_key: string;
  content?: string;
  position?: number;
} & PatchArgs;

// ---------------------------------------------------------------------------
// Tool factory
// ---------------------------------------------------------------------------

export function createGoopWriteSectionTool(ctx: PluginContext): ToolDefinition {
  /**
   * An exact empty string is never an unambiguous section replacement on the
   * direct factory path. The shared boundary (coalesce) removes injected
   * blanks before the wrapped execute runs, so this local normalization keeps
   * direct callers on the same safe contract: empty content resolves to
   * "absent" and yields a loud none-mode error instead of wiping the section.
   * Patch-computed content bypasses this helper (a patch that deletes matched
   * text legitimately produces an empty section).
   */
  function normalizeSectionContent(content: string | undefined): string | undefined {
    return content === "" ? undefined : content;
  }

  /**
   * replace_all:false is semantically identical to the omitted default (no
   * replace-all), and the host injects false into optional booleans. The
   * direct factory cannot tell an authored false from an injected one, and
   * dropping it is lossless (false IS the default), so explicit false is
   * treated as absent before mode resolution. True and omitted are unchanged.
   */
  function normalizeReplaceAll(replaceAll: boolean | undefined): boolean | undefined {
    return replaceAll === false ? undefined : replaceAll;
  }

  /**
   * Decide whether a full-document row must migrate into the reserved legacy
   * section before the first section write. Read-only: the migration upsert
   * itself happens inside the caller's transaction so a failed write cannot
   * leave a half-migrated document.
   */
  function pendingLegacyMigration(
    workflowId: string,
    docType: DocType,
    sectionKey: string,
  ): string | null {
    if (ctx.db.getSections(workflowId, docType).length > 0) return null;

    const legacyContent = ctx.db.getDocument(workflowId, docType)?.content;
    if (legacyContent === undefined || legacyContent.length === 0) return null;
    if (sectionKey === MIGRATED_LEGACY_CONTENT_KEY) {
      throw new Error(
        `Section key '${MIGRATED_LEGACY_CONTENT_KEY}' is reserved for legacy migration`,
      );
    }

    return legacyContent;
  }

  function resolveSectionContent(workflowId: string, item: WriteSectionItem): string {
    const resolution = resolveWriteMode({
      content: item.content,
      old_string: item.old_string,
      new_string: item.new_string,
      replace_all: normalizeReplaceAll(item.replace_all),
    });

    if (resolution.kind === "error") {
      throw new Error(resolution.message);
    }

    if (resolution.kind === "patch") {
      const existing =
        ctx.db.getSection(workflowId, item.doc_type, item.section_key)?.content ?? "";
      const patchResult = patchContent(existing, resolution.old_string, resolution.new_string, {
        replaceAll: resolution.replace_all,
      });
      if (!patchResult.ok) {
        throw new Error(patchResult.error ?? "Patch failed");
      }

      return patchResult.content as string;
    }

    if (resolution.kind === "full-write") {
      return resolution.content;
    }

    // "none" or "batch" (nested items[] is not a supported per-item shape).
    throw new Error("content is required when old_string is not provided");
  }

  /**
   * Persist a section write and its event. NOT transactional itself: the
   * single and patch paths wrap it in runTransaction, and the batch path runs
   * inside runBatch's outer transaction. The legacy-migration upsert is
   * included so a rolled-back write cannot leave a half-migrated document.
   */
  function writeSection(
    workflowId: string,
    item: WriteSectionItem,
    shouldCheckForLegacyContent = true,
  ): void {
    const legacyContent = shouldCheckForLegacyContent
      ? pendingLegacyMigration(workflowId, item.doc_type, item.section_key)
      : null;
    const content = resolveSectionContent(workflowId, item);
    if (legacyContent !== null) {
      ctx.db.upsertSection(
        workflowId,
        item.doc_type,
        MIGRATED_LEGACY_CONTENT_KEY,
        legacyContent,
        0,
      );
    }
    ctx.db.upsertSection(workflowId, item.doc_type, item.section_key, content, item.position);
    ctx.db.appendEvent(workflowId, "doc_section_write", {
      doc_type: item.doc_type,
      section_key: item.section_key,
      timestamp: Date.now(),
    });
  }

  return tool({
    description:
      'Write, update, or delete a keyed document section. WHEN TO USE: Create, replace, patch, delete a section, or batch writes. WHEN NOT TO USE: goop_write_db for whole documents; goop_read_section to read. MODES: write (default) = content, or patch via old_string/new_string, or items[] batch (top-level op fields rejected); delete = action:"delete"+section_key, single only (items[] rejected). REJECTED (write): content+old_string; new_string/replace_all without old_string; mode:"append"+old_string. RETURNS: Section + assembled char counts and sidecar path; delete confirms removal or reports not-found. CAVEATS: Batch is atomic. First section write migrates any full-document content into reserved "_migrated-legacy-content". new_string:"" deletes matched text; omit content when not writing.',
    args: {
      action: tool.schema
        .enum(["write", "delete"] as const)
        .optional()
        .describe(
          "write (default) creates/updates a section; delete removes one section_key and does not support items[].",
        ),
      doc_type: tool.schema.enum(DOC_TYPES).describe("Document type the section belongs to."),
      section_key: tool.schema
        .string()
        .optional()
        .describe(
          "Key identifying the section; required for delete and for single write, omit only in items[] batch mode.",
        ),
      content: tool.schema
        .string()
        .optional()
        .describe(
          "Full section content (write mode); omit for patch or batch — an empty content is coalesced to absent.",
        ),
      position: tool.schema
        .number()
        .optional()
        .describe("Sort order of the section within the assembled document; omit to append."),
      workflow_id: tool.schema
        .string()
        .optional()
        .describe("Target workflow id; omit to use the active workflow."),
      old_string: tool.schema
        .string()
        .optional()
        .describe("Exact existing text to replace; presence activates patch mode."),
      new_string: tool.schema
        .string()
        .optional()
        .describe("Replacement text; an empty new_string deletes the matched text."),
      replace_all: tool.schema
        .boolean()
        .optional()
        .describe("Replace all occurrences instead of requiring a single match."),
      items: tool.schema
        .array(
          tool.schema.object({
            doc_type: tool.schema.enum(DOC_TYPES).describe("Document type for this section."),
            section_key: tool.schema.string().describe("Key identifying this section."),
            content: tool.schema
              .string()
              .optional()
              .describe("Full section content for this item."),
            position: tool.schema
              .number()
              .optional()
              .describe("Sort order within the assembled document; omit to append."),
            old_string: tool.schema
              .string()
              .optional()
              .describe("Exact existing text to replace; presence activates patch mode."),
            new_string: tool.schema
              .string()
              .optional()
              .describe("Replacement text; an empty new_string deletes the matched text."),
            replace_all: tool.schema
              .boolean()
              .optional()
              .describe("Replace all occurrences instead of requiring a single match."),
          }),
        )
        .optional()
        .describe(
          "Batch of section writes; cannot be supplied alongside top-level content, old_string, new_string, replace_all, or action:'delete'.",
        ),
    },
    async execute(
      args: {
        action?: "write" | "delete";
        doc_type: DocType;
        section_key?: string;
        content?: string;
        position?: number;
        workflow_id?: string;
        old_string?: string;
        new_string?: string;
        replace_all?: boolean;
        items?: WriteSectionItem[];
      },
      _context: ToolContext,
    ): Promise<string> {
      try {
        const action = args.action ?? "write";
        const workflowId = args.workflow_id ?? ctx.stateManager.getState().activeWorkflowId;
        // Local semantic omission so the direct factory matches the wrapped
        // boundary: empty content and replace_all:false are treated as absent.
        const content = normalizeSectionContent(args.content);
        const replaceAll = normalizeReplaceAll(args.replace_all);

        // 'delete' is intentionally excluded from batch mode (items[]). The
        // items[] schema (see args.items above) carries write/patch fields
        // (content, position, old_string/new_string) and has no per-item
        // 'action' field, so a delete cannot be expressed per item without
        // adding an action enum to every item or a separate delete_items[]
        // array. Delete is also destructive and benefits from being an
        // explicit, single-section operation, and the batch path's
        // legacy-content migration + per-item write semantics do not apply to
        // deletes. Do not "fix" this by silently enabling items[] for delete —
        // it would be a regression. Delete one section per call instead.
        if (action === "delete") {
          if (Array.isArray(args.items) && args.items.length > 0) {
            return "Error in goop_write_section: action 'delete' does not support items";
          }
          if (!args.section_key) {
            return "Error in goop_write_section: section_key is required for action 'delete'";
          }
          const sectionKey = args.section_key;

          // Delete and its event are one unit: a failed event write must not
          // leave the section gone with no record of why.
          const deleted = ctx.db.runTransaction(() => {
            const removed = ctx.db.deleteSection(workflowId, args.doc_type, sectionKey);
            if (removed) {
              ctx.db.appendEvent(workflowId, "doc_section_delete", {
                doc_type: args.doc_type,
                section_key: sectionKey,
                timestamp: Date.now(),
              });
            }
            return removed;
          });
          renderSidecars(ctx, workflowId);
          return deleted
            ? `Deleted section '${sectionKey}' for ${args.doc_type} in workflow '${workflowId}'.`
            : `No section '${sectionKey}' found for ${args.doc_type} in workflow '${workflowId}'.`;
        }

        if (Array.isArray(args.items) && args.items.length > 0) {
          const topResolution = resolveWriteMode({
            content,
            old_string: args.old_string,
            new_string: args.new_string,
            replace_all: replaceAll,
            hasItems: true,
          });
          if (topResolution.kind === "error") {
            return `Error in goop_write_section: ${topResolution.message}`;
          }

          const checkedDocTypes = new Set<DocType>();
          const result = runBatch(ctx.db, args.items, (item) => {
            // An empty section key can never name a section; reject it before
            // any migration or write so the whole batch rolls back.
            if (!item.section_key || item.section_key.length === 0) {
              throw new Error("section_key is required for every item in items[]");
            }
            const shouldCheckForLegacyContent = !checkedDocTypes.has(item.doc_type);
            checkedDocTypes.add(item.doc_type);
            writeSection(
              workflowId,
              { ...item, content: normalizeSectionContent(item.content) },
              shouldCheckForLegacyContent,
            );

            return `wrote ${item.doc_type}/${item.section_key}`;
          });

          renderSidecars(ctx, workflowId);
          return formatBatchResult(result, "write-section");
        }

        if (args.items?.length === 0 && args.section_key === undefined) {
          return "Error in goop_write_section: items[] array is empty and no section_key was provided";
        }

        // An empty section key can never name a section: the wrapped boundary
        // (coalesce) drops an injected section_key:"" before this guard, so
        // treating "" as missing keeps both paths on the identical message.
        if (!args.section_key) {
          return "Error in goop_write_section: section_key is required for action 'write'";
        }
        const sectionKey = args.section_key;

        const resolution = resolveWriteMode({
          content,
          old_string: args.old_string,
          new_string: args.new_string,
          replace_all: replaceAll,
        });

        if (resolution.kind === "error") {
          return `Error in goop_write_section: ${resolution.message}`;
        }

        if (resolution.kind === "none" || resolution.kind === "batch") {
          return "Error in goop_write_section: content is required when old_string is not provided";
        }

        if (resolution.kind === "patch") {
          const existing = ctx.db.getSection(workflowId, args.doc_type, sectionKey)?.content ?? "";
          const patchResult = patchContent(existing, resolution.old_string, resolution.new_string, {
            replaceAll: resolution.replace_all,
          });
          if (!patchResult.ok) {
            return `Error in goop_write_section: ${patchResult.error}`;
          }

          // Patch result and its event are one unit; the section content is
          // the patch output (an empty new_string legitimately empties it).
          ctx.db.runTransaction(() => {
            writeSection(workflowId, {
              doc_type: args.doc_type,
              section_key: sectionKey,
              content: patchResult.content,
              position: args.position,
            });
          });

          const sectionContent =
            ctx.db.getSection(workflowId, args.doc_type, sectionKey)?.content ?? "";
          const assembledContent = ctx.db.assembleDocument(workflowId, args.doc_type);
          renderSidecars(ctx, workflowId);
          const filename = DOC_TYPE_FILENAMES[args.doc_type];

          return `Patched section '${sectionKey}' for ${args.doc_type} in workflow '${workflowId}' (section: ${sectionContent.length} chars, assembled document: ${assembledContent.length} chars). Sidecar: .goopspec/${workflowId}/${filename}`;
        }

        // Section write and its event are one unit: a failed event write must
        // not leave a changed section with no record of why.
        ctx.db.runTransaction(() => {
          writeSection(workflowId, {
            doc_type: args.doc_type,
            section_key: sectionKey,
            content: resolution.content,
            position: args.position,
          });
        });

        const sectionContent =
          ctx.db.getSection(workflowId, args.doc_type, sectionKey)?.content ?? "";
        const assembledContent = ctx.db.assembleDocument(workflowId, args.doc_type);
        renderSidecars(ctx, workflowId);
        const filename = DOC_TYPE_FILENAMES[args.doc_type];

        return `Written section '${sectionKey}' for ${args.doc_type} in workflow '${workflowId}' (section: ${sectionContent.length} chars, assembled document: ${assembledContent.length} chars). Sidecar: .goopspec/${workflowId}/${filename}`;
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        return `Error in goop_write_section: ${msg}`;
      }
    },
  });
}
