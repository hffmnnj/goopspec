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
import { formatBatchResult, runBatch } from "../../features/db/batch.js";

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
// Note-specific write-mode resolution. A note is CREATE-or-PATCH keyed on
// `note_id` presence (not a content/old_string pair), so resolveWriteMode()
// doesn't fit — this mirrors its intent for the note's own field shape.
// ---------------------------------------------------------------------------

const NOTE_VALID_SHAPES =
  "Valid call shapes: (1) create — title + body + tags + source_agent; " +
  "(2) patch — note_id + old_string, optional new_string/replace_all.";

type NoteModeResolution =
  | { kind: "create" }
  | { kind: "patch" }
  | { kind: "error"; message: string };

function noteErr(message: string): NoteModeResolution {
  return { kind: "error", message: `${message} ${NOTE_VALID_SHAPES}` };
}

function meaningfulCreateFields(item: NoteFields): string[] {
  const offending: string[] = [];
  if (item.title !== undefined && item.title.length > 0) offending.push("title");
  if (item.body !== undefined && item.body.length > 0) offending.push("body");
  if (item.tags !== undefined && normalizeTags(item.tags).length > 0) offending.push("tags");
  if (item.source_agent !== undefined && item.source_agent.length > 0) {
    offending.push("source_agent");
  }
  return offending;
}

function meaningfulPatchFields(item: NotePatchArgs): string[] {
  const offending: string[] = [];
  if (item.old_string !== undefined) offending.push("old_string");
  if (item.new_string !== undefined) offending.push("new_string");
  if (item.replace_all !== undefined) offending.push("replace_all");
  return offending;
}

function resolveNoteMode(item: NoteFields & NotePatchArgs): NoteModeResolution {
  if (item.note_id !== undefined) {
    const createFields = meaningfulCreateFields(item);
    if (createFields.length > 0) {
      return noteErr(
        `${createFields.join(", ")} cannot be supplied alongside note_id: note_id activates patch mode, which only accepts old_string/new_string/replace_all.`,
      );
    }
    if (item.old_string === undefined) {
      return noteErr("old_string is required when note_id is provided for patch mode.");
    }
    return { kind: "patch" };
  }

  const patchFields = meaningfulPatchFields(item);
  if (patchFields.length > 0) {
    return noteErr(
      `${patchFields.join(", ")} supplied without note_id: ${patchFields.join(" and ")} only configure patch mode, which activates when note_id is present.`,
    );
  }

  return { kind: "create" };
}

// ---------------------------------------------------------------------------
// Tag normalization
// ---------------------------------------------------------------------------

/**
 * Normalize a `tags` value to `string[]`, defending against callers that pass
 * a JSON-encoded array string or a comma-separated string instead of a native
 * array.
 *
 * - native `string[]` → returned as-is (trimmed, empties dropped)
 * - JSON-encoded array string (`'["a","b"]'`) → parsed
 * - comma-separated string (`"a, b"`) → split and trimmed
 *
 * Malformed JSON degrades to comma-split rather than throwing. Whitespace-only
 * entries never become empty tags.
 */
function normalizeTags(tags: unknown): string[] {
  const clean = (entries: unknown[]): string[] =>
    entries
      .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
      .filter((entry) => entry.length > 0);

  if (Array.isArray(tags)) {
    return clean(tags);
  }
  if (typeof tags === "string") {
    const trimmed = tags.trim();
    if (trimmed === "") return [];
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return clean(parsed);
        }
      } catch {
        // Malformed JSON — fall through to comma-split.
      }
    }
    return clean(trimmed.split(","));
  }
  return [];
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
        if (Array.isArray(args.items) && args.items.length > 0) {
          const result = runBatch(ctx.db, args.items, (item) => {
            const itemResolution = resolveNoteMode(item);
            if (itemResolution.kind === "error") {
              throw new Error(itemResolution.message);
            }

            if (itemResolution.kind === "patch") {
              const updateResult = ctx.db.updateNote(item.note_id as string, {
                oldString: item.old_string as string,
                newString: item.new_string ?? "",
                replaceAll: item.replace_all ?? false,
              });

              if (!updateResult.ok) {
                throw new Error(updateResult.error ?? "Patch failed");
              }

              return `patched ${item.note_id}`;
            }

            const validation = validateCreateFields(item);
            if (!validation.ok) {
              throw new Error(validation.error);
            }

            const tags = normalizeTags(item.tags);

            const itemImportance = item.importance ?? 5;
            if (itemImportance < 1 || itemImportance > 10) {
              throw new Error(`importance out of range (${itemImportance})`);
            }

            const id = generateNoteId();
            ctx.db.saveNote({
              id,
              title: item.title as string,
              body: item.body as string,
              tags: JSON.stringify(tags),
              source_agent: item.source_agent as string,
              importance: itemImportance,
              workflow_id: item.workflow_id ?? null,
              project_id: item.project_id ?? null,
            });

            return `saved ${id} (${(item.body as string).length} chars)`;
          });
          return formatBatchResult(result, "save-note");
        }

        const topResolution = resolveNoteMode(args);
        if (topResolution.kind === "error") {
          return `Error in goop_save_note: ${topResolution.message}`;
        }

        if (topResolution.kind === "patch") {
          const updateResult = ctx.db.updateNote(args.note_id as string, {
            oldString: args.old_string as string,
            newString: args.new_string ?? "",
            replaceAll: args.replace_all ?? false,
          });

          if (!updateResult.ok) {
            return `Error in goop_save_note: ${updateResult.error}`;
          }

          return `Field Note patched: ${args.note_id}`;
        }

        if (
          args.items?.length === 0 &&
          args.note_id === undefined &&
          args.title === undefined &&
          args.body === undefined
        ) {
          return "Error in goop_save_note: items[] array is empty and no note fields were provided";
        }

        const validation = validateCreateFields(args);
        if (!validation.ok) {
          return `Error in goop_save_note: ${validation.error}`;
        }

        const importance = args.importance ?? 5;

        if (importance < 1 || importance > 10) {
          return "Error in goop_save_note: Importance must be between 1 and 10.";
        }

        const tags = normalizeTags(args.tags);

        const id = generateNoteId();

        ctx.db.saveNote({
          id,
          title: args.title as string,
          body: args.body as string,
          tags: JSON.stringify(tags),
          source_agent: args.source_agent as string,
          importance,
          workflow_id: args.workflow_id ?? null,
          project_id: args.project_id ?? null,
        });

        return `Field Note saved: ${id}\nTitle: ${args.title}\nTags: ${tags.join(", ")}\nBody chars: ${(args.body as string).length}`;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return `Error in goop_save_note: ${message}`;
      }
    },
  });
}
