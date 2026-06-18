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

function formatNote(note: FieldNoteRow): string {
  let tags: string;
  try {
    tags = (JSON.parse(note.tags) as string[]).join(", ");
  } catch {
    tags = note.tags;
  }

  const snippet = note.body.length > 200 ? `${note.body.slice(0, 200)}...` : note.body;

  return [
    `### ${note.id} — ${note.title}`,
    `**Tags:** ${tags} | **Importance:** ${note.importance}/10 | **Agent:** ${note.source_agent}`,
    snippet,
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
      "Supports scoping by project, workflow, and tags.",
    args: {
      query: tool.schema.string().describe("Search query (can be empty string if tags provided)"),
      tags: tool.schema
        .array(tool.schema.string())
        .optional()
        .describe("Filter by tags (optional)"),
      project_id: tool.schema
        .string()
        .optional()
        .describe("Scope to project (optional; omit for global search)"),
      workflow_id: tool.schema.string().optional().describe("Scope to workflow (optional)"),
      limit: tool.schema.number().optional().describe("Max results (default 10, max 50)"),
    },
    async execute(
      args: {
        query: string;
        tags?: string[];
        project_id?: string;
        workflow_id?: string;
        limit?: number;
      },
      _context: ToolContext,
    ): Promise<string> {
      try {
        const limit = Math.min(Math.max(args.limit ?? 10, 1), 50);

        const results = ctx.db.searchNotes(args.query, {
          projectId: args.project_id,
          workflowId: args.workflow_id,
          tags: args.tags,
          limit,
        });

        if (!results.length) {
          const tagSuffix = args.tags?.length ? ` with tags: ${args.tags.join(", ")}` : "";
          return `No Field Notes found matching '${args.query}'${tagSuffix}.`;
        }

        const header = `## Field Notes (${results.length} result${results.length === 1 ? "" : "s"})\n`;
        const formatted = results.map(formatNote).join("\n");

        return `${header}\n${formatted}`;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return `Error searching Field Notes: ${message}`;
      }
    },
  });
}
