/**
 * Tool Registry — wires all 11 GoopSpec tools for plugin registration.
 *
 * `createTools` returns a map of canonical MCP tool names → ToolDefinition.
 * Individual factory re-exports allow direct import when only one tool is needed.
 *
 * @module tools/index
 */

import type { ToolDefinition } from "../core/sdk-compat.js";
import type { PluginContext } from "../core/types.js";
import { createGoopAdlTool } from "./goop-adl/index.js";
import { createGoopCheckpointTool } from "./goop-checkpoint/index.js";
import { createGoopReferenceTool } from "./goop-reference/index.js";
import { createGoopSetupTool } from "./goop-setup/index.js";
import { createGoopSpecTool } from "./goop-spec/index.js";
import { createGoopStateTool } from "./goop-state/index.js";
import { createGoopStatusTool } from "./goop-status/index.js";
import { createMemoryForgetTool } from "./memory-forget/index.js";
import { createMemorySaveTool } from "./memory-save/index.js";
import { createMemorySearchTool } from "./memory-search/index.js";
import { createSlashcommandTool } from "./slashcommand/index.js";

export {
  createGoopAdlTool,
  createGoopCheckpointTool,
  createGoopReferenceTool,
  createGoopSetupTool,
  createGoopSpecTool,
  createGoopStateTool,
  createGoopStatusTool,
  createMemoryForgetTool,
  createMemorySaveTool,
  createMemorySearchTool,
  createSlashcommandTool,
};

export function createTools(ctx: PluginContext): Record<string, ToolDefinition> {
  return {
    goop_status: createGoopStatusTool(ctx),
    goop_state: createGoopStateTool(ctx),
    goop_spec: createGoopSpecTool(ctx),
    goop_adl: createGoopAdlTool(ctx),
    goop_checkpoint: createGoopCheckpointTool(ctx),
    goop_setup: createGoopSetupTool(ctx),
    goop_reference: createGoopReferenceTool(ctx),
    memory_save: createMemorySaveTool(ctx),
    memory_search: createMemorySearchTool(ctx),
    memory_forget: createMemoryForgetTool(ctx),
    slashcommand: createSlashcommandTool(ctx),
  };
}
