/**
 * goop_append_chronicle tool — append a timestamped entry to the chronicle.
 *
 * Inserts the raw entry into the `chronicle_events` table, appends a
 * timestamped heading to the chronicle document, logs a chronicle_append
 * event, and renders the updated sidecar markdown file.
 *
 * @module tools/goop-append-chronicle
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { tool } from "../../core/sdk-compat.js";
import type { ToolContext, ToolDefinition } from "../../core/sdk-compat.js";
import type { PluginContext } from "../../core/types.js";
import { getWorkflowDocPath } from "../../shared/paths.js";

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
      "- workflow_id: Optional workflow ID (defaults to active workflow)",
    args: {
      entry: tool.schema.string(),
      workflow_id: tool.schema.string().optional(),
    },
    async execute(
      args: { entry: string; workflow_id?: string },
      _context: ToolContext,
    ): Promise<string> {
      try {
        const workflowId = args.workflow_id ?? ctx.stateManager.getState().activeWorkflowId;
        const timestamp = new Date().toISOString();
        const formatted = `### ${timestamp}\n\n${args.entry}`;

        // Insert chronicle event row
        ctx.db.appendChronicleEvent(workflowId, args.entry);

        // Append to chronicle document
        ctx.db.appendDocument(workflowId, "chronicle", formatted);

        // Log chronicle_append event
        ctx.db.appendEvent(workflowId, "chronicle_append", {
          timestamp: Date.now(),
          entry_length: args.entry.length,
        });

        // Render sidecar
        const updatedDoc = ctx.db.getDocument(workflowId, "chronicle");
        const sidecarPath = getWorkflowDocPath(ctx.sdk.directory, workflowId, "CHRONICLE.md");
        mkdirSync(dirname(sidecarPath), { recursive: true });
        writeFileSync(sidecarPath, updatedDoc?.content ?? formatted, "utf-8");

        return `[OK] Chronicle entry appended (${args.entry.length} chars)`;
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        return `Error in goop_append_chronicle: ${msg}`;
      }
    },
  });
}
