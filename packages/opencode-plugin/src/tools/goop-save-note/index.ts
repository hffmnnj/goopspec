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

/**
 * Strip host-injected empty identifiers and scopes whose empty form carries no
 * authored intent, so the DIRECT factory agrees with the coalesced payload the
 * registry boundary (`createTools`) already produces for the same call.
 *
 * - `note_id: ""` can never address a note (ids are `fn_YYYYMMDD_random8`), so
 *   it is treated as absent — patch mode must not activate on an empty id.
 * - `workflow_id: ""` / `project_id: ""` are not real scopes; absent means the
 *   note is stored global (null scope), matching the wrapped path.
 *
 * `old_string`/`new_string` are intentionally NOT touched: an empty value there
 * is the documented blank-document patch / delete operation and is load-bearing
 * on both paths (see EMPTY_STRING_LOAD_BEARING_FIELDS_BY_TOOL).
 */
function normalizeNoteArgs<T extends NoteFields & NotePatchArgs>(item: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(item as Record<string, unknown>)) {
    if (
      value === "" &&
      (key === "note_id" || key === "workflow_id" || key === "project_id")
    ) {
      continue;
    }
    out[key] = value;
  }
  return out as T;
}

/**
 * Resolve a `tags` value to its normalized `string[]`, or an actionable error.
 *
 * An explicit empty array (`[]`) is the documented way to save an untagged
 * note and stays valid. Any other value that normalizes to nothing — `[""]`,
 * `["   "]`, an empty string, or non-string entries — is rejected rather than
 * silently producing an untagged note the caller did not author.
 */
function resolveTags(tags: unknown): { ok: true; value: string[] } | { ok: false; error: string } {
  if (tags === undefined) {
    return { ok: false, error: "tags is required for new notes" };
  }
  const normalized = normalizeTags(tags);
  if (normalized.length > 0) {
    return { ok: true, value: normalized };
  }
  if (Array.isArray(tags) && tags.length === 0) {
    return { ok: true, value: [] };
  }
  return {
    ok: false,
    error:
      "tags cannot be empty: provide at least one non-empty tag, or pass [] to save an untagged note",
  };
}

/**
 * Validate an importance value. `0` is an authored value that must NEVER be
 * reinterpreted as the default 5; it is rejected with the same explicit range
 * message on the single and batch paths.
 */
function validateImportance(importance: number): { ok: true } | { ok: false; error: string } {
  if (importance < 1 || importance > 10) {
    return { ok: false, error: "Importance must be between 1 and 10." };
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
    description:
      "Save or patch a Field Note in the global knowledge base. WHEN TO USE: To persist a reusable finding across projects, or patch an existing note by ID. WHEN NOT TO USE: memory_save for process memory; goop_search_notes to read notes back. MODES: create = title+body+tags+source_agent (importance defaults to 5); patch = note_id+old_string (+new_string/replace_all; an empty new_string deletes matched text); batch = items[] only. REJECTED: create fields with note_id; old_string/new_string/replace_all without note_id. RETURNS: The saved note id (fn_...) with char count, or a batch rollup. CAVEATS: items[] is atomic — a failure rolls back all items. Batch was historically non-atomic and could half-succeed, so retry logic built on partial failure no longer applies.",
    args: {
      title: tool.schema
        .string()
        .optional()
        .describe("Note title; required for create, rejected alongside note_id."),
      body: tool.schema
        .string()
        .optional()
        .describe("Note body markdown; required for create, rejected alongside note_id."),
      tags: tool.schema
        .array(tool.schema.string())
        .optional()
        .describe("Categorization tags; required for create, rejected alongside note_id."),
      source_agent: tool.schema
        .string()
        .optional()
        .describe("Agent saving the note; required for create, rejected alongside note_id."),
      importance: tool.schema
        .number()
        .optional()
        .describe("Importance 1-10 (defaults to 5); rejected alongside note_id."),
      workflow_id: tool.schema
        .string()
        .optional()
        .describe("Originating workflow; rejected alongside note_id."),
      project_id: tool.schema
        .string()
        .optional()
        .describe("Originating project; rejected alongside note_id."),
      note_id: tool.schema
        .string()
        .optional()
        .describe("Existing note fn_... id; presence activates patch mode — omit to create a new note."),
      old_string: tool.schema
        .string()
        .optional()
        .describe("Exact existing text to replace; required when note_id is present (presence activates patch)."),
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
            title: tool.schema
              .string()
              .optional()
              .describe("Note title for this item; required for create, rejected alongside note_id."),
            body: tool.schema
              .string()
              .optional()
              .describe("Note body markdown for this item; required for create, rejected alongside note_id."),
            tags: tool.schema
              .array(tool.schema.string())
              .optional()
              .describe("Categorization tags for this item; required for create, rejected alongside note_id."),
            source_agent: tool.schema
              .string()
              .optional()
              .describe("Agent saving this item; required for create, rejected alongside note_id."),
            importance: tool.schema
              .number()
              .optional()
              .describe("Importance 1-10 (defaults to 5) for this item."),
            workflow_id: tool.schema.string().optional().describe("Originating workflow for this item."),
            project_id: tool.schema.string().optional().describe("Originating project for this item."),
            note_id: tool.schema
              .string()
              .optional()
              .describe("Existing note fn_... id for this item; presence activates patch mode."),
            old_string: tool.schema
              .string()
              .optional()
              .describe("Exact existing text to replace; required when this item's note_id is present."),
            new_string: tool.schema
              .string()
              .optional()
              .describe("Replacement text for this item; an empty new_string deletes the matched text."),
            replace_all: tool.schema
              .boolean()
              .optional()
              .describe("Replace all occurrences instead of requiring a single match for this item."),
          }),
        )
        .optional()
        .describe(
          "Atomic batch of note writes; each item is create or patch — cannot be supplied alongside top-level create or patch fields.",
        ),
    },
    async execute(rawArgs: SaveNoteArgs, _context: ToolContext): Promise<string> {
      try {
        const args = normalizeNoteArgs(rawArgs);

        if (Array.isArray(args.items) && args.items.length > 0) {
          const result = runBatch(ctx.db, args.items, (rawItem) => {
            const item = normalizeNoteArgs(rawItem);
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

            const tagsResolution = resolveTags(item.tags);
            if (!tagsResolution.ok) {
              throw new Error(tagsResolution.error);
            }

            const itemImportance = item.importance ?? 5;
            const importanceResolution = validateImportance(itemImportance);
            if (!importanceResolution.ok) {
              throw new Error(importanceResolution.error);
            }

            const id = generateNoteId();
            ctx.db.saveNote({
              id,
              title: item.title as string,
              body: item.body as string,
              tags: JSON.stringify(tagsResolution.value),
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

        const importanceResolution = validateImportance(importance);
        if (!importanceResolution.ok) {
          return `Error in goop_save_note: ${importanceResolution.error}`;
        }

        const tagsResolution = resolveTags(args.tags);
        if (!tagsResolution.ok) {
          return `Error in goop_save_note: ${tagsResolution.error}`;
        }
        const tags = tagsResolution.value;

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
