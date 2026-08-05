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
 * An aux payload that carries no meaningful content — an empty object or one
 * whose every field is absent/null/empty — is treated as omitted, matching
 * normal optional-field semantics. A payload with some but not all required
 * fields is genuinely malformed and is rejected as a partial failure (the
 * chronicle write still reads as successful); it is never treated as absent.
 */
function isAuxAdlEffectivelyAbsent(payload: AlsoLogAdlPayload): boolean {
  return (
    !payload.type &&
    !payload.description &&
    !payload.entry_action &&
    payload.rule == null &&
    (!payload.files || payload.files.length === 0)
  );
}

function isAuxMemoryEffectivelyAbsent(payload: AlsoSaveMemoryPayload): boolean {
  return (
    !payload.title &&
    !payload.content &&
    !payload.type &&
    payload.importance == null &&
    (!payload.concepts || payload.concepts.length === 0)
  );
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

    if (payload.importance !== undefined && payload.importance !== null) {
      if (
        !Number.isFinite(payload.importance) ||
        payload.importance < 1 ||
        payload.importance > 10
      ) {
        return { ok: false, error: "Memory importance must be between 1 and 10." };
      }
    }
    let importance = payload.importance ?? 5;
    if (importance > 0 && importance < 1) {
      importance = Math.round(importance * 10);
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
      "Append a timestamped chronicle entry; optionally log an ADL entry and/or save a memory in the same call. WHEN TO USE: Record progress, piggybacking a decision or memory when both describe one event. WHEN NOT TO USE: goop_write_db({doc_type:\"chronicle\"}) for full-document control; goop_adl or memory_save standalone. MODES: entry (single) or entries[] (batch); alsoLogAdl/alsoSaveMemory apply once, after the batch commits and only on full success. RETURNS: Per-store [OK]/[FAIL] lines for chronicle, ADL, memory. CAVEATS: Cross-store atomicity is unavailable — three separate stores written sequentially. If chronicle fails, aux writes are skipped (no orphans); if an aux write fails after chronicle success, the chronicle stays and the failure is reported — retry that store separately.",
    args: {
      entry: tool.schema.string().optional().describe("Chronicle entry text (single mode)."),
      workflow_id: tool.schema
        .string()
        .optional()
        .describe("Workflow ID; omit to use the active workflow."),
      entries: tool.schema
        .array(tool.schema.string())
        .optional()
        .describe("Batch of chronicle entry strings; preferred over repeated entry calls."),
      alsoLogAdl: tool.schema
        .object({
          type: tool.schema
            .enum(["decision", "deviation", "observation"] as const)
            .describe("ADL entry category."),
          rule: tool.schema
            .number()
            .optional()
            .describe("Optional deviation-rule number this entry relates to."),
          description: tool.schema.string().describe("What was decided or observed."),
          entry_action: tool.schema.string().describe("Short label for the action taken."),
          files: tool.schema
            .array(tool.schema.string())
            .optional()
            .describe("Optional list of affected file paths."),
        })
        .optional()
        .describe(
          "ADL entry to log alongside the chronicle; applied once after a successful write, with no cross-store atomicity.",
        ),
      alsoSaveMemory: tool.schema
        .object({
          title: tool.schema
            .string()
            .describe("Memory title (100 characters or fewer)."),
          content: tool.schema.string().describe("Memory body content."),
          type: tool.schema
            .enum(USER_MEMORY_TYPES)
            .optional()
            .describe("Memory type; defaults to observation if omitted."),
          importance: tool.schema
            .number()
            .optional()
            .describe("Importance 1-10; defaults to 5 if omitted."),
          concepts: tool.schema
            .array(tool.schema.string())
            .optional()
            .describe("Tags for categorization and search."),
        })
        .optional()
        .describe(
          "Memory to save alongside the chronicle; applied once after a successful write, with no cross-store atomicity.",
        ),
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

        if (Array.isArray(args.entries) && args.entries.length > 0) {
          const result = runBatch(ctx.db, args.entries, (entry) =>
            appendChronicleEntry(ctx, workflowId, entry),
          );
          renderSidecars(ctx, workflowId);

          const lines = [formatBatchResult(result, "append-chronicle")];

          // Apply aux payloads exactly once for the whole batch — and only
          // after the batch committed — so a rolled-back batch leaves no
          // orphaned ADL entry or memory row. Per-entry application would
          // multiply ADL noise and memory rows, which is the wrong fix.
          if (result.failed === 0 && (args.alsoLogAdl || args.alsoSaveMemory)) {
            if (args.alsoLogAdl && !isAuxAdlEffectivelyAbsent(args.alsoLogAdl)) {
              const adl = appendAuxiliaryAdl(ctx, workflowId, args.alsoLogAdl);
              lines.push(adl.ok ? "[OK] ADL entry logged." : `[FAIL] ADL: ${adl.error}`);
            }
            if (args.alsoSaveMemory && !isAuxMemoryEffectivelyAbsent(args.alsoSaveMemory)) {
              const memory = await appendAuxiliaryMemory(ctx, args.alsoSaveMemory);
              lines.push(memory.ok ? "[OK] Memory saved." : `[FAIL] Memory: ${memory.error}`);
            }
          }

          return lines.join("\n");
        }

        if (args.entry === undefined) {
          return "Error in goop_append_chronicle: entries[] array is empty and no entry was provided";
        }

        const chronicleDetail = appendChronicleEntry(ctx, workflowId, args.entry);
        renderSidecars(ctx, workflowId);

        const combined: CombinedResult = {
          chronicle: { ok: true, detail: chronicleDetail },
        };

        if (args.alsoLogAdl && !isAuxAdlEffectivelyAbsent(args.alsoLogAdl)) {
          combined.adl = appendAuxiliaryAdl(ctx, workflowId, args.alsoLogAdl);
        }

        if (args.alsoSaveMemory && !isAuxMemoryEffectivelyAbsent(args.alsoSaveMemory)) {
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
