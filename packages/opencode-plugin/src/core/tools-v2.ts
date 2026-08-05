/**
 * V2 tool registration adapter.
 *
 * The canonical V1 tool factories remain the source of truth. This module
 * only translates their Zod argument declarations and execution envelope for
 * the V2 runtime registration surface.
 */

import { log, logError } from "../shared/logger.js";
import { createTools } from "../tools/index.js";
import { type ToolContext, type ToolDefinition, type ToolResult, tool } from "./sdk-compat.js";
import type { PluginContext } from "./types.js";
import type {
  V2JsonSchema,
  V2RuntimeContext,
  V2ToolDefinition,
  V2ToolExecutionContext,
  V2ToolExecutionResult,
} from "./v2-compat.js";

/**
 * Convert a canonical V1 Zod argument shape to the V2 JSON Schema contract.
 *
 * MUST build AND convert with `tool.schema` (the Zod instance bundled inside
 * `@opencode-ai/plugin`). Tool args are authored with `tool.schema.*`; wrapping
 * them with the workspace `zod` and calling its `toJSONSchema` is a
 * cross-instance conversion that silently strips every `.describe()` string.
 */
export function convertToolArgsToJsonSchema(args: ToolDefinition["args"]): V2JsonSchema {
  return tool.schema.toJSONSchema(tool.schema.object(args)) as V2JsonSchema;
}

/**
 * Register every canonical GoopSpec tool with a V2 runtime.
 *
 * A missing or incompatible host capability is intentionally non-fatal: V1
 * support remains available and setup must never crash during host upgrades.
 */
export async function registerToolsV2(
  runtimeCtx: V2RuntimeContext,
  ctx: PluginContext,
): Promise<void> {
  const toolCapability = runtimeCtx.tool;
  if (!toolCapability || typeof toolCapability.transform !== "function") {
    logError("V2 tool registration skipped: runtime tool capability is unavailable");
    return;
  }

  const tools = createTools(ctx);
  // goop_compact requires a real OpenCode session-compaction client, which the
  // V2 plugin context does not provide (ctx.sdk.client is a {} stub). Omit it so
  // V2 users never see a non-functional compaction tool.
  const canCompact = typeof ctx.sdk.client?.session?.summarize === "function";
  const registrations = Object.entries(tools).filter(
    ([name]) => name !== "goop_compact" || canCompact,
  );

  try {
    await toolCapability.transform((draft) => {
      for (const [name, definition] of registrations) {
        draft.add(createV2ToolDefinition(name, definition, ctx));
      }
    });
    log("Registered GoopSpec tools with V2 runtime", { count: registrations.length });
  } catch (error) {
    logError("V2 tool registration failed", error);
  }
}

function createV2ToolDefinition(
  name: string,
  definition: ToolDefinition,
  ctx: PluginContext,
): V2ToolDefinition {
  return {
    name,
    description: definition.description,
    jsonSchema: convertToolArgsToJsonSchema(definition.args),
    execute: async (input, executionContext) => {
      const result = await definition.execute(
        input as never,
        createV1ToolContext(executionContext, ctx),
      );
      return toV2ToolExecutionResult(result);
    },
  };
}

function createV1ToolContext(
  executionContext: V2ToolExecutionContext,
  ctx: PluginContext,
): ToolContext {
  return {
    sessionID: executionContext.sessionID,
    messageID: executionContext.assistantMessageID ?? executionContext.toolCallID ?? "",
    agent: executionContext.agent ?? "goopspec",
    directory: ctx.sdk.directory,
    worktree: ctx.sdk.worktree,
    abort: new AbortController().signal,
    metadata: () => {},
    ask: async () => {
      throw new Error("The V2 tool context does not expose the V1 permission prompt API");
    },
  };
}

function toV2ToolExecutionResult(result: ToolResult): V2ToolExecutionResult {
  if (typeof result === "string") {
    return { content: [{ type: "text", text: result }] };
  }

  return {
    structured: result,
    content: [{ type: "text", text: result.output }],
  };
}
