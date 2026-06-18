/**
 * goop_write_db tool — write or update a workflow document in GoopSpecDB.
 *
 * Persists the document to SQLite, logs a doc_write event, and renders
 * a markdown sidecar file under `.goopspec/<workflowId>/`.
 *
 * @module tools/goop-write-db
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { tool } from "../../core/sdk-compat.js";
import type { ToolContext, ToolDefinition } from "../../core/sdk-compat.js";
import type { PluginContext } from "../../core/types.js";
import { DOC_TYPES } from "../../features/db/types.js";
import type { DocType } from "../../features/db/types.js";
import { getWorkflowDocPath } from "../../shared/paths.js";

// ---------------------------------------------------------------------------
// DocType → filename mapping
// ---------------------------------------------------------------------------

const DOC_TYPE_FILENAMES: Record<DocType, string> = {
  spec: "SPEC.md",
  blueprint: "BLUEPRINT.md",
  chronicle: "CHRONICLE.md",
  adl: "ADL.md",
  handoff: "HANDOFF.md",
  requirements: "REQUIREMENTS.md",
  research: "RESEARCH.md",
};

function docTypeToFilename(docType: DocType): string {
  return DOC_TYPE_FILENAMES[docType];
}

// ---------------------------------------------------------------------------
// Tool factory
// ---------------------------------------------------------------------------

export function createGoopWriteDbTool(ctx: PluginContext): ToolDefinition {
  return tool({
    description:
      "Write or update a workflow document in GoopSpecDB. Renders a markdown sidecar file.\n\n" +
      "Args:\n" +
      "- doc_type: Document type (spec, blueprint, chronicle, adl, handoff, requirements, research)\n" +
      "- content: Markdown body to write\n" +
      "- workflow_id: Optional workflow ID (defaults to active workflow)",
    args: {
      doc_type: tool.schema.enum(DOC_TYPES),
      content: tool.schema.string(),
      workflow_id: tool.schema.string().optional(),
    },
    async execute(
      args: {
        doc_type: DocType;
        content: string;
        workflow_id?: string;
      },
      _context: ToolContext,
    ): Promise<string> {
      try {
        const workflowId = args.workflow_id ?? ctx.stateManager.getState().activeWorkflowId;

        // Persist to DB
        ctx.db.upsertDocument(workflowId, args.doc_type, args.content);

        // Log doc_write event
        ctx.db.appendEvent(workflowId, "doc_write", {
          doc_type: args.doc_type,
          timestamp: Date.now(),
        });

        // Render sidecar markdown file
        const filename = docTypeToFilename(args.doc_type);
        const sidecarPath = getWorkflowDocPath(ctx.sdk.directory, workflowId, filename);
        mkdirSync(dirname(sidecarPath), { recursive: true });
        writeFileSync(sidecarPath, args.content, "utf-8");

        return `Written ${args.doc_type} for workflow '${workflowId}' (${args.content.length} chars). Sidecar: .goopspec/${workflowId}/${filename}`;
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        return `Error in goop_write_db: ${msg}`;
      }
    },
  });
}
