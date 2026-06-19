import { Type, type Static } from "@sinclair/typebox";
import type { GoopPiContext, PiEventContext } from "../../core/types.js";
import { GoopSpecDB } from "../../features/db/index.js";
import { logError } from "../../shared/logger.js";

const SearchNotesSchema = Type.Object({
  query: Type.String({ description: "Search query (can be empty string if tags provided)" }),
  tags: Type.Optional(Type.Array(Type.String(), { description: "Filter by tags" })),
  project_id: Type.Optional(Type.String({ description: "Scope to project" })),
  workflow_id: Type.Optional(Type.String({ description: "Scope to workflow" })),
  limit: Type.Optional(
    Type.Number({ minimum: 1, maximum: 50, description: "Max results (default 10)" }),
  ),
});

type SearchNotesArgs = Static<typeof SearchNotesSchema>;

export function createGoopSearchNotesTool(ctx: GoopPiContext) {
  return {
    name: "goop_search_notes" as const,
    description:
      "Search Field Notes with hybrid FTS5 + tag matching.",
    parameters: SearchNotesSchema,
    async execute(
      _toolCallId: string,
      args: SearchNotesArgs,
      _signal: AbortSignal,
      _onUpdate: (text: string) => void,
      _piCtx: PiEventContext,
    ): Promise<string> {
      const db = new GoopSpecDB(ctx.dbPath);
      try {
        const results = db.searchNotes(args.query, {
          tags: args.tags,
          projectId: args.project_id,
          workflowId: args.workflow_id,
          limit: args.limit ?? 10,
        });

        if (results.length === 0) {
          return `## Field Notes (0 results)\n\nNo notes found for query: "${args.query}"`;
        }

        const output = results
          .map((note) => {
            const tags = JSON.parse(note.tags) as string[];
            return [
              `### ${note.id} — ${note.title}`,
              `**Tags:** ${tags.join(", ") || "(none)"} | **Importance:** ${note.importance}/10 | **Agent:** ${note.source_agent}`,
              note.body.slice(0, 500) + (note.body.length > 500 ? "..." : ""),
              "",
            ].join("\n");
          })
          .join("---\n");

        return `## Field Notes (${results.length} result${results.length === 1 ? "" : "s"})\n\n${output}`;
      } catch (error) {
        logError("goop_search_notes failed", error);
        return `Error searching notes: ${error instanceof Error ? error.message : String(error)}`;
      } finally {
        db.close();
      }
    },
  };
}
