/**
 * goop_compact tool — trigger OpenCode session compaction with a resume handoff.
 *
 * @module tools/goop-compact
 */

import { tool } from "../../core/sdk-compat.js";
import type { ToolContext, ToolDefinition } from "../../core/sdk-compat.js";
import type { PluginContext } from "../../core/types.js";
import { log, logError } from "../../shared/logger.js";

interface ModelRef {
  providerID: string;
  modelID: string;
}

interface SessionMessage {
  info?: {
    role?: string;
    agent?: string;
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

function clearFailedCompaction(ctx: PluginContext, sessionID: string): void {
  ctx.pendingCompactions.delete(sessionID);
  ctx.compactionHandoff.delete(sessionID);
}

function observeCompaction(request: Promise<unknown>, ctx: PluginContext, sessionID: string): void {
  void request
    .then((result) => {
      const response = fieldsResponse<boolean>(result);
      if (response.error !== undefined) {
        clearFailedCompaction(ctx, sessionID);
        logError(`goop_compact request rejected: ${errorDetail(response.error)}`, response.error);
        return;
      }
      if (response.data !== true) {
        clearFailedCompaction(ctx, sessionID);
        logError(
          "goop_compact request was not confirmed by the host",
          new Error(`Unexpected compaction response: ${String(response.data)}`),
        );
        return;
      }
      ctx.pendingCompactions.delete(sessionID);
      log("goop_compact summarize settled", { sessionID });
    })
    .catch((error: unknown) => {
      clearFailedCompaction(ctx, sessionID);
      logError("goop_compact request failed", error);
    });
}

interface SummarizeBody extends ModelRef {
  auto?: boolean;
}

export function dispatchPendingCompaction(ctx: PluginContext, sessionID: string): void {
  const pending = ctx.pendingCompactions.get(sessionID);
  if (!pending || pending.status !== "queued") return;

  const summarize = ctx.sdk.client?.session?.summarize;
  if (typeof summarize !== "function") {
    clearFailedCompaction(ctx, sessionID);
    logError("goop_compact unavailable while dispatching the pending compaction");
    return;
  }

  pending.status = "in-flight";
  log("goop_compact dispatching summarize", { sessionID, auto: true });

  try {
    const body: SummarizeBody = { ...pending.model, auto: true };
    const request = summarize({ path: { id: sessionID }, body: body as SummarizeBody });
    observeCompaction(Promise.resolve(request), ctx, sessionID);
  } catch (error) {
    clearFailedCompaction(ctx, sessionID);
    logError("goop_compact failed to dispatch the pending compaction", error);
  }
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
        const session = ctx.sdk.client?.session;
        if (typeof session?.summarize !== "function") {
          return "goop_compact unavailable: session compaction is not supported on this host.";
        }

        sessionID = context.sessionID.trim();
        if (!sessionID) {
          return "goop_compact failed: a session ID is required to trigger compaction.";
        }

        if (ctx.pendingCompactions.has(sessionID)) {
          return `Compaction is already pending or in flight for session ${sessionID}; no additional compaction was requested.`;
        }

        const messagesResult = fieldsResponse<SessionMessage[]>(
          await session.messages({ path: { id: sessionID } }),
        );
        if (messagesResult.error !== undefined) {
          if (!ctx.pendingCompactions.has(sessionID)) ctx.compactionHandoff.delete(sessionID);
          const detail = errorDetail(messagesResult.error);
          logError("goop_compact failed to resolve the session model", messagesResult.error);
          return `goop_compact failed: unable to resolve the current session model: ${detail}`;
        }

        const model = currentModel(messagesResult.data ?? []);
        if (!model) {
          if (!ctx.pendingCompactions.has(sessionID)) ctx.compactionHandoff.delete(sessionID);
          return "goop_compact failed: unable to resolve the current session model.";
        }

        if (ctx.pendingCompactions.has(sessionID)) {
          return `Compaction is already pending or in flight for session ${sessionID}; no additional compaction was requested.`;
        }

        ctx.compactionHandoff.set(sessionID, args.next_step);
        ctx.pendingCompactions.set(sessionID, {
          model,
          status: "queued",
        });
        log("goop_compact queued compaction", { sessionID, model });

        return `Compaction requested for session ${sessionID}; it will apply once the current turn completes. The host will continue automatically with: ${args.next_step}`;
      } catch (error) {
        if (sessionID) {
          clearFailedCompaction(ctx, sessionID);
        }
        logError("goop_compact failed", error);
        return "goop_compact failed: unable to trigger session compaction.";
      }
    },
  });
}
