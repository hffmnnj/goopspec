import { type Static, Type } from "@sinclair/typebox";
import type { GoopPiContext, PiEventContext } from "../../core/types.js";
import { useBuiltinWebSearch } from "../../features/runtime/index.js";
import { logError } from "../../shared/logger.js";
import { searchBrave } from "./brave-client.js";

const WebSearchSchema = Type.Object({
  query: Type.String({ description: "Search query (max 400 chars)" }),
  count: Type.Optional(
    Type.Number({ minimum: 1, maximum: 20, description: "Number of results (default 10)" }),
  ),
  country: Type.Optional(Type.String({ description: "Country code (e.g. US, GB)" })),
  freshness: Type.Optional(
    Type.String({ description: "Freshness filter: pd (24h), pw (7d), pm (31d), py (1y)" }),
  ),
});

type WebSearchArgs = Static<typeof WebSearchSchema>;

export function createGoopWebSearchTool(_ctx: GoopPiContext) {
  return {
    name: "goop_web_search" as const,
    description:
      "Search the web using Brave Search API. Returns structured results with titles, URLs, and descriptions. Used by researcher and explorer agents.",
    parameters: WebSearchSchema,
    async execute(
      _toolCallId: string,
      args: WebSearchArgs,
      _signal: AbortSignal,
      _onUpdate: (text: string) => void,
      _piCtx: PiEventContext,
    ): Promise<string> {
      if (useBuiltinWebSearch()) {
        return [
          "## omp Delegation",
          "",
          "Use the built-in `web_search` tool for this query:",
          `**Query:** ${args.query}`,
          "",
          "omp's built-in web_search supports 14 providers with higher quality than Brave alone.",
          `Call: web_search({ query: ${JSON.stringify(args.query)}${args.count ? `, count: ${args.count}` : ""} })`,
        ].join("\n");
      }

      try {
        const { results, query } = await searchBrave(args.query, {
          count: args.count ?? 10,
          country: args.country,
          freshness: args.freshness,
        });

        if (results.length === 0) {
          return `No results found for: "${query}"`;
        }

        const formatted = results
          .map((r, i) => {
            const lines = [`${i + 1}. **${r.title}**`, `   ${r.url}`];
            if (r.description) lines.push(`   ${r.description}`);
            if (r.age) lines.push(`   *${r.age}*`);
            return lines.join("\n");
          })
          .join("\n\n");

        return `## Web Search Results\n**Query:** ${query}\n**Results:** ${results.length}\n\n${formatted}`;
      } catch (error) {
        logError("goop_web_search failed", error);
        return `Error: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  };
}
