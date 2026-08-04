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

interface SlicedBody {
  body: string;
  truncated: boolean;
  bodyChars: number;
}

function sliceNoteBody(
  body: string,
  full: boolean,
  bodyOffset: number,
  bodyLimit: number,
): SlicedBody {
  const bodyChars = body.length;
  const hasRangeRequest = full || bodyOffset > 0 || bodyLimit > 0;
  if (!hasRangeRequest) {
    if (body.length > 200) {
      return { body: `${body.slice(0, 200)}...`, truncated: true, bodyChars };
    }
    return { body, truncated: false, bodyChars };
  }

  const offset = Math.max(bodyOffset, 0);
  if (offset >= body.length) {
    return { body: "", truncated: false, bodyChars };
  }

  if (bodyLimit <= 0) {
    return { body: body.slice(offset), truncated: false, bodyChars };
  }

  return { body: body.slice(offset, offset + bodyLimit), truncated: false, bodyChars };
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

  const { body, truncated, bodyChars } = sliceNoteBody(note.body, full, bodyOffset, bodyLimit);

  const lines = [
    `### ${note.id} — ${note.title}`,
    `**Tags:** ${tags} | **Importance:** ${note.importance}/10 | **Agent:** ${note.source_agent} | **Body chars:** ${bodyChars}`,
    body,
  ];

  if (truncated) {
    lines.push("*(truncated — re-fetch with full: true or note_id for the complete body)*");
  }

  lines.push("", "---");

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Tool factory
// ---------------------------------------------------------------------------

export function createGoopSearchNotesTool(ctx: PluginContext): ToolDefinition {
  return tool({
    description:
      "Search Field Notes with hybrid FTS5 plus tag matching. WHEN TO USE: To recall a reusable finding by keywords or tags, scoped to a project or workflow. WHEN NOT TO USE: memory_search for an agent's own process memory; goop_read_db for workflow documents. MODES: search = query and/or tags (default, up to 10 results, max 50); exact-fetch = note_id alone (bypasses ranking, ignores query, returns the full body). RETURNS: A markdown list of notes with tags, importance, agent, and a body slice. CAVEATS: The default body is a 200-char snippet; pass full:true for whole bodies, or body_offset/body_limit for a window (body_limit:0 means unbounded). note_id takes precedence over every other argument.",
    args: {
      query: tool.schema
        .string()
        .optional()
        .describe("Search query; optional when note_id is supplied."),
      tags: tool.schema
        .array(tool.schema.string())
        .optional()
        .describe("Filter results to notes carrying all of these tags."),
      project_id: tool.schema
        .string()
        .optional()
        .describe("Scope to a project; omit for the global knowledge base."),
      workflow_id: tool.schema.string().optional().describe("Scope to a workflow."),
      limit: tool.schema
        .number()
        .optional()
        .describe("Max results (default 10, clamped to 50)."),
      full: tool.schema
        .boolean()
        .optional()
        .describe("Return the whole body instead of a 200-char snippet."),
      body_offset: tool.schema
        .number()
        .optional()
        .describe("Character offset into the body (default 0); ignored unless full or body_limit is set."),
      body_limit: tool.schema
        .number()
        .optional()
        .describe("Max chars returned from body_offset (0 means unbounded)."),
      note_id: tool.schema
        .string()
        .optional()
        .describe("Exact fn_... id; when present, bypasses ranking and query and returns the full body."),
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
        if (args.note_id !== undefined && args.note_id.trim() !== "") {
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
