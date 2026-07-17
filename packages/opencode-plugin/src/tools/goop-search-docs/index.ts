/**
 * goop_search_docs tool — search workflow documents and sections.
 *
 * Searches document blobs and structured document sections across workflows,
 * returning a unified ranked list with source metadata.
 *
 * @module tools/goop-search-docs
 */

import { tool } from "../../core/sdk-compat.js";
import type { ToolContext, ToolDefinition } from "../../core/sdk-compat.js";
import type { PluginContext } from "../../core/types.js";
import type { DocumentSearchResult } from "../../features/db/index.js";
import { DOC_TYPES } from "../../features/db/types.js";
import type { DocType } from "../../features/db/types.js";

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function formatTimestamp(seconds: number): string {
  return new Date(seconds * 1000).toISOString();
}

function formatSnippet(content: string): string {
  const singleLine = content.replace(/\s+/g, " ").trim();
  return singleLine.length > 160 ? `${singleLine.slice(0, 160)}...` : singleLine;
}

function formatResult(result: DocumentSearchResult, index: number): string {
  const sectionLine =
    result.source === "section" ? `- **section_key:** ${result.section_key ?? ""}` : null;
  const metadata = [
    `- **source:** ${result.source}`,
    `- **workflow_id:** ${result.workflow_id}`,
    `- **doc_type:** ${result.doc_type}`,
    sectionLine,
    `- **created_at:** ${formatTimestamp(result.created_at)}`,
  ].filter((line): line is string => line !== null);

  return [
    `### ${index + 1}. ${result.workflow_id}/${result.doc_type}`,
    ...metadata,
    "",
    formatSnippet(result.content),
    "",
    "---",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Tool factory
// ---------------------------------------------------------------------------

export function createGoopSearchDocsTool(ctx: PluginContext): ToolDefinition {
  return tool({
    description:
      "Search workflow documents and sections across all workflows. " +
      "Plural filters (workflow_ids, doc_types, section_keys) use OR matching.",
    args: {
      query: tool.schema.string().describe("Search query"),
      workflow_id: tool.schema.string().optional().describe("Filter by workflow ID"),
      workflow_ids: tool.schema
        .array(tool.schema.string())
        .optional()
        .describe("Filter by any of these workflow IDs"),
      doc_type: tool.schema.string().optional().describe("Filter by document type"),
      doc_types: tool.schema
        .array(tool.schema.string())
        .optional()
        .describe("Filter by any of these document types"),
      section_key: tool.schema.string().optional().describe("Filter by section key"),
      section_keys: tool.schema
        .array(tool.schema.string())
        .optional()
        .describe("Filter by any of these section keys"),
      since: tool.schema
        .number()
        .optional()
        .describe("Results created at or after this unix second"),
      until: tool.schema
        .number()
        .optional()
        .describe("Results created at or before this unix second"),
      limit: tool.schema.number().optional().describe("Max results (default 20)"),
    },
    async execute(
      args: {
        query: string;
        workflow_id?: string;
        workflow_ids?: string[];
        doc_type?: string;
        doc_types?: string[];
        section_key?: string;
        section_keys?: string[];
        since?: number;
        until?: number;
        limit?: number;
      },
      _context: ToolContext,
    ): Promise<string> {
      try {
        const limit = Math.min(Math.max(args.limit ?? 20, 1), 50);

        const requestedDocTypes =
          args.doc_types !== undefined && args.doc_types.length > 0
            ? args.doc_types
            : args.doc_type !== undefined
              ? [args.doc_type]
              : [];
        const invalid = requestedDocTypes.filter((t) => !DOC_TYPES.includes(t as DocType));
        if (invalid.length > 0) {
          return `Unknown doc_type(s): ${invalid.join(", ")}. Valid types: ${DOC_TYPES.join(", ")}`;
        }

        const requestedWorkflowIds =
          args.workflow_ids !== undefined && args.workflow_ids.length > 0
            ? args.workflow_ids
            : args.workflow_id !== undefined
              ? [args.workflow_id]
              : [];
        const requestedSectionKeys =
          args.section_keys !== undefined && args.section_keys.length > 0
            ? args.section_keys
            : args.section_key !== undefined
              ? [args.section_key]
              : [];

        const results = ctx.db.searchDocuments(args.query, {
          workflowIds: requestedWorkflowIds,
          docTypes: requestedDocTypes as DocType[],
          sectionKeys: requestedSectionKeys,
          since: args.since,
          until: args.until,
          limit,
        });

        if (!results.length) {
          return `No documents or sections found matching '${args.query}'.`;
        }

        const header = `## Document Search Results (${results.length} result${results.length === 1 ? "" : "s"})`;
        const formatted = results.map(formatResult).join("\n");

        return `${header}\n\n${formatted}`;
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        return `Error in goop_search_docs: ${msg}`;
      }
    },
  });
}
