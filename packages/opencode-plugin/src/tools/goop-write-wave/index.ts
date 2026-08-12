/**
 * goop_write_wave tool — write wave metadata and task rows.
 *
 * Persists a wave to SQLite, optionally upserts inline tasks, supports single
 * task status updates, and logs a wave_write event.
 *
 * @module tools/goop-write-wave
 */

import { tool } from "../../core/sdk-compat.js";
import type { ToolContext, ToolDefinition } from "../../core/sdk-compat.js";
import type { PluginContext } from "../../core/types.js";
import {
  type BatchItemResult,
  type BatchResult,
  formatBatchResult,
  runBatch,
} from "../../features/db/batch.js";
import { TASK_STATUSES, WAVE_STATUSES, normalizeStatus } from "../../features/db/types.js";
import {
  VERIFICATION_RESULT_STATUSES,
  type VerificationResultStatus,
  isWaveVerified,
  toDbVerificationStatus,
} from "../../features/enforcement/verifier-stage.js";
import { WAVE_COMPLETE_COMPACT_REMINDER, isWaveComplete } from "../../shared/compact-reminder.js";
import { renderSidecars } from "../../shared/render-sidecars.js";
import { isCompleteStatus } from "../../shared/status.js";

interface InlineWaveTask {
  task_index: number;
  description?: string;
  agent?: string;
  status?: string;
}

interface TaskStatusUpdate {
  task_index: number;
  status: string;
}

interface WavePayload {
  wave_number: number;
  title?: string;
  status?: string;
  pr_branch?: string;
  pr_url?: string;
  tasks?: InlineWaveTask[];
  verifications?: VerificationPayload[];
  traceability?: TraceabilityPayload[];
}

interface BulkTaskStatusUpdate {
  task_index: number;
  status: string;
}

const VERIFICATION_CHECK_NAMES = ["typecheck", "test", "lint", "custom"] as const;
type VerificationCheckName = (typeof VERIFICATION_CHECK_NAMES)[number];

interface VerificationPayload {
  check_name: VerificationCheckName;
  status: VerificationResultStatus;
  detail?: string;
  /** Internal row id of the target wave (not the human-facing wave_number). */
  wave_id?: number;
}

interface TraceabilityPayload {
  requirement_key: string;
  wave_number?: number;
  task_index?: number;
  status?: string;
}

// ---------------------------------------------------------------------------
// Shared side-effect writers (mirrors the granular tools, no nested txn)
// ---------------------------------------------------------------------------

function recordVerification(
  ctx: PluginContext,
  workflowId: string,
  item: VerificationPayload,
  defaultWaveId: number,
  defaultWaveNumber: number,
): string {
  const waveId = item.wave_id ?? defaultWaveId;

  // Normalise the tool's pass|fail|skip vocabulary to the DB's canonical
  // passed|failed|skipped vocabulary at this single insertion seam. Payloads
  // are already zod-enum-validated against VERIFICATION_RESULT_STATUSES, so
  // this only fails defensively (e.g. a future enum drift).
  const dbStatus = toDbVerificationStatus(item.status);
  if (dbStatus === undefined) {
    throw new Error(
      `invalid verification status '${item.status}' for wave ${defaultWaveNumber}; expected one of ${VERIFICATION_RESULT_STATUSES.join(", ")}`,
    );
  }

  const verificationId = ctx.db.insertVerification(workflowId, {
    wave_id: waveId,
    check_name: item.check_name,
    status: dbStatus,
    detail: item.detail,
  });

  ctx.db.appendEvent(workflowId, "verification_record", {
    verification_id: verificationId,
    wave_id: waveId ?? null,
    check_name: item.check_name,
    status: dbStatus,
    detail: item.detail ?? null,
    timestamp: Date.now(),
  });

  const waveTarget = `wave ${defaultWaveNumber} (row id ${waveId})`;
  return `Recorded ${item.check_name}=${item.status} verification for ${waveTarget}.`;
}

function writeTraceability(
  ctx: PluginContext,
  workflowId: string,
  item: TraceabilityPayload,
  defaultWaveNumber: number | undefined,
): string {
  const waveNumber = item.wave_number ?? defaultWaveNumber;
  if (waveNumber === undefined) {
    throw new Error(
      `traceability row for requirement_key '${item.requirement_key}' has no wave_number and no top-level wave_number was provided`,
    );
  }

  ctx.db.upsertTraceability(workflowId, {
    requirement_key: item.requirement_key,
    wave_number: waveNumber,
    task_index: item.task_index,
    status: item.status,
  });

  ctx.db.appendEvent(workflowId, "traceability_write", {
    requirement_key: item.requirement_key,
    wave_number: waveNumber,
    task_index: item.task_index ?? null,
    status: item.status ?? "pending",
    timestamp: Date.now(),
  });

  const taskPart = item.task_index !== undefined ? ` (task ${item.task_index})` : "";
  return `Wrote traceability for ${item.requirement_key} on wave ${waveNumber}${taskPart}.`;
}

