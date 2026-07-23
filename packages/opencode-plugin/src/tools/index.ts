/**
 * Tool Registry — wires all 30 GoopSpec tools for plugin registration.
 *
 * `createTools` returns a map of canonical MCP tool names → ToolDefinition.
 * Individual factory re-exports allow direct import when only one tool is needed.
 *
 * @module tools/index
 */

import type { ToolDefinition } from "../core/sdk-compat.js";
import type { PluginContext } from "../core/types.js";
import { createGoopAcceptanceAuditTool } from "./goop-acceptance-audit/index.js";
import { createGoopAdlTool } from "./goop-adl/index.js";
import { createGoopAppendChronicleTool } from "./goop-append-chronicle/index.js";
import { createGoopBootTool } from "./goop-boot/index.js";
import { createGoopCheckpointTool } from "./goop-checkpoint/index.js";
import { createGoopCompactTool } from "./goop-compact/index.js";
import { createGoopCreatePrTool } from "./goop-create-pr/index.js";
import { createGoopGetGlobalConfigTool } from "./goop-get-global-config/index.js";
import { createGoopReadDbTool } from "./goop-read-db/index.js";
import { createGoopReferenceTool } from "./goop-reference/index.js";
import { createGoopSaveNoteTool } from "./goop-save-note/index.js";
import { createGoopSearchNotesTool } from "./goop-search-notes/index.js";
import { createGoopSetupTool } from "./goop-setup/index.js";
import { createGoopSpecTool } from "./goop-spec/index.js";
import { createGoopStateTool } from "./goop-state/index.js";
import { createGoopStatusTool } from "./goop-status/index.js";
import { createGoopWriteDbTool } from "./goop-write-db/index.js";

// --- DB architecture upgrade tools ---
import { createGoopBlockerTool } from "./goop-blocker/index.js";
import { createGoopDashboardTool } from "./goop-dashboard/index.js";
import { createGoopInferIntentTool } from "./goop-infer-intent/index.js";
import { createGoopQueryDecisionsTool } from "./goop-query-decisions/index.js";
import { createGoopReadSectionTool } from "./goop-read-section/index.js";
import { createGoopReadWaveTool } from "./goop-read-wave/index.js";
import { createGoopSearchDocsTool } from "./goop-search-docs/index.js";
import { createGoopTimelineTool } from "./goop-timeline/index.js";
import { createGoopWriteSectionTool } from "./goop-write-section/index.js";
import { createGoopWriteWaveTool } from "./goop-write-wave/index.js";

import { createAstGrepTool } from "./ast-grep/index.js";
import { createDifftasticTool } from "./difftastic/index.js";
import { createMemoryForgetTool } from "./memory-forget/index.js";
import { createMemorySaveTool } from "./memory-save/index.js";
import { createMemorySearchTool } from "./memory-search/index.js";
import { createSlashcommandTool } from "./slashcommand/index.js";

export {
  createGoopAcceptanceAuditTool,
  createGoopAdlTool,
  createGoopAppendChronicleTool,
  createGoopBootTool,
  createGoopBlockerTool,
  createGoopCheckpointTool,
  createGoopCompactTool,
  createGoopCreatePrTool,
  createGoopDashboardTool,
  createGoopGetGlobalConfigTool,
  createGoopInferIntentTool,
  createGoopQueryDecisionsTool,
  createGoopReadDbTool,
  createGoopReadSectionTool,
  createGoopReadWaveTool,
  createGoopReferenceTool,
  createGoopSaveNoteTool,
  createGoopSearchDocsTool,
  createGoopSearchNotesTool,
  createGoopSetupTool,
  createGoopSpecTool,
  createGoopStateTool,
  createGoopStatusTool,
  createGoopTimelineTool,
  createGoopWriteDbTool,
  createGoopWriteSectionTool,
  createGoopWriteWaveTool,
  createAstGrepTool,
  createDifftasticTool,
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
    goop_compact: createGoopCompactTool(ctx),
    goop_setup: createGoopSetupTool(ctx),
    goop_get_global_config: createGoopGetGlobalConfigTool(ctx),
    goop_reference: createGoopReferenceTool(ctx),
    goop_read_db: createGoopReadDbTool(ctx),
    goop_write_db: createGoopWriteDbTool(ctx),
    goop_acceptance_audit: createGoopAcceptanceAuditTool(ctx),
    goop_append_chronicle: createGoopAppendChronicleTool(ctx),
    goop_boot: createGoopBootTool(ctx),
    goop_create_pr: createGoopCreatePrTool(ctx),
    goop_save_note: createGoopSaveNoteTool(ctx),
    goop_search_notes: createGoopSearchNotesTool(ctx),

    // --- DB architecture upgrade tools ---
    goop_write_section: createGoopWriteSectionTool(ctx),
    goop_read_section: createGoopReadSectionTool(ctx),
    goop_write_wave: createGoopWriteWaveTool(ctx),
    goop_read_wave: createGoopReadWaveTool(ctx),
    goop_query_decisions: createGoopQueryDecisionsTool(ctx),
    goop_blocker: createGoopBlockerTool(ctx),
    goop_search_docs: createGoopSearchDocsTool(ctx),
    goop_timeline: createGoopTimelineTool(ctx),
    goop_dashboard: createGoopDashboardTool(ctx),
    goop_infer_intent: createGoopInferIntentTool(ctx),

    memory_save: createMemorySaveTool(ctx),
    memory_search: createMemorySearchTool(ctx),
    memory_forget: createMemoryForgetTool(ctx),
    slashcommand: createSlashcommandTool(ctx),
    ast_grep: createAstGrepTool(ctx),
    difftastic: createDifftasticTool(ctx),
  };
}
