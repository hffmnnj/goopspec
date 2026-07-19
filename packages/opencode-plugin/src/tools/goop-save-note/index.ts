/**
 * Field Note Save Tool
 *
 * Saves a Field Note to the global knowledge base. Notes persist across
 * projects and workflows, forming a compounding knowledge layer.
 *
 * ID format: fn_YYYYMMDD_random8
 *
 * @module tools/goop-save-note
 */

import { tool } from "../../core/sdk-compat.js";
import type { ToolContext, ToolDefinition } from "../../core/sdk-compat.js";
import type { PluginContext } from "../../core/types.js";
import type { BatchItemResult, BatchResult } from "../../features/db/batch.js";
import { formatBatchResult } from "../../features/db/batch.js";

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------

/**
 * Generate a Field Note ID in the format `fn_YYYYMMDD_random8`.
 *
 * Uses UTC date and 8 random alphanumeric characters.
 */
function generateNoteId(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  const random8 = Math.random().toString(36).slice(2, 10);
  return `fn_${y}${m}${d}_${random8}`;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NoteFields {
  title?: string;
  body?: string;
  tags?: string[];
  source_agent?: string;
  importance?: number;
  workflow_id?: string;
  project_id?: string;
}

interface NotePatchArgs {
  note_id?: string;
  old_string?: string;
  new_string?: string;
  replace_all?: boolean;
}

type SaveNoteItem = NoteFields & NotePatchArgs;

type SaveNoteArgs = NoteFields &
  NotePatchArgs & {
    items?: SaveNoteItem[];
  };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function validateCreateFields(item: NoteFields): { ok: true } | { ok: false; error: string } {
  if (item.title === undefined) return { ok: false, error: "title is required for new notes" };
  if (item.body === undefined) return { ok: false, error: "body is required for new notes" };
  if (item.tags === undefined) return { ok: false, error: "tags is required for new notes" };
  if (item.source_agent === undefined) {
    return { ok: false, error: "source_agent is required for new notes" };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Tool factory
// ---------------------------------------------------------------------------

export function createGoopSaveNoteTool(ctx: PluginContext): ToolDefinition {
  return tool({
    description: "Save a Field Note to the global knowledge base.",
    args: {
      title: tool.schema.string().optional().describe("Note title (required for new notes)"),
      body: tool.schema.string().optional().describe("Note body markdown (required for new notes)"),
      tags: tool.schema
        .array(tool.schema.string())
        .optional()
        .describe("Categorization tags (required for new notes)"),
      source_agent: tool.schema
        .string()
        .optional()
        .describe("Agent saving the note (required for new notes)"),
      importance: tool.schema.number().optional().describe("Importance 1-10 (default 5)"),
      workflow_id: tool.schema.string().optional().describe("Originating workflow"),
      project_id: tool.schema.string().optional().describe("Originating project"),
      note_id: tool.schema
        .string()
        .optional()
        .describe("Existing note fn_... id to patch instead of creating a new note"),
      old_string: tool.schema.string().optional().describe("Exact existing text to replace"),
      new_string: tool.schema.string().optional().describe("Replacement text"),
      replace_all: tool.schema
        .boolean()
        .optional()
        .describe("Replace all occurrences instead of requiring a single match"),
      items: tool.schema
        .array(
          tool.schema.object({
            title: tool.schema.string().optional().describe("Note title (required for new notes)"),
            body: tool.schema
              .string()
              .optional()
              .describe("Note body markdown (required for new notes)"),
            tags: tool.schema
              .array(tool.schema.string())
              .optional()
              .describe("Categorization tags (required for new notes)"),
            source_agent: tool.schema
              .string()
              .optional()
              .describe("Agent saving the note (required for new notes)"),
            importance: tool.schema.number().optional().describe("Importance 1-10 (default 5)"),
            workflow_id: tool.schema.string().optional().describe("Originating workflow"),
            project_id: tool.schema.string().optional().describe("Originating project"),
            note_id: tool.schema
              .string()
              .optional()
              .describe("Existing note fn_... id to patch instead of creating a new note"),
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
    async execute(args: SaveNoteArgs, _context: ToolContext): Promise<string> {
      try {
        if (args.items !== undefined) {
          const batchItems: BatchItemResult[] = [];
          let succeeded = 0;
          let failed = 0;

          for (const [index, item] of args.items.entries()) {
            try {
              if (item.note_id !== undefined) {
                if (item.old_string === undefined) {
                  throw new Error("old_string is required when note_id is provided for patch mode");
                }

                const updateResult = ctx.db.updateNote(item.note_id, {
                  oldString: item.old_string,
                  newString: item.new_string ?? "",
                  replaceAll: item.replace_all ?? false,
                });

                if (!updateResult.ok) {
                  throw new Error(updateResult.error ?? "Patch failed");
                }

                batchItems.push({ index, ok: true, detail: `patched ${item.note_id}` });
                succeeded++;
                continue;
              }

              const validation = validateCreateFields(item);
              if (!validation.ok) {
                throw new Error(validation.error);
              }

              const itemImportance = item.importance ?? 5;
              if (itemImportance < 1 || itemImportance > 10) {
                throw new Error(`importance out of range (${itemImportance})`);
              }

              const id = generateNoteId();
              ctx.db.saveNote({
                id,
                title: item.title as string,
                body: item.body as string,
                tags: JSON.stringify(item.tags as string[]),
                source_agent: item.source_agent as string,
                importance: itemImportance,
                workflow_id: item.workflow_id ?? null,
                project_id: item.project_id ?? null,
              });

              batchItems.push({ index, ok: true, detail: `saved ${id}` });
              succeeded++;
            } catch (error: unknown) {
              const msg = error instanceof Error ? error.message : String(error);
              batchItems.push({ index, ok: false, detail: msg });
              failed++;
            }
          }

          const result: BatchResult = {
            total: args.items.length,
            succeeded,
            failed,
            items: batchItems,
          };
          return formatBatchResult(result, "save-note");
        }

        if (args.note_id !== undefined) {
          if (args.old_string === undefined) {
            return "Error: old_string is required when note_id is provided for patch mode";
          }

          const updateResult = ctx.db.updateNote(args.note_id, {
            oldString: args.old_string,
            newString: args.new_string ?? "",
            replaceAll: args.replace_all ?? false,
          });

          if (!updateResult.ok) {
            return `Error patching Field Note: ${updateResult.error}`;
          }

          return `Field Note patched: ${args.note_id}`;
        }

        const validation = validateCreateFields(args);
        if (!validation.ok) {
          return `Error: ${validation.error}`;
        }

        const importance = args.importance ?? 5;

        if (importance < 1 || importance > 10) {
          return "Error: Importance must be between 1 and 10.";
        }

        const id = generateNoteId();

        ctx.db.saveNote({
          id,
          title: args.title as string,
          body: args.body as string,
          tags: JSON.stringify(args.tags as string[]),
          source_agent: args.source_agent as string,
          importance,
          workflow_id: args.workflow_id ?? null,
          project_id: args.project_id ?? null,
        });

        return `Field Note saved: ${id}\nTitle: ${args.title}\nTags: ${(args.tags as string[]).join(", ")}`;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return `Error saving Field Note: ${message}`;
      }
    },
  });
}
