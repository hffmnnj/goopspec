import { Type, type Static } from "@sinclair/typebox";
import type { GoopPiContext, PiEventContext } from "../../core/types.js";
import { GoopSpecDB } from "../../features/db/index.js";
import { logError } from "../../shared/logger.js";
import type { DocType } from "../../features/db/types.js";
import { DOC_TYPES } from "../../features/db/types.js";

const ReadDbSchema = Type.Object({
  doc_type: Type.Optional(
    Type.String({ description: "Single doc type to read" }),
  ),
  doc_types: Type.Optional(
    Type.Array(Type.String(), { description: "Multiple doc types to read (batch)" }),
  ),
  workflow_id: Type.Optional(
    Type.String({ description: "Workflow ID (defaults to active)" }),
  ),
});

type ReadDbArgs = Static<typeof ReadDbSchema>;

export function createGoopReadDbTool(ctx: GoopPiContext) {
  return {
    name: "goop_read_db" as const,
    description:
      "Read workflow documents (spec, blueprint, chronicle, requirements, research, adl, handoff) from GoopSpecDB.",
    parameters: ReadDbSchema,
    async execute(
      _toolCallId: string,
      args: ReadDbArgs,
      _signal: AbortSignal,
      _onUpdate: (text: string) => void,
      _piCtx: PiEventContext,
    ): Promise<string> {
      const db = new GoopSpecDB(ctx.dbPath);
      try {
        const workflowId = args.workflow_id ?? "default";
        const typesToFetch: DocType[] = [];

        if (args.doc_types && args.doc_types.length > 0) {
          for (const t of args.doc_types) {
            if (DOC_TYPES.includes(t as DocType)) {
              typesToFetch.push(t as DocType);
            }
          }
        } else if (args.doc_type && DOC_TYPES.includes(args.doc_type as DocType)) {
          typesToFetch.push(args.doc_type as DocType);
        }

        if (typesToFetch.length === 0) {
          return `No valid doc_type provided. Valid types: ${DOC_TYPES.join(", ")}`;
        }

        const results: string[] = [];
        for (const docType of typesToFetch) {
          const doc = db.getDocument(workflowId, docType);
          if (!doc) {
            results.push(`## ${docType}\n\n(not found)`);
          } else {
            if (typesToFetch.length > 1) {
              results.push(`## ${docType}\n\n${doc.content}`);
            } else {
              results.push(doc.content);
            }
          }
        }

        return results.join("\n\n---\n\n");
      } catch (error) {
        logError("goop_read_db failed", error);
        return `Error reading document: ${error instanceof Error ? error.message : String(error)}`;
      } finally {
        db.close();
      }
    },
  };
}
