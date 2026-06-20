/**
 * goop_write_section tool — write a structured workflow document section.
 *
 * Persists one section to SQLite, logs a doc_section_write event, and renders
 * the assembled document sidecar under `.goopspec/<workflowId>/`.
 *
 * @module tools/goop-write-section
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

export function createGoopWriteSectionTool(ctx: PluginContext): ToolDefinition {
  return tool({
    description:
      "Write or update a structured workflow document section in GoopSpecDB. " +
      "Section writes are separate from full-document goop_write_db writes and render the assembled section sidecar.\n\n" +
      "Args:\n" +
      "- doc_type: Document type (spec, blueprint, chronicle, adl, handoff, requirements, research)\n" +
      "- section_key: Stable key for the section to write\n" +
      "- content: Markdown body for the section\n" +
      "- position: Optional ordering position for assembly\n" +
      "- workflow_id: Optional workflow ID (defaults to active workflow)",
    args: {
      doc_type: tool.schema.enum(DOC_TYPES),
      section_key: tool.schema.string(),
      content: tool.schema.string(),
      position: tool.schema.number().optional(),
      workflow_id: tool.schema.string().optional(),
    },
    async execute(
      args: {
        doc_type: DocType;
        section_key: string;
        content: string;
        position?: number;
        workflow_id?: string;
      },
      _context: ToolContext,
    ): Promise<string> {
      try {
        const workflowId = args.workflow_id ?? ctx.stateManager.getState().activeWorkflowId;

        ctx.db.upsertSection(
          workflowId,
          args.doc_type,
          args.section_key,
          args.content,
          args.position,
        );

        ctx.db.appendEvent(workflowId, "doc_section_write", {
          doc_type: args.doc_type,
          section_key: args.section_key,
          timestamp: Date.now(),
        });

        const sidecarContent = ctx.db.assembleDocument(workflowId, args.doc_type);
        const filename = docTypeToFilename(args.doc_type);
        const sidecarPath = getWorkflowDocPath(ctx.sdk.directory, workflowId, filename);
        mkdirSync(dirname(sidecarPath), { recursive: true });
        writeFileSync(sidecarPath, sidecarContent, "utf-8");

        return `Written section '${args.section_key}' for ${args.doc_type} in workflow '${workflowId}' (${sidecarContent.length} assembled chars). Sidecar: .goopspec/${workflowId}/${filename}`;
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        return `Error in goop_write_section: ${msg}`;
      }
    },
  });
}
