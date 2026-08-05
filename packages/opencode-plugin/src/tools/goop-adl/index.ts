/**
 * goop_adl tool — read or append to the Automated Decision Log.
 *
 * Delegates all persistence to `ctx.stateManager.getADL()` and
 * `ctx.stateManager.appendADL()`. Never touches files directly.
 *
 * @module tools/goop-adl
 */

import { tool } from "../../core/sdk-compat.js";
import type { ToolContext, ToolDefinition } from "../../core/sdk-compat.js";
import type { ADLEntry, PluginContext } from "../../core/types.js";
import { logError } from "../../shared/logger.js";

// ---------------------------------------------------------------------------
// Tool factory
// ---------------------------------------------------------------------------

export function createGoopAdlTool(ctx: PluginContext): ToolDefinition {
  return tool({
    description:
      "Read or append to the Automated Decision Log (ADL). " +
      "WHEN TO USE: Append decisions, deviations, or observations, or read the active workflow ADL. " +
      "WHEN NOT TO USE: goop_query_decisions to filter structured decisions; goop_append_chronicle with alsoLogAdl to log alongside a chronicle entry. " +
      "MODES: read — no other fields. append — type, description, and entry_action required; rule and files optional. " +
      "RETURNS: ADL markdown on read; confirmation on append. " +
      "CAVEATS: Entries always write to the ACTIVE workflow. No workflow selector — supplying workflow_id has no effect. To target another workflow, switch active first via goop_state set-active-workflow.",
    args: {
      action: tool.schema
        .enum(["read", "append"])
        .describe("ADL operation: read the active workflow log, or append one entry to it."),
      type: tool.schema
        .enum(["decision", "deviation", "observation"])
        .optional()
        .describe(
          "Required for append; the entry kind. Omit entirely for read; do not pass an empty string.",
        ),
      description: tool.schema
        .string()
        .optional()
        .describe(
          "Required for append; what was decided, observed, or deferred. Omit entirely for read; do not pass an empty string.",
        ),
      entry_action: tool.schema
        .string()
        .optional()
        .describe(
          "Required for append; the action taken in response. Omit entirely for read; do not pass an empty string.",
        ),
      rule: tool.schema
        .number()
        .optional()
        .describe(
          "Optional for append; the Four-Rule Deviation number when type is deviation. Omit entirely when unused; do not pass an empty string.",
        ),
      files: tool.schema
        .array(tool.schema.string())
        .optional()
        .describe(
          "Optional for append; related file paths. Omit entirely when unused; do not pass an empty string.",
        ),
    },
    async execute(
      args: {
        action: "read" | "append";
        type?: "decision" | "deviation" | "observation";
        description?: string;
        entry_action?: string;
        rule?: number;
        files?: string[];
      },
      _context: ToolContext,
    ): Promise<string> {
      try {
        if (args.action === "read") {
          return ctx.stateManager.getADL();
        }

        // Append — validate required fields
        if (!args.type) {
          return "Error: 'type' is required for append action.";
        }
        if (!args.description) {
          return "Error: 'description' is required for append action.";
        }
        if (!args.entry_action) {
          return "Error: 'entry_action' is required for append action.";
        }

        const entry: ADLEntry = {
          timestamp: new Date().toISOString(),
          type: args.type,
          description: args.description,
          action: args.entry_action,
          rule: args.rule,
          files: args.files,
        };

        ctx.stateManager.appendADL(entry);

        try {
          const workflowId = ctx.stateManager.getState().activeWorkflowId;
          ctx.db.insertDecision(workflowId, {
            rule: entry.rule,
            type: entry.type,
            description: entry.description,
            action: entry.action,
            files: entry.files,
          });
        } catch (error) {
          logError("Failed to dual-write ADL entry to decisions table", error);
        }

        return `ADL entry added: [${entry.type.toUpperCase()}] ${entry.description}`;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return `Error in goop_adl: ${msg}`;
      }
    },
  });
}
