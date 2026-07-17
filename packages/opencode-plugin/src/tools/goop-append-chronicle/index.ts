/**
 * goop_append_chronicle tool — append a timestamped entry to the chronicle.
 *
 * Inserts the raw entry into the `chronicle_events` table, appends a
 * timestamped heading to the chronicle document, logs a chronicle_append
 * event, and renders the updated sidecar markdown file.
 *
 * @module tools/goop-append-chronicle
 */

import { tool } from "../../core/sdk-compat.js";
import type { ToolContext, ToolDefinition } from "../../core/sdk-compat.js";
import type { PluginContext } from "../../core/types.js";
import { formatBatchResult, runBatch } from "../../features/db/batch.js";
import { renderSidecars } from "../../shared/render-sidecars.js";

// ---------------------------------------------------------------------------
// Per-entry processing
// ---------------------------------------------------------------------------

function appendChronicleEntry(ctx: PluginContext, workflowId: string, entry: string): string {
  const timestamp = new Date().toISOString();
  const formatted = `### ${timestamp}\n\n${entry}`;

  // Insert chronicle event row
  ctx.db.appendChronicleEvent(workflowId, entry);

  // Append to chronicle document
  ctx.db.appendDocument(workflowId, "chronicle", formatted);

  // Log chronicle_append event
  ctx.db.appendEvent(workflowId, "chronicle_append", {
    timestamp: Date.now(),
    entry_length: entry.length,
  });

  return `appended (${entry.length} chars)`;
}

// ---------------------------------------------------------------------------
// Tool factory
// ---------------------------------------------------------------------------

export function createGoopAppendChronicleTool(ctx: PluginContext): ToolDefinition {
  return tool({
    description:
      "Append a timestamped entry to the chronicle. Inserts into chronicle_events table " +
      "and appends to the chronicle document without reading the full document first.\n\n" +
      "Args:\n" +
      "- entry: The chronicle entry text\n" +
      "- workflow_id: Optional workflow ID (defaults to active workflow)\n" +
      "- entries: Optional batch of chronicle entry strings",
    args: {
      entry: tool.schema.string().optional(),
      workflow_id: tool.schema.string().optional(),
      entries: tool.schema.array(tool.schema.string()).optional(),
    },
    async execute(
      args: { entry?: string; workflow_id?: string; entries?: string[] },
      _context: ToolContext,
    ): Promise<string> {
      try {
        const workflowId = args.workflow_id ?? ctx.stateManager.getState().activeWorkflowId;

        if (args.entries !== undefined) {
          const result = runBatch(ctx.db, args.entries, (entry) =>
            appendChronicleEntry(ctx, workflowId, entry),
          );
          renderSidecars(ctx, workflowId);
          return formatBatchResult(result, "append-chronicle");
        }

        if (args.entry === undefined) {
          return "Error: 'entry' is required when no entries batch is provided.";
        }

        const detail = appendChronicleEntry(ctx, workflowId, args.entry);
        renderSidecars(ctx, workflowId);

        return `[OK] Chronicle entry ${detail}`;
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        return `Error in goop_append_chronicle: ${msg}`;
      }
    },
  });
}
