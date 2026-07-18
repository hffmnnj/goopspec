/**
 * goop_query_decisions tool — query tracked decisions from GoopSpecDB.
 *
 * Reads the structured `decisions` table populated by ADL dual-writes and
 * returns a readable markdown summary.
 *
 * @module tools/goop-query-decisions
 */

import { tool } from "../../core/sdk-compat.js";
import type { ToolContext, ToolDefinition } from "../../core/sdk-compat.js";
import type { PluginContext } from "../../core/types.js";
import type { DecisionRow } from "../../features/db/types.js";

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatTimestamp(createdAt: number): string {
  return new Date(createdAt * 1000).toISOString();
}

function formatFiles(filesJson: string): string {
  try {
    const parsed = JSON.parse(filesJson) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return "none";
    }

    const files = parsed.filter((file): file is string => typeof file === "string");
    return files.length > 0 ? files.join(", ") : "none";
  } catch {
    return filesJson.trim() ? filesJson : "none";
  }
}

function formatDecision(decision: DecisionRow): string {
  const rule = decision.rule === null ? "none" : String(decision.rule);
  return [
    `- **${formatTimestamp(decision.created_at)}**`,
    `  - Rule: ${rule}`,
    `  - Type: ${decision.type}`,
    `  - Description: ${decision.description}`,
    `  - Action: ${decision.action}`,
    `  - Files: ${formatFiles(decision.files)}`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Tool factory
// ---------------------------------------------------------------------------

export function createGoopQueryDecisionsTool(ctx: PluginContext): ToolDefinition {
  return tool({
    description:
      "Query structured decisions captured from the Automated Decision Log. " +
      "Omit workflow_id to search across all workflows.",
    args: {
      rule: tool.schema.number().optional(),
      rules: tool.schema.array(tool.schema.number()).optional(),
      type: tool.schema.string().optional(),
      types: tool.schema.array(tool.schema.string()).optional(),
      workflow_id: tool.schema.string().optional(),
      limit: tool.schema.number().optional(),
    },
    async execute(
      args: {
        rule?: number;
        rules?: number[];
        type?: string;
        types?: string[];
        workflow_id?: string;
        limit?: number;
      },
      _context: ToolContext,
    ): Promise<string> {
      try {
        const decisions = ctx.db.getDecisions({
          workflowId: args.workflow_id,
          rule: args.rule,
          rules: args.rules,
          type: args.type,
          types: args.types,
          limit: args.limit,
        });

        if (decisions.length === 0) {
          return "No decisions found for the provided filters.";
        }

        return `# Decisions\n\n${decisions.map(formatDecision).join("\n\n")}`;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return `Error in goop_query_decisions: ${msg}`;
      }
    },
  });
}
