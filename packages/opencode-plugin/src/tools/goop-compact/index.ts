/**
 * goop_compact tool — trigger OpenCode session compaction with a resume handoff.
 *
 * @module tools/goop-compact
 */

import { tool } from "../../core/sdk-compat.js";
import type { ToolContext, ToolDefinition } from "../../core/sdk-compat.js";
import type { PluginContext } from "../../core/types.js";
import { logError } from "../../shared/logger.js";

interface ModelRef {
  providerID: string;
  modelID: string;
}

interface SessionMessage {
  info?: {
    role?: string;
    model?: ModelRef;
    providerID?: string;
    modelID?: string;
  };
}

interface FieldsResponse<T> {
  data?: T;
  error?: unknown;
}

function fieldsResponse<T>(value: unknown): FieldsResponse<T> {
  if (value !== null && typeof value === "object" && ("data" in value || "error" in value)) {
    return value as FieldsResponse<T>;
  }
  return { data: value as T };
}

function errorDetail(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error !== null && typeof error === "object") {
    const value = error as { message?: unknown; data?: { message?: unknown } };
    if (typeof value.data?.message === "string") return value.data.message;
    if (typeof value.message === "string") return value.message;
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
  return String(error);
}

function currentModel(messages: SessionMessage[]): ModelRef | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const info = messages[index]?.info;
    if (info?.role === "user" && info.model?.providerID && info.model.modelID) {
      return info.model;
    }
  }

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const info = messages[index]?.info;
    if (info?.providerID && info.modelID) {
      return { providerID: info.providerID, modelID: info.modelID };
    }
  }

  return undefined;
}

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

        const messagesResult = fieldsResponse<SessionMessage[]>(
          await ctx.sdk.client.session.messages({ path: { id: sessionID } }),
        );
        if (messagesResult.error !== undefined) {
          ctx.compactionHandoff.delete(sessionID);
          const detail = errorDetail(messagesResult.error);
          logError("goop_compact failed to resolve the session model", messagesResult.error);
          return `goop_compact failed: unable to resolve the current session model: ${detail}`;
        }

        const model = currentModel(messagesResult.data ?? []);
        if (!model) {
          ctx.compactionHandoff.delete(sessionID);
          return "goop_compact failed: unable to resolve the current session model.";
        }

        ctx.compactionHandoff.set(sessionID, args.next_step);
        // SDK 1.18.3 SessionSummarizeData names the model body and returns a
        // boolean 200 payload. The generated body is optional for legacy
        // compatibility, but the host route requires providerID and modelID.
        const summarizeResult = fieldsResponse<boolean>(
          await ctx.sdk.client.session.summarize({
            path: { id: sessionID },
            body: model,
          }),
        );

        if (summarizeResult.error !== undefined) {
          ctx.compactionHandoff.delete(sessionID);
          const detail = errorDetail(summarizeResult.error);
          logError("goop_compact request rejected", summarizeResult.error);
          return `goop_compact failed: session compaction was rejected: ${detail}`;
        }

        if (summarizeResult.data !== true) {
          ctx.compactionHandoff.delete(sessionID);
          return "goop_compact failed: the host did not confirm session compaction.";
        }

        return `Compaction completed for session ${sessionID}. Will resume with: ${args.next_step}`;
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
