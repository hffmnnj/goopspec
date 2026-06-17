/**
 * Tools barrel export and factory
 * @module tools
 */

import type { ToolDefinition } from "@opencode-ai/plugin/tool";
import type { PluginContext } from "../core/types.js";

import { createGoopStatusTool } from "./goop-status/index.js";
import { createGoopAdlTool } from "./goop-adl/index.js";
import { createGoopSpecTool } from "./goop-spec/index.js";
import { createGoopCheckpointTool } from "./goop-checkpoint/index.js";
import { createGoopSkillTool } from "./goop-skill/index.js";
import { createGoopReferenceTool } from "./goop-reference/index.js";
import { createSlashcommandTool } from "./slashcommand/index.js";
import { createGoopSetupTool } from "./goop-setup/index.js";
import { createGoopStateTool } from "./goop-state/index.js";
import { createWorktreeCreateTool } from "./worktree-create/index.js";
import { createWorktreeDeleteTool } from "./worktree-delete/index.js";

// Memory tools
import { createMemorySaveTool } from "./memory-save/index.js";
import { createMemorySearchTool } from "./memory-search/index.js";
import { createMemoryNoteTool } from "./memory-note/index.js";
import { createMemoryDecisionTool } from "./memory-decision/index.js";
import { createMemoryForgetTool } from "./memory-forget/index.js";

// Session tools
import { createSessionSearchTool } from "./session-search/index.js";

// Daemon tools
import { createGoopDaemonStatusTool } from "./goop-daemon-status/index.js";
import { createGoopDaemonProjectsTool } from "./goop-daemon-projects/index.js";
import { createGoopDaemonWorkflowTool } from "./goop-daemon-workflow/index.js";
import { createGoopDaemonItemsTool } from "./goop-daemon-items/index.js";

/**
 * Map of tool name to tool definition
 * Uses the SDK's ToolDefinition type for proper type checking
 */
export interface ToolsMap {
  [key: string]: ToolDefinition;
}

/**
 * Create all GoopSpec tools
 * 
 * Note: Each tool factory returns ToolDefinition from @opencode-ai/plugin/tool
 * which is compatible with the Hooks["tool"] type expected by OpenCode
 */
export function createTools(ctx: PluginContext): ToolsMap {
  return {
    // Core GoopSpec tools
    goop_status: createGoopStatusTool(ctx),
    goop_state: createGoopStateTool(ctx),
    goop_adl: createGoopAdlTool(ctx),
    goop_spec: createGoopSpecTool(ctx),
    goop_checkpoint: createGoopCheckpointTool(ctx),
    goop_skill: createGoopSkillTool(ctx),
    goop_reference: createGoopReferenceTool(ctx),
    goop_setup: createGoopSetupTool(ctx),
    worktree_create: createWorktreeCreateTool(ctx),
    worktree_delete: createWorktreeDeleteTool(ctx),
    slashcommand: createSlashcommandTool(ctx),
    
    // Memory tools
    memory_save: createMemorySaveTool(ctx),
    memory_search: createMemorySearchTool(ctx),
    memory_note: createMemoryNoteTool(ctx),
    memory_decision: createMemoryDecisionTool(ctx),
    memory_forget: createMemoryForgetTool(ctx),
    
    // Session tools
    session_search: createSessionSearchTool(ctx),

    // Daemon tools
    goop_daemon_status: createGoopDaemonStatusTool(ctx),
    goop_daemon_projects: createGoopDaemonProjectsTool(ctx),
    goop_daemon_workflow: createGoopDaemonWorkflowTool(ctx),
    goop_daemon_items: createGoopDaemonItemsTool(ctx),
  };
}

// Re-export individual tool factories
export { createGoopStatusTool } from "./goop-status/index.js";
export { createGoopStateTool } from "./goop-state/index.js";
export { createGoopAdlTool } from "./goop-adl/index.js";
export { createGoopSpecTool } from "./goop-spec/index.js";
export { createGoopCheckpointTool } from "./goop-checkpoint/index.js";
export { createGoopSkillTool } from "./goop-skill/index.js";
export { createGoopReferenceTool } from "./goop-reference/index.js";
export { createGoopSetupTool } from "./goop-setup/index.js";
export { createSlashcommandTool } from "./slashcommand/index.js";
export { createWorktreeCreateTool } from "./worktree-create/index.js";
export { createWorktreeDeleteTool } from "./worktree-delete/index.js";

// Memory tool exports
export { createMemorySaveTool } from "./memory-save/index.js";
export { createMemorySearchTool } from "./memory-search/index.js";
export { createMemoryNoteTool } from "./memory-note/index.js";
export { createMemoryDecisionTool } from "./memory-decision/index.js";
export { createMemoryForgetTool } from "./memory-forget/index.js";

// Session tool exports
export { createSessionSearchTool } from "./session-search/index.js";

// Daemon tool exports
export { createGoopDaemonStatusTool } from "./goop-daemon-status/index.js";
export { createGoopDaemonProjectsTool } from "./goop-daemon-projects/index.js";
export { createGoopDaemonWorkflowTool } from "./goop-daemon-workflow/index.js";
export { createGoopDaemonItemsTool } from "./goop-daemon-items/index.js";
