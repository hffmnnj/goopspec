/**
 * goop_compact tool — trigger OpenCode session compaction with a resume handoff.
 *
 * @module tools/goop-compact
 */

import { tool } from "../../core/sdk-compat.js";
import type { ToolContext, ToolDefinition } from "../../core/sdk-compat.js";
import type { PluginContext } from "../../core/types.js";
import { logError } from "../../shared/logger.js";

export function createGoopCompactTool(ctx: PluginContext): ToolDefinition {
  return tool({
    description: "Trigger session compaction and record the immediate resume step.",
    args: {
      next_step: tool.schema
        .string()
        .describe(
          "A short 1-2 sentence description of what the Orchestrator will do immediately after compaction.",
        ),
    },
    async execute(args: { next_step: string }, context: ToolContext): Promise<string> {
      let sessionID: string | undefined;

      try {
        if (typeof ctx.sdk.client?.session?.summarize !== "function") {
          return "goop_compact unavailable: session compaction is not supported on this host.";
        }

        sessionID = context.sessionID.trim();
        if (!sessionID) {
          return "goop_compact failed: a session ID is required to trigger compaction.";
        }

        ctx.compactionHandoff.set(sessionID, args.next_step);
        await ctx.sdk.client.session.summarize({ path: { id: sessionID } });

        return `Compaction triggered for session ${sessionID}. Will resume with: ${args.next_step}`;
      } catch (error) {
        if (sessionID) {
          ctx.compactionHandoff.delete(sessionID);
        }
        logError("goop_compact failed", error);
        return "goop_compact failed: unable to trigger session compaction.";
      }
    },
  });
}