// ---------------------------------------------------------------------------
// Status validation & normalisation
// ---------------------------------------------------------------------------

/**
 * Validate and normalise every status-bearing argument in-place.
 *
 * Checks all six status paths: top-level `status`, `tasks[].status`,
 * `items[].status`, `items[].tasks[].status`, `task_update.status`,
 * `task_updates[].status`. Returns an error string if any status is invalid,
 * or null if all statuses are valid (and args have been mutated to hold the
 * canonical forms).
 */
function validateAndNormalizeStatuses(args: {
  status?: string;
  tasks?: InlineWaveTask[];
  items?: WavePayload[];
  task_update?: TaskStatusUpdate;
  task_updates?: BulkTaskStatusUpdate[];
}): string | null {
  if (args.status !== undefined) {
    const r = normalizeStatus(args.status, WAVE_STATUSES);
    if (!r.ok) return `Error in goop_write_wave: ${r.error}`;
    args.status = r.status;
  }

  for (const task of args.tasks ?? []) {
    if (task.status !== undefined) {
      const r = normalizeStatus(task.status, TASK_STATUSES);
      if (!r.ok) return `Error in goop_write_wave: ${r.error}`;
      task.status = r.status;
    }
  }

  for (const item of args.items ?? []) {
    if (item.status !== undefined) {
      const r = normalizeStatus(item.status, WAVE_STATUSES);
      if (!r.ok) return `Error in goop_write_wave: ${r.error}`;
      item.status = r.status;
    }
    for (const task of item.tasks ?? []) {
      if (task.status !== undefined) {
        const r = normalizeStatus(task.status, TASK_STATUSES);
        if (!r.ok) return `Error in goop_write_wave: ${r.error}`;
        task.status = r.status;
      }
    }
  }

  if (args.task_update !== undefined && args.task_update.status !== undefined) {
    const r = normalizeStatus(args.task_update.status, TASK_STATUSES);
    if (!r.ok) return `Error in goop_write_wave: ${r.error}`;
    args.task_update.status = r.status;
  }

  for (const update of args.task_updates ?? []) {
    // A status coalesced to absent at the tool-input boundary (an injected
    // empty string on a field the caller never authored) expresses no intent.
    // Skip normalization; the entry is filtered out of processing downstream.
    if (update.status === undefined) continue;
    const r = normalizeStatus(update.status, TASK_STATUSES);
    if (!r.ok) return `Error in goop_write_wave: ${r.error}`;
    update.status = r.status;
  }

  return null;
}

function statusRegressionError(
  subject: string,
  currentStatus: string,
  nextStatus: string | undefined,
  allowStatusRegression: boolean,
): string | null {
  if (!allowStatusRegression && isCompleteStatus(currentStatus) && nextStatus === "pending") {
    return `Error in goop_write_wave: refusing to regress ${subject} from '${currentStatus}' to 'pending'. Set allow_status_regression: true to override deliberately.`;
  }
  return null;
}

function incompatiblePayloadError(mode: string, fields: string[]): string {
  return `Error in goop_write_wave: ${fields.join(", ")} cannot be supplied alongside ${mode}; use one write mode per call so no fields are ignored.`;
}

function validateWaveNumber(value: number | undefined, field: string): string | null {
  if (value !== undefined && (!Number.isSafeInteger(value) || value < 1)) {
    return `Error in goop_write_wave: ${field} must be a positive safe integer; 0, negative, fractional, and non-finite values are invalid.`;
  }
  return null;
}

