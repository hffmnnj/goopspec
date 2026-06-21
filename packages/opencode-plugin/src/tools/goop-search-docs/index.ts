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
      "Supports filtering by workflow, doc type, section key, and created_at range.",
    args: {
      query: tool.schema.string().describe("Search query"),
      workflow_id: tool.schema.string().optional().describe("Filter to a workflow ID (optional)"),
      doc_type: tool.schema.string().optional().describe("Filter to a document type (optional)"),
      section_key: tool.schema.string().optional().describe("Filter to a section key (optional)"),
      since: tool.schema
        .number()
        .optional()
        .describe("Filter to results created at or after this unix second"),
      until: tool.schema
        .number()
        .optional()
        .describe("Filter to results created at or before this unix second"),
      limit: tool.schema.number().optional().describe("Max results (default 20)"),
    },
    async execute(
      args: {
        query: string;
        workflow_id?: string;
        doc_type?: string;
        section_key?: string;
        since?: number;
        until?: number;
        limit?: number;
      },
      _context: ToolContext,
    ): Promise<string> {
      try {
        const limit = Math.min(Math.max(args.limit ?? 20, 1), 50);

        if (args.doc_type !== undefined && !DOC_TYPES.includes(args.doc_type as DocType)) {
          return `Unknown doc_type: ${args.doc_type}. Valid types: ${DOC_TYPES.join(", ")}`;
        }

        const results = ctx.db.searchDocuments(args.query, {
          workflowId: args.workflow_id,
          docType: args.doc_type as DocType | undefined,
          sectionKey: args.section_key,
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
