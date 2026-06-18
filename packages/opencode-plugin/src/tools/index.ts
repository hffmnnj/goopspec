/**
 * Tool Registry — wires all 16 GoopSpec tools for plugin registration.
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
import { createGoopCreatePrTool } from "./goop-create-pr/index.js";
import { createGoopReadDbTool } from "./goop-read-db/index.js";
import { createGoopReferenceTool } from "./goop-reference/index.js";
import { createGoopSaveNoteTool } from "./goop-save-note/index.js";
import { createGoopSearchNotesTool } from "./goop-search-notes/index.js";
import { createGoopSetupTool } from "./goop-setup/index.js";
import { createGoopSpecTool } from "./goop-spec/index.js";
import { createGoopStateTool } from "./goop-state/index.js";
import { createGoopStatusTool } from "./goop-status/index.js";
import { createGoopWriteDbTool } from "./goop-write-db/index.js";
import { createMemoryForgetTool } from "./memory-forget/index.js";
import { createMemorySaveTool } from "./memory-save/index.js";
import { createMemorySearchTool } from "./memory-search/index.js";
import { createSlashcommandTool } from "./slashcommand/index.js";

export {
  createGoopAdlTool,
  createGoopCheckpointTool,
  createGoopCreatePrTool,
  createGoopReadDbTool,
  createGoopReferenceTool,
  createGoopSaveNoteTool,
  createGoopSearchNotesTool,
  createGoopSetupTool,
  createGoopSpecTool,
  createGoopStateTool,
  createGoopStatusTool,
  createGoopWriteDbTool,
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
    goop_create_pr: createGoopCreatePrTool(ctx),
    goop_read_db: createGoopReadDbTool(ctx),
    goop_write_db: createGoopWriteDbTool(ctx),
    goop_save_note: createGoopSaveNoteTool(ctx),
    goop_search_notes: createGoopSearchNotesTool(ctx),
    memory_save: createMemorySaveTool(ctx),
    memory_search: createMemorySearchTool(ctx),
    memory_forget: createMemoryForgetTool(ctx),
    slashcommand: createSlashcommandTool(ctx),
  };
}
