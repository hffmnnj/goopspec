import { Type, type Static } from "@sinclair/typebox";
import type { GoopPiContext, PiEventContext } from "../../core/types.js";
import { GoopSpecDB } from "../../features/db/index.js";
import { logError } from "../../shared/logger.js";
import type { DocType } from "../../features/db/types.js";
import { DOC_TYPES } from "../../features/db/types.js";

const WriteDbSchema = Type.Object({
  doc_type: Type.String({
    description:
      "Document type: spec, blueprint, chronicle, requirements, research, adl, handoff",
  }),
  content: Type.String({ description: "Markdown content to write" }),
  workflow_id: Type.Optional(
    Type.String({ description: "Workflow ID (defaults to active)" }),
  ),
  mode: Type.Optional(
    Type.Union([Type.Literal("replace"), Type.Literal("append")], {
      description: "Write mode: replace (default) or append",
    }),
  ),
});

type WriteDbArgs = Static<typeof WriteDbSchema>;

export function createGoopWriteDbTool(ctx: GoopPiContext) {
  return {
    name: "goop_write_db" as const,
    description:
      "Write or update a workflow document in GoopSpecDB. Renders a markdown sidecar file automatically.",
    parameters: WriteDbSchema,
    async execute(
      _toolCallId: string,
      args: WriteDbArgs,
      _signal: AbortSignal,
      _onUpdate: (text: string) => void,
      _piCtx: PiEventContext,
    ): Promise<string> {
      const db = new GoopSpecDB(ctx.dbPath);
      try {
        if (!DOC_TYPES.includes(args.doc_type as DocType)) {
          return `Invalid doc_type '${args.doc_type}'. Valid types: ${DOC_TYPES.join(", ")}`;
        }

        const docType = args.doc_type as DocType;
        const workflowId = args.workflow_id ?? "default";
        const mode = args.mode ?? "replace";

        if (mode === "append") {
          db.appendDocument(workflowId, docType, args.content);
          const doc = db.getDocument(workflowId, docType);
          const totalChars = doc?.content.length ?? 0;
          db.renderMarkdownSidecar(ctx.projectDir, workflowId, docType, doc?.content ?? "");
          return `Written ${args.doc_type} for workflow '${workflowId}' (${args.content.length} chars, mode: append). Sidecar: .goopspec/${workflowId}/${docType.toUpperCase()}.md (total: ${totalChars} chars)`;
        }

        db.upsertDocument(workflowId, docType, args.content);
        db.renderMarkdownSidecar(ctx.projectDir, workflowId, docType, args.content);
        return `Written ${args.doc_type} for workflow '${workflowId}' (${args.content.length} chars, mode: replace). Sidecar: .goopspec/${workflowId}/${docType.toUpperCase()}.md`;
      } catch (error) {
        logError("goop_write_db failed", error);
        return `Error writing document: ${error instanceof Error ? error.message : String(error)}`;
      } finally {
        db.close();
      }
    },
  };
}
