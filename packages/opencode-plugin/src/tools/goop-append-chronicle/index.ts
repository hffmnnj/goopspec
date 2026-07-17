/**
 * goop_append_chronicle tool — append a timestamped entry to the chronicle.
 *
 * Inserts the raw entry into the `chronicle_events` table, appends a
 * timestamped heading to the chronicle document, logs a chronicle_append
 * event, and renders the updated sidecar markdown file.
 *
 * Optional `alsoLogAdl` and `alsoSaveMemory` payloads let callers append
 * an ADL entry or save a memory in the same call. Because chronicle, ADL,
 * and memory live in three separate stores, these auxiliary writes are
 * best-effort sequential writes with no shared transaction boundary.
 *
 * @module tools/goop-append-chronicle
 */

import { MEMORY_TYPES } from "../../core/constants.js";
import { tool } from "../../core/sdk-compat.js";
import type { ToolContext, ToolDefinition } from "../../core/sdk-compat.js";
import type { ADLEntry, MemorySaveInput, MemoryType, PluginContext } from "../../core/types.js";
import { formatBatchResult, runBatch } from "../../features/db/batch.js";
import { logError } from "../../shared/logger.js";
import { renderSidecars } from "../../shared/render-sidecars.js";

// Filter out session_summary — it is system-only, not user-facing.
const USER_MEMORY_TYPES = MEMORY_TYPES.filter(
  (t): t is Exclude<MemoryType, "session_summary"> => t !== "session_summary",
);

// ---------------------------------------------------------------------------
// Per-entry processing
// ---------------------------------------------------------------------------

function appendChronicleEntry(ctx: PluginContext, workflowId: string, entry: string): string {
  const timestamp = new Date().toISOString();
  const formatted = `### ${timestamp}\n\n${entry}`;

  ctx.db.appendChronicleEvent(workflowId, entry);
  ctx.db.appendDocument(workflowId, "chronicle", formatted);
  ctx.db.appendEvent(workflowId, "chronicle_append", {
    timestamp: Date.now(),
    entry_length: entry.length,
  });

  return `appended (${entry.length} chars)`;
}

// ---------------------------------------------------------------------------
// Auxiliary write payloads
// ---------------------------------------------------------------------------

interface AlsoLogAdlPayload {
  type: "decision" | "deviation" | "observation";
  rule?: number;
  description: string;
  entry_action?: string;
  files?: string[];
}

interface AlsoSaveMemoryPayload {
  title: string;
  content: string;
  type?: (typeof USER_MEMORY_TYPES)[number];
  importance?: number;
  concepts?: string[];
}

interface AuxiliaryResult {
  ok: boolean;
  error?: string;
}

interface CombinedResult {
  chronicle: { ok: boolean; detail: string };
  adl?: AuxiliaryResult;
  memory?: AuxiliaryResult;
}

/**
 * Best-effort ADL append. Mirrors `goop_adl` append logic:
 * validate required fields, append to ADL, then dual-write to decisions table.
 */
function appendAuxiliaryAdl(
  ctx: PluginContext,
  workflowId: string,
  payload: AlsoLogAdlPayload,
): AuxiliaryResult {
  if (!payload.type) {
    return { ok: false, error: "Missing ADL 'type'." };
  }
  if (!payload.description) {
    return { ok: false, error: "Missing ADL 'description'." };
  }
  if (!payload.entry_action) {
    return { ok: false, error: "Missing ADL 'entry_action'." };
  }

  try {
    const entry: ADLEntry = {
      timestamp: new Date().toISOString(),
      type: payload.type,
      description: payload.description,
      action: payload.entry_action,
      rule: payload.rule,
      files: payload.files,
    };

    ctx.stateManager.appendADL(entry);

    try {
      ctx.db.insertDecision(workflowId, {
        rule: entry.rule,
        type: entry.type,
        description: entry.description,
        action: entry.action,
        files: entry.files,
      });
    } catch (error) {
      logError("Failed to dual-write ADL entry to decisions table", error);
    }

    return { ok: true };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return { ok: false, error: msg };
  }
}

