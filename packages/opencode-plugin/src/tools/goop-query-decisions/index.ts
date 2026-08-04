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
      "Query structured decisions dual-written from the Automated Decision Log across one or all workflows. " +
      "WHEN TO USE: Review past decisions, deviations, or observations by rule, type, or workflow. " +
      "WHEN NOT TO USE: goop_adl appends new entries; goop_read_db loads the full ADL document; goop_timeline merges decisions into a chronological audit trail. " +
      "RETURNS: A markdown list of decisions (timestamp, rule, type, description, action, files), newest first; a no-results message when empty. " +
      "CAVEATS: Omit workflow_id to search across ALL workflows — the default is cross-workflow, not the active workflow. rules[] overrides rule; types[] overrides type. limit defaults to 50.",
    args: {
      rule: tool.schema
        .number()
        .optional()
        .describe("Filter to a single rule number; ignored when rules[] is supplied."),
      rules: tool.schema
        .array(tool.schema.number())
        .optional()
        .describe("Filter to any of these rule numbers; takes precedence over rule when supplied."),
      type: tool.schema
        .string()
        .optional()
        .describe(
          "Filter to a single decision type (e.g. decision, deviation, observation); ignored when types[] is supplied.",
        ),
      types: tool.schema
        .array(tool.schema.string())
        .optional()
        .describe("Filter to any of these decision types; takes precedence over type when supplied."),
      workflow_id: tool.schema
        .string()
        .optional()
        .describe(
          "Scope to one workflow; omit to search across ALL workflows (the default is cross-workflow, not the active workflow).",
        ),
      limit: tool.schema
        .number()
        .optional()
        .describe("Maximum number of decisions to return; defaults to 50."),
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
