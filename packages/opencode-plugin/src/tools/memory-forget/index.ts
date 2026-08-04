/**
 * Memory Forget Tool
 *
 * Deletes memories by ID (immediate) or by search query (requires explicit
 * confirmation to prevent accidental bulk deletion).
 *
 * @module tools/memory-forget
 */

import { tool } from "../../core/sdk-compat.js";
import type { ToolContext, ToolDefinition } from "../../core/sdk-compat.js";
import type { PluginContext } from "../../core/types.js";

// ---------------------------------------------------------------------------
// Tool factory
// ---------------------------------------------------------------------------

export function createMemoryForgetTool(ctx: PluginContext): ToolDefinition {
  return tool({
    description:
      "Delete one memory by id, or every memory matching a query. Irreversible: no undo, " +
      "no recycle bin, no soft delete. " +
      "WHEN TO USE: Remove a single wrong record via id; bulk-remove a topic via query. " +
      "WHEN NOT TO USE: memory_search to inspect without deleting; goop_search_notes targets " +
      "Field Notes (a separate store this tool never touches). " +
      "MODES: id mode — send only id; deletes that one record immediately; query and confirm " +
      "are ignored. query mode — send only query; without confirm returns a read-only preview " +
      "(up to 20 matches) plus the exact confirm=true call to repeat; with confirm:true deletes " +
      "every match. Supplying neither id nor query is rejected. " +
      "RETURNS: The deletion outcome (count or not-found), or in query mode without confirm the " +
      "preview plus the confirmation call to issue next. " +
      "CAVEATS: confirm gates ONLY query-mode deletion; it does not protect id mode, which needs " +
      "no confirm. The preview caps at 20 rows but confirmed deletion searches up to 100, so the " +
      "count deleted can exceed the count previewed. A missing id returns 'not found' and deletes nothing.",
    args: {
      id: tool.schema.number().optional().describe(
        "Numeric id of the single memory to delete. When supplied, takes precedence over query " +
          "and confirm: that one record is deleted immediately and confirm is not required. " +
          "Omit when using query mode.",
      ),
      query: tool.schema.string().optional().describe(
        "Search query whose matches to delete, after confirmation. Without confirm, returns a " +
          "read-only preview; with confirm:true, deletes every match. Omit entirely when using " +
          "id mode; do not pass an empty string.",
      ),
      confirm: tool.schema.boolean().optional().describe(
        "Set to true to commit a query-mode deletion. Has no effect in id mode, which deletes " +
          "without confirmation regardless. Omit when using id mode.",
      ),
    },
    async execute(
      args: {
        id?: number;
        query?: string;
        confirm?: boolean;
      },
      _context: ToolContext,
    ): Promise<string> {
      try {
        // Must provide either id or query
        if (args.id === undefined && !args.query) {
          return "Error: Must provide either 'id' or 'query' to delete memories.";
        }

        // Delete by ID — immediate, no confirmation needed
        if (args.id !== undefined) {
          const deleted = await ctx.memory.forget(args.id);
          return deleted
            ? `Memory ${args.id} deleted successfully.`
            : `Memory ${args.id} not found.`;
        }

        // Delete by query — requires confirmation
        if (args.query) {
          // Preview what would be deleted
          const results = await ctx.memory.search({
            query: args.query,
            limit: 20,
          });

          if (!results.length) {
            return `No memories found matching: "${args.query}"`;
          }

          // Without confirmation, show preview only
          if (!args.confirm) {
            const lines: string[] = [
              `Found ${results.length} ${results.length === 1 ? "memory" : "memories"} matching: "${args.query}"`,
              "",
              "**Will delete:**",
            ];

            for (const result of results) {
              lines.push(`- [${result.memory.id}] ${result.memory.title} (${result.memory.type})`);
            }

            lines.push(
              "",
              `To confirm deletion, call memory_forget with query="${args.query}" and confirm=true`,
            );

            return lines.join("\n");
          }

          // Confirmed — use forgetByQuery for bulk deletion
          const deletedCount = await ctx.memory.forgetByQuery(args.query);
          return `Deleted ${deletedCount} ${deletedCount === 1 ? "memory" : "memories"} matching: "${args.query}"`;
        }

        return "Error: Unexpected state in memory_forget.";
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return `Error deleting memory: ${message}`;
      }
    },
  });
}
