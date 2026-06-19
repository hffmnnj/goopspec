import { Type, type Static } from "@sinclair/typebox";
import type { GoopPiContext, PiEventContext } from "../../core/types.js";
import { GoopSpecDB } from "../../features/db/index.js";
import { logError } from "../../shared/logger.js";

const SaveNoteSchema = Type.Object({
  title: Type.String({ description: "Brief summary of the note (max 100 chars)" }),
  body: Type.String({ description: "Full note content (markdown)" }),
  tags: Type.Array(Type.String(), { description: "Categorization tags" }),
  source_agent: Type.String({ description: "Which agent is saving (e.g. goop-researcher)" }),
  importance: Type.Optional(
    Type.Number({ minimum: 1, maximum: 10, description: "Importance 1-10 (default 5)" }),
  ),
  workflow_id: Type.Optional(Type.String()),
  project_id: Type.Optional(Type.String()),
});

type SaveNoteArgs = Static<typeof SaveNoteSchema>;

function generateNoteId(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  const random = Math.random().toString(36).slice(2, 10);
  return `fn_${date}_${random}`;
}

export function createGoopSaveNoteTool(ctx: GoopPiContext) {
  return {
    name: "goop_save_note" as const,
    description:
      "Save a Field Note to the global knowledge base. Notes persist across projects and workflows.",
    parameters: SaveNoteSchema,
    async execute(
      _toolCallId: string,
      args: SaveNoteArgs,
      _signal: AbortSignal,
      _onUpdate: (text: string) => void,
      _piCtx: PiEventContext,
    ): Promise<string> {
      const db = new GoopSpecDB(ctx.dbPath);
      try {
        const id = generateNoteId();
        const importance = Math.min(10, Math.max(1, Math.round(args.importance ?? 5)));
        db.saveNote({
          id,
          title: args.title.slice(0, 100),
          body: args.body,
          tags: JSON.stringify(args.tags),
          source_agent: args.source_agent,
          importance,
          workflow_id: args.workflow_id ?? null,
          project_id: args.project_id ?? null,
        });
        return `[OK] Field Note saved: ${id} — "${args.title}" (importance: ${importance}/10, tags: [${args.tags.join(", ")}])`;
      } catch (error) {
        logError("goop_save_note failed", error);
        return `Error saving note: ${error instanceof Error ? error.message : String(error)}`;
      } finally {
        db.close();
      }
    },
  };
}