/** Best-effort memory save. Mirrors `memory_save` save logic. */
async function appendAuxiliaryMemory(
  ctx: PluginContext,
  payload: AlsoSaveMemoryPayload,
): Promise<AuxiliaryResult> {
  if (!payload.title) {
    return { ok: false, error: "Missing memory 'title'." };
  }
  if (!payload.content) {
    return { ok: false, error: "Missing memory 'content'." };
  }
  if (payload.title.length > 100) {
    return { ok: false, error: "Memory title must be 100 characters or less." };
  }

  try {
    const memoryType: MemoryType = payload.type ?? "observation";

    let importance = payload.importance ?? 5;
    if (importance > 0 && importance < 1) {
      importance = Math.round(importance * 10);
    }
    if (importance < 1 || importance > 10) {
      return { ok: false, error: "Memory importance must be between 1 and 10." };
    }

    const input: MemorySaveInput = {
      type: memoryType,
      title: payload.title,
      content: payload.content,
      concepts: payload.concepts,
      importance,
    };

    await ctx.memory.save(input);

    return { ok: true };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return { ok: false, error: msg };
  }
}

function formatCombinedResult(result: CombinedResult): string {
  const lines: string[] = [];

  if (result.chronicle.ok) {
    lines.push(`[OK] Chronicle entry ${result.chronicle.detail}`);
  } else {
    lines.push(`[FAIL] Chronicle: ${result.chronicle.detail}`);
  }

  if (result.adl) {
    lines.push(result.adl.ok ? "[OK] ADL entry logged." : `[FAIL] ADL: ${result.adl.error}`);
  }

  if (result.memory) {
    lines.push(result.memory.ok ? "[OK] Memory saved." : `[FAIL] Memory: ${result.memory.error}`);
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Tool factory
// ---------------------------------------------------------------------------

export function createGoopAppendChronicleTool(ctx: PluginContext): ToolDefinition {
  return tool({
    description:
      "Append a timestamped entry to the chronicle. Optionally log an ADL entry " +
      "and/or save a memory in the same call. Cross-store atomicity is unavailable.",
    args: {
      entry: tool.schema.string().optional().describe("Chronicle entry text"),
      workflow_id: tool.schema.string().optional().describe("Workflow ID (defaults to active)"),
      entries: tool.schema
        .array(tool.schema.string())
        .optional()
        .describe("Batch of chronicle entry strings"),
      alsoLogAdl: tool.schema
        .object({
          type: tool.schema.enum(["decision", "deviation", "observation"] as const),
          rule: tool.schema.number().optional(),
          description: tool.schema.string(),
          entry_action: tool.schema.string(),
          files: tool.schema.array(tool.schema.string()).optional(),
        })
        .optional()
        .describe("ADL entry to log alongside chronicle"),
      alsoSaveMemory: tool.schema
        .object({
          title: tool.schema.string(),
          content: tool.schema.string(),
          type: tool.schema.enum(USER_MEMORY_TYPES).optional(),
          importance: tool.schema.number().optional(),
          concepts: tool.schema.array(tool.schema.string()).optional(),
        })
        .optional()
        .describe("Memory to save alongside chronicle"),
    },
    async execute(
      args: {
        entry?: string;
        workflow_id?: string;
        entries?: string[];
        alsoLogAdl?: AlsoLogAdlPayload;
        alsoSaveMemory?: AlsoSaveMemoryPayload;
      },
      _context: ToolContext,
    ): Promise<string> {
      try {
        const workflowId = args.workflow_id ?? ctx.stateManager.getState().activeWorkflowId;

        // Auxiliary payloads are only meaningful alongside a single chronicle entry.
        if (args.entries !== undefined && (args.alsoLogAdl || args.alsoSaveMemory)) {
          return "Error: alsoLogAdl and alsoSaveMemory cannot be used with entries batch.";
        }

        if (args.entries !== undefined) {
          const result = runBatch(ctx.db, args.entries, (entry) =>
            appendChronicleEntry(ctx, workflowId, entry),
          );
          renderSidecars(ctx, workflowId);
          return formatBatchResult(result, "append-chronicle");
        }

        if (args.entry === undefined) {
          return "Error: 'entry' is required when no entries batch is provided.";
        }

        const chronicleDetail = appendChronicleEntry(ctx, workflowId, args.entry);
        renderSidecars(ctx, workflowId);

        const combined: CombinedResult = {
          chronicle: { ok: true, detail: chronicleDetail },
        };

        if (args.alsoLogAdl) {
          combined.adl = appendAuxiliaryAdl(ctx, workflowId, args.alsoLogAdl);
        }

        if (args.alsoSaveMemory) {
          combined.memory = await appendAuxiliaryMemory(ctx, args.alsoSaveMemory);
        }

        return formatCombinedResult(combined);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        return `Error in goop_append_chronicle: ${msg}`;
      }
    },
  });
}
