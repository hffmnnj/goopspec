/**
 * Tool Registry — wires all 28 GoopSpec tools for plugin registration.
 *
 * `createTools` returns a map of canonical MCP tool names → ToolDefinition.
 * Individual factory re-exports allow direct import when only one tool is needed.
 *
 * @module tools/index
 */

import type { ToolDefinition } from "../core/sdk-compat.js";
import type { PluginContext } from "../core/types.js";
import { createGoopAdlTool } from "./goop-adl/index.js";
import { createGoopAppendChronicleTool } from "./goop-append-chronicle/index.js";
import { createGoopCheckpointTool } from "./goop-checkpoint/index.js";
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
import { createGoopQueryDecisionsTool } from "./goop-query-decisions/index.js";
import { createGoopReadSectionTool } from "./goop-read-section/index.js";
import { createGoopReadVerificationsTool } from "./goop-read-verifications/index.js";
import { createGoopReadWavesTool } from "./goop-read-waves/index.js";
import { createGoopRecordVerificationTool } from "./goop-record-verification/index.js";
import { createGoopSearchDocsTool } from "./goop-search-docs/index.js";
import { createGoopTimelineTool } from "./goop-timeline/index.js";
import { createGoopWriteSectionTool } from "./goop-write-section/index.js";
import { createGoopWriteTraceabilityTool } from "./goop-write-traceability/index.js";
import { createGoopWriteWaveTool } from "./goop-write-wave/index.js";

import { createMemoryForgetTool } from "./memory-forget/index.js";
import { createMemorySaveTool } from "./memory-save/index.js";
import { createMemorySearchTool } from "./memory-search/index.js";
import { createSlashcommandTool } from "./slashcommand/index.js";

export {
  createGoopAdlTool,
  createGoopAppendChronicleTool,
  createGoopBlockerTool,
  createGoopCheckpointTool,
  createGoopDashboardTool,
  createGoopQueryDecisionsTool,
  createGoopReadDbTool,
  createGoopReadSectionTool,
  createGoopReadVerificationsTool,
  createGoopReadWavesTool,
  createGoopReferenceTool,
  createGoopRecordVerificationTool,
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
  createGoopWriteTraceabilityTool,
  createGoopWriteWaveTool,
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
    goop_read_db: createGoopReadDbTool(ctx),
    goop_write_db: createGoopWriteDbTool(ctx),
    goop_append_chronicle: createGoopAppendChronicleTool(ctx),
    goop_save_note: createGoopSaveNoteTool(ctx),
    goop_search_notes: createGoopSearchNotesTool(ctx),

    // --- DB architecture upgrade tools ---
    goop_write_section: createGoopWriteSectionTool(ctx),
    goop_read_section: createGoopReadSectionTool(ctx),
    goop_write_wave: createGoopWriteWaveTool(ctx),
    goop_read_waves: createGoopReadWavesTool(ctx),
    goop_query_decisions: createGoopQueryDecisionsTool(ctx),
    goop_record_verification: createGoopRecordVerificationTool(ctx),
    goop_read_verifications: createGoopReadVerificationsTool(ctx),
    goop_blocker: createGoopBlockerTool(ctx),
    goop_write_traceability: createGoopWriteTraceabilityTool(ctx),
    goop_search_docs: createGoopSearchDocsTool(ctx),
    goop_timeline: createGoopTimelineTool(ctx),
    goop_dashboard: createGoopDashboardTool(ctx),

    memory_save: createMemorySaveTool(ctx),
    memory_search: createMemorySearchTool(ctx),
    memory_forget: createMemoryForgetTool(ctx),
    slashcommand: createSlashcommandTool(ctx),
  };
}
