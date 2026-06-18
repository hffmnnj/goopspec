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
      "Delete memories from persistent storage by ID or query. " +
      "Query-based deletes require confirm=true to prevent accidental loss. " +
      "WARNING: deletions are irreversible.",
    args: {
      id: tool.schema.number().optional().describe("Specific memory ID to delete"),
      query: tool.schema
        .string()
        .optional()
        .describe("Search query to find and delete matching memories (requires confirm=true)"),
      confirm: tool.schema
        .boolean()
        .optional()
        .describe("Set to true to confirm deletion when using query"),
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
