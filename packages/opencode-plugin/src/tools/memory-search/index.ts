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
import type {
  CrossStoreSearchResult,
  MemorySearchOptions,
  MemorySearchResult,
  PluginContext,
} from "../../core/types.js";
import { fuseSearchResults } from "./rrf.js";

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

function formatCrossStoreResult(result: CrossStoreSearchResult, index: number): string {
  if (result.origin === "memory") {
    const date = new Date(result.entry.createdAt).toLocaleDateString();
    return [
      `### [${index + 1}] ${result.entry.title}`,
      `**Origin:** memory | **RRF Score:** ${result.score.toFixed(4)} | **Date:** ${date}`,
      "",
      result.entry.content.length > 500
        ? `${result.entry.content.slice(0, 500)}...`
        : result.entry.content,
    ].join("\n");
  }

  const date = new Date(result.entry.created_at * 1000).toLocaleDateString();
  return [
    `### [${index + 1}] ${result.entry.title}`,
    `**Origin:** field_note | **RRF Score:** ${result.score.toFixed(4)} | **Date:** ${date}`,
    `**Agent:** ${result.entry.source_agent} | **Tags:** ${result.entry.tags}`,
    "",
    result.entry.body.length > 500 ? `${result.entry.body.slice(0, 500)}...` : result.entry.body,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Tool factory
// ---------------------------------------------------------------------------

export function createMemorySearchTool(ctx: PluginContext): ToolDefinition {
  return tool({
    description:
      "Search persistent memory by query with optional filters. " +
      "WHEN TO USE: Recall saved memories by keyword. " +
      "WHEN NOT TO USE: goop_search_notes for Field Notes; memory_forget with a query to " +
      "preview a deletion without committing it. " +
      "RETURNS: Ranked results or a no-matches tip. " +
      "CAVEATS: limit defaults to 5, clamped to 1-20. Filters AND together: types (membership), " +
      "concepts (OR within, substring on stored tags), minImportance (>=). Empty query returns " +
      "nothing. includeFieldNotes:true adds Field Notes and re-ranks all results via " +
      "reciprocal-rank fusion (k=60), tagging each origin; filters apply to memories only. " +
      "Any filter narrows results by design: a query match lacking the filter is excluded.",
    args: {
      query: tool.schema.string().describe(
        "Search query over title, content, facts, and concepts. Required; an empty or " +
          "whitespace-only query returns no results.",
      ),
      limit: tool.schema
        .number()
        .optional()
        .describe("Max results to return. Defaults to 5; clamped to the 1-20 range."),
      types: tool.schema
        .array(tool.schema.enum(MEMORY_TYPES))
        .optional()
        .describe(
          "Restrict to memories whose type is in this list " +
            "(observation, decision, note, todo, session_summary). AND-combined with other filters.",
        ),
      concepts: tool.schema.array(tool.schema.string()).optional().describe(
        "Restrict to memories tagged with any of these concepts. Multiple concepts are OR'd " +
          "within this list (a memory need only match one), then AND'd with other filters. " +
          "Matched as a case-insensitive substring against stored tags.",
      ),
      minImportance: tool.schema
        .number()
        .optional()
        .describe(
          "Exclude memories with importance below this value (>= comparison). AND-combined with other filters.",
        ),
      includeFieldNotes: tool.schema.boolean().optional().describe(
        "When true, also search Field Notes and fuse both ranked lists via reciprocal-rank " +
          "fusion (k=60), tagging each result's origin. Re-ranks every result. Filters apply to " +
          "the memory side only; Field Notes are searched by query alone. Absent and false are identical.",
      ),
    },
    async execute(
      args: {
        query: string;
        limit?: number;
        types?: (typeof MEMORY_TYPES)[number][];
        concepts?: string[];
        minImportance?: number;
        includeFieldNotes?: boolean;
      },
      _context: ToolContext,
    ): Promise<string> {
      try {
        // Validate and cap limit
        const limit = Math.min(Math.max(args.limit ?? 5, 1), 20);

        const searchOptions: MemorySearchOptions = {
          query: args.query,
          limit,
          types: args.types,
          concepts: args.concepts,
          minImportance: args.minImportance,
        };

        if (args.includeFieldNotes) {
          const [memoryResults, fieldNotes] = await Promise.all([
            ctx.memory.search(searchOptions),
            ctx.db.searchNotes(args.query, { limit }),
          ]);
          const results = fuseSearchResults(memoryResults, fieldNotes).slice(0, limit);

          if (!results.length) {
            return [
              `No memories or Field Notes found matching: "${args.query}"`,
              "",
              "Tip: Try broader search terms or different keywords.",
            ].join("\n");
          }

          const lines: string[] = [
            "# Memory Search Results",
            `Found ${results.length} matching result${results.length === 1 ? "" : "s"} for: "${args.query}"`,
            "",
          ];

          for (let i = 0; i < results.length; i++) {
            lines.push(formatCrossStoreResult(results[i], i));
            lines.push("", "---", "");
          }

          return lines.join("\n");
        }

        const results = await ctx.memory.search(searchOptions);

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
