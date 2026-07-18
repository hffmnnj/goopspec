/**
 * goop_read_section tool — read structured workflow document sections.
 *
 * Reads one section or all sections for a document from SQLite. Section reads
 * are separate from full-document goop_read_db reads.
 *
 * @module tools/goop-read-section
 */

import { tool } from "../../core/sdk-compat.js";
import type { ToolContext, ToolDefinition } from "../../core/sdk-compat.js";
import type { PluginContext } from "../../core/types.js";
import { DOC_TYPES } from "../../features/db/types.js";
import type { DocType } from "../../features/db/types.js";

// ---------------------------------------------------------------------------
// Tool factory
// ---------------------------------------------------------------------------

export function createGoopReadSectionTool(ctx: PluginContext): ToolDefinition {
  return tool({
    description:
      "Read structured workflow document sections from GoopSpecDB. " +
      "Section reads are separate from full-document goop_read_db reads.",
    args: {
      doc_type: tool.schema.enum(DOC_TYPES),
      section_key: tool.schema.string().optional(),
      section_keys: tool.schema.array(tool.schema.string()).optional(),
      workflow_id: tool.schema.string().optional(),
    },
    async execute(
      args: {
        doc_type: DocType;
        section_key?: string;
        section_keys?: string[];
        workflow_id?: string;
      },
      _context: ToolContext,
    ): Promise<string> {
      try {
        const workflowId = args.workflow_id ?? ctx.stateManager.getState().activeWorkflowId;
        const hasBatch = args.section_keys !== undefined && args.section_keys.length > 0;

        if (hasBatch) {
          const requestedKeys = args.section_keys ?? [];
          const sections = requestedKeys
            .map((key) => ctx.db.getSection(workflowId, args.doc_type, key))
            .filter((section): section is NonNullable<typeof section> => section !== null);

          if (sections.length === 0) {
            return `No matching sections found for ${args.doc_type} in workflow '${workflowId}'. Use goop_write_section to create them.`;
          }

          return sections
            .map((section) => `## ${section.section_key}\n\n${section.content}`)
            .join("\n\n---\n\n");
        }

        if (args.section_key !== undefined && args.section_key !== "") {
          const section = ctx.db.getSection(workflowId, args.doc_type, args.section_key);
          if (section) {
            return section.content;
          }

          return `No section '${args.section_key}' found for ${args.doc_type} in workflow '${workflowId}'. Use goop_write_section to create it.`;
        }

        const sections = ctx.db.getSections(workflowId, args.doc_type);
        if (sections.length === 0) {
          return `No sections found for ${args.doc_type} in workflow '${workflowId}'. Use goop_write_section to create one.`;
        }

        return sections
          .map((section) => `## ${section.section_key}\n\n${section.content}`)
          .join("\n\n---\n\n");
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        return `Error in goop_read_section: ${msg}`;
      }
    },
  });
}