function rejectEmptyMetadata(value: Pick<WavePayload, "title" | "pr_branch" | "pr_url">): string | null {
  for (const field of ["title", "pr_branch", "pr_url"] as const) {
    if (value[field] === "") {
      return `Error in goop_write_wave: ${field} cannot be an empty string; omit it to preserve the stored value. Intentional metadata clearing is not supported.`;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Wave-completion verification gate
// ---------------------------------------------------------------------------

/** incompatiblePayloadError-style single actionable message; thrown (not
 * returned) so the caller's enclosing transaction rolls back atomically. */
function waveNotVerifiedMessage(waveNumber: number): string {
  return `wave ${waveNumber} cannot be marked complete: no passing or explicit-skip verification is recorded. Dispatch goop-wave-verifier for wave ${waveNumber}, record a pass or skip verification row via this tool's verifications[] argument, then retry this completion.`;
}

/** No-op unless `status` is a complete status. Reads rows *after* this call's
 * own verifications[] are inserted, so same-call evidence counts. Throws to
 * roll back the whole transaction — no partial writes on denial. */
function assertWaveVerifiedForCompletion(
  ctx: PluginContext,
  workflowId: string,
  waveNumber: number,
  waveId: number,
  status: string | undefined,
): void {
  if (!isWaveComplete(status)) return;
  const rows = ctx.db.getVerifications(workflowId, waveId);
  if (!isWaveVerified(rows)) {
    throw new Error(waveNotVerifiedMessage(waveNumber));
  }
}

// ---------------------------------------------------------------------------
// Tool factory
// ---------------------------------------------------------------------------

export function createGoopWriteWaveTool(ctx: PluginContext): ToolDefinition {
  return tool({
    description:
      "Create or update wave metadata, tasks, verification and traceability rows in GoopSpecDB. " +
      "WHEN TO USE: Upsert a wave, advance tasks, record verification, or write traceability. " +
      "WHEN NOT TO USE: Use goop_read_wave to read, goop_acceptance_audit at accept, goop_append_chronicle for prose. " +
      "MODES: One per call; mixing modes is rejected, not ignored. " +
      "Single-wave: title/status/pr_branch/pr_url/tasks (+ task_update, verifications, traceability). " +
      "task_updates[]: task_updates[] + optional verifications/traceability. " +
      "items[]: items[], each item with its own wave_number and per-item verifications/traceability. " +
      "Traceability-only: omit wave_number; only traceability[] with wave_number on every row. " +
      "Omit mode-selecting fields entirely; status:\"\" is invalid. " +
      "RETURNS: Counts, per-row lines, batch summary; goop_compact reminder on completion. " +
      "CAVEATS: wave_number is required except in traceability-only mode, including items[] (each item targets its own). " +
      "done/completed needs a passing or explicit-skip verification row (verifications[] this call or earlier). " +
      "Atomic: failures roll back every row and event. " +
      "Omitted metadata is preserved; supplied values, including empty strings, overwrite.",
    args: {
      wave_number: tool.schema
        .number()
        .optional()
        .describe(
          "Required for every mode except traceability-only — including items[], where it gates the call though each item targets its own wave_number. " +
            "Omit only for traceability-only calls where every row carries its own wave_number.",
        ),
      title: tool.schema
        .string()
        .optional()
        .describe("Omit to preserve it; supplied values, including empty strings, overwrite it."),
      status: tool.schema
        .string()
        .optional()
        .describe(
          "Wave status (pending, in_progress, done, completed). Cannot be supplied alongside task_updates[] or items[]. " +
            "Omit entirely when unchanged; do not pass an empty string — status:\"\" is rejected as invalid. " +
            "Reaching done/completed requires a passing or explicit-skip verification row.",
        ),
      pr_branch: tool.schema
        .string()
        .optional()
        .describe("Omit to preserve it; supplied values, including empty strings, overwrite it."),
      pr_url: tool.schema
        .string()
        .optional()
        .describe("Omit to preserve it; supplied values, including empty strings, overwrite it."),
      tasks: tool.schema
        .array(
          tool.schema.object({
            task_index: tool.schema
              .number()
              .describe("Index identifying the task within its wave; used to upsert the task."),
            description: tool.schema
              .string()
              .optional()
              .describe("Omit to preserve existing description."),
            agent: tool.schema.string().optional().describe("Omit to preserve the existing agent."),
            status: tool.schema
              .string()
              .optional()
              .describe("Task status (pending, in_progress, done, completed); omit to leave unchanged."),
          }),
        )
        .optional()
        .describe(
          "Inline task definitions for the single-wave mode; each entry upserts a task by task_index. " +
            "Cannot be supplied alongside task_updates[] or items[].",
        ),
      task_update: tool.schema
        .object({
          task_index: tool.schema.number().describe("Index of the existing task to update."),
          status: tool.schema
            .string()
            .describe("New task status (pending, in_progress, done, completed)."),
        })
        .optional()
        .describe(
          "Update one existing task's status alone (single-wave mode only); cannot be supplied alongside task_updates[] or items[].",
        ),
      allow_status_regression: tool.schema
        .boolean()
        .optional()
        .describe(
          "Set true to deliberately regress a completed wave or task back to pending; defaults to false, which rejects the regression.",
        ),
      workflow_id: tool.schema.string().optional().describe("Target workflow id; omit to use the active workflow."),
      items: tool.schema
        .array(
          tool.schema.object({
            wave_number: tool.schema
              .number()
              .describe("Wave number this item targets; required on every item."),
            title: tool.schema
              .string()
              .optional()
              .describe("Omit to preserve it; supplied values, including empty strings, overwrite it."),
            status: tool.schema
              .string()
              .optional()
              .describe(
                "Wave status (pending, in_progress, done, completed); done/completed needs a passing or explicit-skip verification row.",
              ),
            pr_branch: tool.schema
              .string()
              .optional()
              .describe("Omit to preserve it; supplied values, including empty strings, overwrite it."),
            pr_url: tool.schema
              .string()
              .optional()
              .describe("Omit to preserve it; supplied values, including empty strings, overwrite it."),
            tasks: tool.schema
              .array(
                tool.schema.object({
                  task_index: tool.schema
                    .number()
                    .describe("Index identifying the task to upsert within this item's wave."),
                  description: tool.schema
                    .string()
                    .optional()
                    .describe("Omit to preserve existing description."),
                  agent: tool.schema
                    .string()
                    .optional()
                    .describe("Omit to preserve existing agent."),
                  status: tool.schema
                    .string()
                    .optional()
                    .describe("Task status (pending, in_progress, done, completed); omit to leave unchanged."),
                }),
              )
              .optional()
              .describe("Inline task upserts for this item's wave."),
            verifications: tool.schema
              .array(
                tool.schema.object({
                  check_name: tool.schema
                    .enum(VERIFICATION_CHECK_NAMES)
                    .describe("Verification check (typecheck, test, lint, custom)."),
                  status: tool.schema
                    .enum(VERIFICATION_RESULT_STATUSES)
                    .describe("Verification result (pass, fail, skip)."),
                  detail: tool.schema
                    .string()
                    .optional()
                    .describe("Optional free-text note attached to the row."),
                  wave_id: tool.schema
                    .number()
                    .optional()
                    .describe(
                      "Internal wave row id (not wave_number); omit to inherit the enclosing item's resolved wave row, supply to override.",
                    ),
                }),
              )
              .optional()
              .describe(
                "Verification rows for this item's wave, written inside the batch transaction; supply per-item, not at the top level, when using items[].",
              ),
            traceability: tool.schema
              .array(
                tool.schema.object({
                  requirement_key: tool.schema
                    .string()
                    .describe("Requirement identifier to link the wave/task to."),
                  wave_number: tool.schema
                    .number()
                    .optional()
                    .describe("Omit to inherit the enclosing item's wave_number; supply to override."),
                  task_index: tool.schema
                    .number()
                    .optional()
                    .describe("Optional task index to bind the requirement to a specific task."),
                  status: tool.schema
                    .string()
                    .optional()
                    .describe("Optional free-form coverage status (defaults to pending)."),
                }),
              )
              .optional()
              .describe(
                "Traceability rows for this item's wave, written inside the batch transaction; supply per-item, not at the top level, when using items[].",
              ),
          }),
        )
        .optional()
        .describe(
          "Batch of wave writes; each item carries its own wave_number, optional metadata, and per-item verifications/traceability. " +
            "Cannot be supplied alongside any other top-level field except wave_number.",
        ),
      task_updates: tool.schema
        .array(
          tool.schema.object({
            task_index: tool.schema.number().describe("Index of the existing task to update."),
            status: tool.schema
              .string()
              .describe("New task status (pending, in_progress, done, completed)."),
          }),
        )
        .optional()
        .describe(
          "Bulk task status updates for one wave; cannot be supplied alongside wave metadata (title/status/pr_branch/pr_url/tasks) or task_update. " +
            "May carry top-level verifications/traceability.",
        ),
      verifications: tool.schema
        .array(
          tool.schema.object({
            check_name: tool.schema
              .enum(VERIFICATION_CHECK_NAMES)
              .describe("Verification check (typecheck, test, lint, custom)."),
            status: tool.schema
              .enum(VERIFICATION_RESULT_STATUSES)
              .describe("Verification result (pass, fail, skip)."),
            detail: tool.schema
              .string()
              .optional()
              .describe("Optional free-text note attached to the row."),
            wave_id: tool.schema
              .number()
              .optional()
              .describe(
                "Internal wave row id (not wave_number); omit to target the resolved wave, supply to override.",
              ),
          }),
        )
        .optional()
        .describe(
          "Top-level verification rows for the resolved wave (single-wave and task_updates modes only); cannot be supplied alongside items[] — supply per-item inside items[] instead.",
        ),
      traceability: tool.schema
        .array(
          tool.schema.object({
            requirement_key: tool.schema
              .string()
              .describe("Requirement identifier to link the wave/task to."),
            wave_number: tool.schema
              .number()
              .optional()
              .describe(
                "Omit to inherit the call's wave_number; required on every row when top-level wave_number is omitted (traceability-only mode).",
              ),
            task_index: tool.schema
              .number()
              .optional()
              .describe("Optional task index to bind the requirement to a specific task."),
            status: tool.schema
              .string()
              .optional()
              .describe("Optional free-form coverage status (defaults to pending)."),
          }),
        )
        .optional()
        .describe(
          "Top-level traceability rows for the resolved wave (single-wave and task_updates modes only); cannot be supplied alongside items[] — supply per-item inside items[] instead.",
        ),
    },
    async execute(
      args: {
        wave_number?: number;
        title?: string;
        status?: string;
        pr_branch?: string;
        pr_url?: string;
        tasks?: InlineWaveTask[];
        task_update?: TaskStatusUpdate;
        allow_status_regression?: boolean;
        workflow_id?: string;
        items?: WavePayload[];
        task_updates?: BulkTaskStatusUpdate[];
        verifications?: VerificationPayload[];
        traceability?: TraceabilityPayload[];
      },
      _context: ToolContext,
    ): Promise<string> {
      let verificationResults: string[] = [];
      let traceabilityResults: string[] = [];

      try {
        const workflowId = args.workflow_id ?? ctx.stateManager.getState().activeWorkflowId;

        const waveNumberError = validateWaveNumber(args.wave_number, "wave_number");
        if (waveNumberError !== null) return waveNumberError;
        const metadataError = rejectEmptyMetadata(args);
        if (metadataError !== null) return metadataError;
        for (const [index, item] of (args.items ?? []).entries()) {
          const itemWaveNumberError = validateWaveNumber(item.wave_number, `items[${index}].wave_number`);
          if (itemWaveNumberError !== null) return itemWaveNumberError;
          const itemMetadataError = rejectEmptyMetadata(item);
          if (itemMetadataError !== null) return itemMetadataError;
        }
        for (const [index, item] of (args.traceability ?? []).entries()) {
          const traceabilityWaveNumberError = validateWaveNumber(item.wave_number, `traceability[${index}].wave_number`);
          if (traceabilityWaveNumberError !== null) return traceabilityWaveNumberError;
        }

        const statusError = validateAndNormalizeStatuses(args);
        if (statusError !== null) {
          return statusError;
        }

        if (args.wave_number === undefined) {
          // wave_number is only optional for traceability-only calls where every
          // row self-describes its target. Any other payload requires it.
          const hasNonTraceabilityPayload =
            args.title !== undefined ||
            args.status !== undefined ||
            args.pr_branch !== undefined ||
            args.pr_url !== undefined ||
            args.tasks !== undefined ||
            args.task_update !== undefined ||
            args.task_updates !== undefined ||
            args.items !== undefined ||
            args.verifications !== undefined;

          if (hasNonTraceabilityPayload) {
            return "Error in goop_write_wave: wave_number is required for wave writes, task writes, verifications, and items[] — supply a top-level wave_number even when every items[] entry carries its own; only traceability-only calls may omit it.";
          }

          if (args.traceability === undefined || args.traceability.length === 0) {
            return "Error in goop_write_wave: wave_number is required when no traceability rows are provided.";
          }

          for (const [index, row] of args.traceability.entries()) {
            if (row.wave_number === undefined) {
              return `Error in goop_write_wave: traceability row ${index} (requirement_key '${row.requirement_key}') has no wave_number and no top-level wave_number was provided; supply wave_number on the row or at the top level.`;
            }
          }

          // All rows self-describe — write them without a top-level wave_number.
          ctx.db.runTransaction(() => {
            for (const item of args.traceability ?? []) {
              traceabilityResults.push(writeTraceability(ctx, workflowId, item, undefined));
            }
          });
          renderSidecars(ctx, workflowId);

          const sections: string[] = [];
          if (traceabilityResults.length > 0) {
            sections.push(
              `Traceability:\n${traceabilityResults.map((line) => `- ${line}`).join("\n")}`,
            );
          }
          return sections.join("\n\n");
        }

        const waveNumber = args.wave_number;

        if (Array.isArray(args.items) && args.items.length > 0) {
          const ignoredFields = [
            args.title !== undefined ? "title" : null,
            args.status !== undefined ? "status" : null,
            args.pr_branch !== undefined ? "pr_branch" : null,
            args.pr_url !== undefined ? "pr_url" : null,
            args.tasks !== undefined ? "tasks" : null,
            args.task_update !== undefined ? "task_update" : null,
            args.task_updates !== undefined ? "task_updates" : null,
            args.verifications !== undefined ? "verifications" : null,
            args.traceability !== undefined ? "traceability" : null,
          ].filter((field): field is string => field !== null);
          if (ignoredFields.length > 0) {
            return incompatiblePayloadError("items[] batch mode", ignoredFields);
          }
          const result = runBatch(ctx.db, args.items, (item) => {
            const existingWave = ctx.db.getWave(workflowId, item.wave_number);
            const waveRegression = statusRegressionError(
              `wave ${item.wave_number}`,
              existingWave?.status ?? "pending",
              item.status,
              args.allow_status_regression ?? false,
            );
            if (waveRegression !== null) throw new Error(waveRegression);
            ctx.db.upsertWave(workflowId, {
              wave_number: item.wave_number,
              title: item.title,
              status: item.status,
              pr_branch: item.pr_branch,
              pr_url: item.pr_url,
            });

            const wave = ctx.db.getWave(workflowId, item.wave_number);
            if (wave === null) {
              throw new Error(`wave ${item.wave_number} not found after upsert`);
            }

            const itemVerificationResults = (item.verifications ?? []).map((verification) =>
              recordVerification(ctx, workflowId, verification, wave.id, item.wave_number),
            );
            const itemTraceabilityResults = (item.traceability ?? []).map((traceability) =>
              writeTraceability(ctx, workflowId, traceability, item.wave_number),
            );

            assertWaveVerifiedForCompletion(
              ctx,
              workflowId,
              item.wave_number,
              wave.id,
              item.status,
            );

            for (const task of item.tasks ?? []) {
              const existingTask = ctx.db
                .getWaveTasks(wave.id)
                .find((candidate) => candidate.task_index === task.task_index);
              const taskRegression = statusRegressionError(
                `task ${task.task_index} on wave ${item.wave_number}`,
                existingTask?.status ?? "pending",
                task.status,
                args.allow_status_regression ?? false,
              );
              if (taskRegression !== null) throw new Error(taskRegression);
              ctx.db.upsertWaveTask({
                wave_id: wave.id,
                workflow_id: workflowId,
                task_index: task.task_index,
                description: task.description,
                agent: task.agent,
                status: task.status,
              });
            }

            ctx.db.appendEvent(workflowId, "wave_write", {
              wave_number: item.wave_number,
              task_count: item.tasks?.length ?? 0,
              mode: "wave_upsert",
              timestamp: Date.now(),
            });

            const sidePayloadCounts: string[] = [];
            if (itemVerificationResults.length > 0) {
              sidePayloadCounts.push(`${itemVerificationResults.length} verification(s)`);
            }
            if (itemTraceabilityResults.length > 0) {
              sidePayloadCounts.push(`${itemTraceabilityResults.length} traceability row(s)`);
            }
            const suffix =
              sidePayloadCounts.length > 0 ? `; wrote ${sidePayloadCounts.join(" and ")}` : "";
            return `wrote wave ${item.wave_number}${suffix}`;
          });
          renderSidecars(ctx, workflowId);
          const response = formatBatchResult(result, "write-wave");
          const anyComplete = args.items.some((item) => isWaveComplete(item.status));
          return anyComplete ? `${response}${WAVE_COMPLETE_COMPACT_REMINDER}` : response;
        }

        if (args.task_updates?.some((update) => update.status !== undefined) === true) {
          const ignoredFields = [
            args.title !== undefined ? "title" : null,
            args.status !== undefined ? "status" : null,
            args.pr_branch !== undefined ? "pr_branch" : null,
            args.pr_url !== undefined ? "pr_url" : null,
            args.tasks !== undefined ? "tasks" : null,
            args.task_update !== undefined ? "task_update" : null,
          ].filter((field): field is string => field !== null);
          if (ignoredFields.length > 0) {
            return incompatiblePayloadError("task_updates batch mode", ignoredFields);
          }

          const wave = ctx.db.getWave(workflowId, waveNumber);
          if (wave === null) {
            return `No wave ${waveNumber} found for workflow '${workflowId}'. Use goop_write_wave to create it.`;
          }

          const defaultWaveId = wave.id;
          // Drop task_updates entries whose status was coalesced to absent at
          // the tool-input boundary (an injected empty string the caller never
          // authored). Such an entry expresses no status change and must not be
          // applied — applying it would store an undefined status. If every
          // entry is dropped, the loop below is a no-op and any verifications
          // are still recorded, which is the caller's actual intent.
          const taskUpdates = args.task_updates.filter(
            (update): update is BulkTaskStatusUpdate => update.status !== undefined,
          );
          const successes: BatchItemResult[] = [];
          let verificationResults: string[] = [];
          let traceabilityResults: string[] = [];
          let failureIndex: number | null = null;
          let failureDetail = "";

          try {
            ctx.db.runTransaction(() => {
              for (const [index, update] of taskUpdates.entries()) {
                try {
                  const task = ctx.db
                    .getWaveTasks(wave.id)
                    .find((candidate) => candidate.task_index === update.task_index);
                  if (task === undefined) {
                    throw new Error(`task ${update.task_index} not found on wave ${waveNumber}`);
                  }
                  const taskRegression = statusRegressionError(
                    `task ${update.task_index} on wave ${waveNumber}`,
                    task.status,
                    update.status,
                    args.allow_status_regression ?? false,
                  );
                  if (taskRegression !== null) throw new Error(taskRegression);
                  ctx.db.setWaveTaskStatus(wave.id, update.task_index, update.status);
                  ctx.db.appendEvent(workflowId, "wave_write", {
                    wave_number: waveNumber,
                    task_index: update.task_index,
                    status: update.status,
                    mode: "task_update",
                    timestamp: Date.now(),
                  });
                  successes.push({
                    index,
                    ok: true,
                    detail: `updated task ${update.task_index} to ${update.status}`,
                  });
                } catch (error: unknown) {
                  failureIndex = index;
                  failureDetail = error instanceof Error ? error.message : String(error);
                  throw error;
                }
              }

              for (const item of args.verifications ?? []) {
                verificationResults.push(
                  recordVerification(ctx, workflowId, item, defaultWaveId, waveNumber),
                );
              }

              for (const item of args.traceability ?? []) {
                traceabilityResults.push(writeTraceability(ctx, workflowId, item, waveNumber));
              }
            });
          } catch (error: unknown) {
            if (!failureDetail) {
              failureDetail = error instanceof Error ? error.message : String(error);
            }
            verificationResults = [];
            traceabilityResults = [];

            const resultItems: BatchItemResult[] = taskUpdates.map((_, index) => {
              if (index === failureIndex) {
                return { index, ok: false, detail: failureDetail };
              }
              if (index < successes.length) {
                return { index, ok: false, detail: "rolled back due to batch failure" };
              }
              return { index, ok: false, detail: "not processed due to batch failure" };
            });

            const failResult: BatchResult = {
              total: taskUpdates.length,
              succeeded: 0,
              failed: taskUpdates.length,
              items: resultItems,
            };
            renderSidecars(ctx, workflowId);
            return formatBatchResult(failResult, "write-wave-task-updates");
          }

          const okResult: BatchResult = {
            total: taskUpdates.length,
            succeeded: successes.length,
            failed: 0,
            items: successes,
          };
          renderSidecars(ctx, workflowId);

          let response = formatBatchResult(okResult, "write-wave-task-updates");
          if (verificationResults.length > 0) {
            response += `\n\nVerifications:\n${verificationResults.map((line) => `- ${line}`).join("\n")}`;
          }
          if (traceabilityResults.length > 0) {
            response += `\n\nTraceability:\n${traceabilityResults.map((line) => `- ${line}`).join("\n")}`;
          }
          return response;
        }

        let mainResult = "";
        let defaultWaveId = -1;

        const hasTaskUpdate = args.task_update?.status !== undefined;
        const hasSidePayload = (args.verifications?.length ?? 0) > 0 || (args.traceability?.length ?? 0) > 0;

        const hasWaveWrite =
          args.title !== undefined ||
          args.status !== undefined ||
          args.pr_branch !== undefined ||
          args.pr_url !== undefined ||
          (args.tasks?.length ?? 0) > 0;

        if (!hasWaveWrite && !hasTaskUpdate && !hasSidePayload) {
          return "Error in goop_write_wave: no write intent was provided. Supply wave metadata/tasks, a task update, verifications, traceability, or a non-empty items[]/task_updates[] batch.";
        }

        ctx.db.runTransaction(() => {
          let wave = ctx.db.getWave(workflowId, waveNumber);
          if (hasWaveWrite) {
            const waveRegression = statusRegressionError(
              `wave ${waveNumber}`,
              wave?.status ?? "pending",
              args.status,
              args.allow_status_regression ?? false,
            );
            if (waveRegression !== null) throw new Error(waveRegression);

            ctx.db.upsertWave(workflowId, {
              wave_number: waveNumber,
              title: args.title,
              status: args.status,
              pr_branch: args.pr_branch,
              pr_url: args.pr_url,
            });
            wave = ctx.db.getWave(workflowId, waveNumber);
          }

          if (wave === null) {
            throw new Error(
              `No wave ${waveNumber} found for workflow '${workflowId}'. Use goop_write_wave to create it.`,
            );
          }
          defaultWaveId = wave.id;

          for (const task of args.tasks ?? []) {
            const existingTask = ctx.db
              .getWaveTasks(wave.id)
              .find((candidate) => candidate.task_index === task.task_index);
            const taskRegression = statusRegressionError(
              `task ${task.task_index} on wave ${waveNumber}`,
              existingTask?.status ?? "pending",
              task.status,
              args.allow_status_regression ?? false,
            );
            if (taskRegression !== null) throw new Error(taskRegression);
            ctx.db.upsertWaveTask({
              wave_id: wave.id,
              workflow_id: workflowId,
              task_index: task.task_index,
              description: task.description,
              agent: task.agent,
              status: task.status,
            });
          }

          // A task_update whose status was coalesced to absent (injected empty
          // string) expresses no status change; skip the lookup and write so we
          // never store an undefined status.
          if (hasTaskUpdate && args.task_update !== undefined) {
            const task = ctx.db
              .getWaveTasks(wave.id)
              .find((candidate) => candidate.task_index === args.task_update?.task_index);
            if (task === undefined) {
              throw new Error(
                `task ${args.task_update.task_index} not found on wave ${waveNumber}`,
              );
            }
            const taskRegression = statusRegressionError(
              `task ${args.task_update.task_index} on wave ${waveNumber}`,
              task.status,
              args.task_update.status,
              args.allow_status_regression ?? false,
            );
            if (taskRegression !== null) throw new Error(taskRegression);
            ctx.db.setWaveTaskStatus(wave.id, args.task_update.task_index, args.task_update.status);
          }

          if (hasWaveWrite || hasTaskUpdate) {
            ctx.db.appendEvent(workflowId, "wave_write", {
              wave_number: waveNumber,
              task_count: args.tasks?.length ?? 0,
              task_index: hasTaskUpdate ? args.task_update?.task_index ?? null : null,
              status: hasTaskUpdate ? args.task_update?.status ?? args.status ?? null : args.status ?? null,
              mode: hasTaskUpdate ? "wave_and_task_update" : "wave_upsert",
              timestamp: Date.now(),
            });
          }

          for (const item of args.verifications ?? []) {
            verificationResults.push(
              recordVerification(ctx, workflowId, item, defaultWaveId, waveNumber),
            );
          }

          for (const item of args.traceability ?? []) {
            traceabilityResults.push(writeTraceability(ctx, workflowId, item, waveNumber));
          }

          if (hasWaveWrite) {
            assertWaveVerifiedForCompletion(ctx, workflowId, waveNumber, wave.id, args.status);
          }
        });
        renderSidecars(ctx, workflowId);

        if (hasWaveWrite) {
          if (args.tasks !== undefined && args.tasks.length > 0) {
            mainResult = `Written wave ${waveNumber} for workflow '${workflowId}' with ${args.tasks.length} task(s).`;
          } else {
            mainResult = `Written wave ${waveNumber} for workflow '${workflowId}'; existing tasks left unchanged.`;
          }
        }
        if (hasTaskUpdate && args.task_update !== undefined) {
          const taskResult = `Updated task ${args.task_update.task_index} on wave ${waveNumber} to '${args.task_update.status}' for workflow '${workflowId}'.`;
          mainResult = mainResult.length > 0 ? `${mainResult}\n${taskResult}` : taskResult;
        }

        const waveComplete = !hasTaskUpdate && isWaveComplete(args.status);

        const sections: string[] = [];
        if (mainResult.length > 0) {
          sections.push(mainResult);
        }
        if (verificationResults.length > 0) {
          sections.push(
            `Verifications:\n${verificationResults.map((line) => `- ${line}`).join("\n")}`,
          );
        }
        if (traceabilityResults.length > 0) {
          sections.push(
            `Traceability:\n${traceabilityResults.map((line) => `- ${line}`).join("\n")}`,
          );
        }
        const response = sections.join("\n\n");

        return waveComplete ? `${response}${WAVE_COMPLETE_COMPACT_REMINDER}` : response;
      } catch (error: unknown) {
        verificationResults = [];
        traceabilityResults = [];
        const msg = error instanceof Error ? error.message : String(error);
        return `Error in goop_write_wave: ${msg}`;
      }
    },
  });
}
