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
// Tool factory
// ---------------------------------------------------------------------------

export function createGoopSaveNoteTool(ctx: PluginContext): ToolDefinition {
  return tool({
    description:
      "Save a Field Note to the global knowledge base. " +
      "Notes persist across projects and workflows, forming a compounding knowledge layer.",
    args: {
      title: tool.schema.string().describe("Brief summary of the note"),
      body: tool.schema.string().describe("Full note content (markdown)"),
      tags: tool.schema
        .array(tool.schema.string())
        .describe('Categorization tags (e.g. ["sqlite", "performance", "migration"])'),
      source_agent: tool.schema
        .string()
        .describe('Which agent is saving (e.g. "goop-researcher", "goop-explorer")'),
      importance: tool.schema
        .number()
        .optional()
        .describe("Importance level 1-10 (default 5)"),
      workflow_id: tool.schema
        .string()
        .optional()
        .describe("Originating workflow (optional)"),
      project_id: tool.schema
        .string()
        .optional()
        .describe("Originating project (optional, defaults to project name from paths)"),
    },
    async execute(
      args: {
        title: string;
        body: string;
        tags: string[];
        source_agent: string;
        importance?: number;
        workflow_id?: string;
        project_id?: string;
      },
      _context: ToolContext,
    ): Promise<string> {
      try {
        const importance = args.importance ?? 5;

        if (importance < 1 || importance > 10) {
          return "Error: Importance must be between 1 and 10.";
        }

        const id = generateNoteId();

        ctx.db.saveNote({
          id,
          title: args.title,
          body: args.body,
          tags: JSON.stringify(args.tags),
          source_agent: args.source_agent,
          importance,
          workflow_id: args.workflow_id ?? null,
          project_id: args.project_id ?? null,
        });

        return `Field Note saved: ${id}\nTitle: ${args.title}\nTags: ${args.tags.join(", ")}`;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return `Error saving Field Note: ${message}`;
      }
    },
  });
}
