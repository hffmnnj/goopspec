/**
 * Memory Search Tool
 *
 * Searches persistent memory using keyword/semantic matching with optional
 * filters for type, concepts, and minimum importance.
 *
 * @module tools/memory-search
 */

import { MEMORY_TYPES } from "../../core/constants.js";
import { tool } from "../../core/sdk-compat.js";
import type { ToolContext, ToolDefinition } from "../../core/sdk-compat.js";
import type { MemorySearchResult, PluginContext } from "../../core/types.js";

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function formatResult(result: MemorySearchResult, index: number): string {
  const { memory, score, matchType } = result;
  const date = new Date(memory.createdAt).toLocaleDateString();

  const lines: string[] = [
    `### [${index + 1}] ${memory.title}`,
    `**Type:** ${memory.type} | **Score:** ${score.toFixed(2)} (${matchType}) | **Date:** ${date}`,
    "",
    memory.content.length > 500 ? `${memory.content.slice(0, 500)}...` : memory.content,
  ];

  if (memory.facts?.length) {
    lines.push("", "**Facts:**");
    for (const fact of memory.facts) {
      lines.push(`- ${fact}`);
    }
  }

  if (memory.concepts?.length) {
    lines.push("", `**Concepts:** ${memory.concepts.join(", ")}`);
  }

  if (memory.sourceFiles?.length) {
    lines.push("", `**Files:** ${memory.sourceFiles.join(", ")}`);
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Tool factory
// ---------------------------------------------------------------------------

export function createMemorySearchTool(ctx: PluginContext): ToolDefinition {
  return tool({
    description:
      "Search persistent memory using keyword and semantic matching with optional filters.",
    args: {
      query: tool.schema.string().describe("Search query"),
      limit: tool.schema.number().optional().describe("Max results (default 5, max 20)"),
      types: tool.schema
        .array(tool.schema.enum(MEMORY_TYPES))
        .optional()
        .describe("Filter by memory types"),
      concepts: tool.schema
        .array(tool.schema.string())
        .optional()
        .describe("Filter by concept tags"),
      minImportance: tool.schema.number().optional().describe("Minimum importance (1-10)"),
    },
    async execute(
      args: {
        query: string;
        limit?: number;
        types?: (typeof MEMORY_TYPES)[number][];
        concepts?: string[];
        minImportance?: number;
      },
      _context: ToolContext,
    ): Promise<string> {
      try {
        // Validate and cap limit
        const limit = Math.min(Math.max(args.limit ?? 5, 1), 20);

        const results = await ctx.memory.search({
          query: args.query,
          limit,
          types: args.types,
          concepts: args.concepts,
          minImportance: args.minImportance,
        });

        if (!results.length) {
          return [
            `No memories found matching: "${args.query}"`,
            "",
            "Tip: Try broader search terms or different keywords.",
          ].join("\n");
        }

        const lines: string[] = [
          "# Memory Search Results",
          `Found ${results.length} matching ${results.length === 1 ? "memory" : "memories"} for: "${args.query}"`,
          "",
        ];

        for (let i = 0; i < results.length; i++) {
          lines.push(formatResult(results[i], i));
          lines.push("", "---", "");
        }

        return lines.join("\n");
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return `Error searching memory: ${message}`;
      }
    },
  });
}
