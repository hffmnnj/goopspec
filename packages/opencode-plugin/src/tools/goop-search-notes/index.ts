/**
 * Field Note Search Tool
 *
 * Searches Field Notes with hybrid FTS5 + tag matching. Supports scoping
 * by project, workflow, and tags.
 *
 * @module tools/goop-search-notes
 */

import { tool } from "../../core/sdk-compat.js";
import type { ToolContext, ToolDefinition } from "../../core/sdk-compat.js";
import type { PluginContext } from "../../core/types.js";
import type { FieldNoteRow } from "../../features/db/types.js";

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function sliceNoteBody(body: string, full: boolean, bodyOffset: number, bodyLimit: number): string {
  const hasRangeRequest = full || bodyOffset > 0 || bodyLimit > 0;
  if (!hasRangeRequest) {
    return body.length > 200 ? `${body.slice(0, 200)}...` : body;
  }

  const offset = Math.max(bodyOffset, 0);
  if (offset >= body.length) {
    return "";
  }

  if (bodyLimit <= 0) {
    return body.slice(offset);
  }

  return body.slice(offset, offset + bodyLimit);
}

function formatNote(
  note: FieldNoteRow,
  full: boolean,
  bodyOffset: number,
  bodyLimit: number,
): string {
  let tags: string;
  try {
    tags = (JSON.parse(note.tags) as string[]).join(", ");
  } catch {
    tags = note.tags;
  }

  const body = sliceNoteBody(note.body, full, bodyOffset, bodyLimit);

  return [
    `### ${note.id} — ${note.title}`,
    `**Tags:** ${tags} | **Importance:** ${note.importance}/10 | **Agent:** ${note.source_agent}`,
    body,
    "",
    "---",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Tool factory
// ---------------------------------------------------------------------------

export function createGoopSearchNotesTool(ctx: PluginContext): ToolDefinition {
  return tool({
    description:
      "Search Field Notes with hybrid FTS5 + tag matching. " +
      "Supports scoping by project, workflow, and tags. " +
      "Optional body control via `full`, `body_offset`, and `body_limit`. " +
      "Use `note_id` to fetch a specific note by ID (bypasses ranking, returns full body).",
    args: {
      query: tool.schema
        .string()
        .optional()
        .describe("Search query (optional when note_id provided)"),
      tags: tool.schema.array(tool.schema.string()).optional().describe("Filter by tags"),
      project_id: tool.schema.string().optional().describe("Scope to project (omit for global)"),
      workflow_id: tool.schema.string().optional().describe("Scope to workflow"),
      limit: tool.schema.number().optional().describe("Max results (default 10, max 50)"),
      full: tool.schema
        .boolean()
        .optional()
        .describe("Return full body instead of 200-char snippet"),
      body_offset: tool.schema.number().optional().describe("Character offset into note body"),
      body_limit: tool.schema
        .number()
        .optional()
        .describe("Max chars from body_offset (0 = unbounded)"),
      note_id: tool.schema
        .string()
        .optional()
        .describe("Fetch exact note by fn_... ID (bypasses search)"),
    },
    async execute(
      args: {
        query?: string;
        tags?: string[];
        project_id?: string;
        workflow_id?: string;
        limit?: number;
        full?: boolean;
        body_offset?: number;
        body_limit?: number;
        note_id?: string;
      },
      _context: ToolContext,
    ): Promise<string> {
      try {
        if (args.note_id !== undefined) {
          const note = ctx.db.getNoteById(args.note_id);
          if (!note) {
            return `No Field Note found with ID '${args.note_id}'.`;
          }
          return formatNote(note, true, 0, 0);
        }

        const query = args.query ?? "";
        const limit = Math.min(Math.max(args.limit ?? 10, 1), 50);
        const full = args.full ?? false;
        const bodyOffset = Math.max(args.body_offset ?? 0, 0);
        const bodyLimit = Math.max(args.body_limit ?? 0, 0);

        const results = ctx.db.searchNotes(query, {
          projectId: args.project_id,
          workflowId: args.workflow_id,
          tags: args.tags,
          limit,
        });

        if (!results.length) {
          const tagSuffix = args.tags?.length ? ` with tags: ${args.tags.join(", ")}` : "";
          return `No Field Notes found matching '${query}'${tagSuffix}.`;
        }

        const header = `## Field Notes (${results.length} result${results.length === 1 ? "" : "s"})\n`;
        const formatted = results
          .map((note) => formatNote(note, full, bodyOffset, bodyLimit))
          .join("\n");

        return `${header}\n${formatted}`;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return `Error searching Field Notes: ${message}`;
      }
    },
  });
}
