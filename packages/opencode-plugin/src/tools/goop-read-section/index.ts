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
      "Read keyed sections from GoopSpecDB. WHEN TO USE: Load one section_key, several section_keys[], or — with neither key — every section for a doc_type. WHEN NOT TO USE: goop_read_db for whole documents; goop_search_docs to find sections by content across workflows. MODES: single = section_key; batch = section_keys[]; all = omit both. If both keys are sent, section_keys[] wins. RETURNS: Section content (single) or sections under \"## {key}\" headings; a \"not found\" message names goop_write_section. CAVEATS: Sections and whole documents are separate stores — content written via goop_write_db is not returned here until goop_write_section creates a keyed section. doc_type is required.",
    args: {
      doc_type: tool.schema.enum(DOC_TYPES).describe("Document type to read sections from."),
      section_key: tool.schema
        .string()
        .optional()
        .describe("Single section key to read; omit both key fields to read every section."),
      section_keys: tool.schema
        .array(tool.schema.string())
        .optional()
        .describe("Batch of section keys to read in one call."),
      workflow_id: tool.schema
        .string()
        .optional()
        .describe("Target workflow id; omit to use the active workflow."),
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
