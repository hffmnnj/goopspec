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
import { formatBatchResult, runBatch } from "../../features/db/batch.js";
import { WAVE_COMPLETE_COMPACT_REMINDER, isWaveComplete } from "../../shared/compact-reminder.js";
import { renderSidecars } from "../../shared/render-sidecars.js";

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
}

interface BulkTaskStatusUpdate {
  task_index: number;
  status: string;
}

const VERIFICATION_CHECK_NAMES = ["typecheck", "test", "lint", "custom"] as const;
type VerificationCheckName = (typeof VERIFICATION_CHECK_NAMES)[number];

const VERIFICATION_STATUSES = ["pass", "fail", "skip"] as const;
type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

interface VerificationPayload {
  check_name: VerificationCheckName;
  status: VerificationStatus;
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
): string {
  const waveId = item.wave_id ?? defaultWaveId;

  const verificationId = ctx.db.insertVerification(workflowId, {
    wave_id: waveId,
    check_name: item.check_name,
    status: item.status,
    detail: item.detail,
  });

  ctx.db.appendEvent(workflowId, "verification_record", {
    verification_id: verificationId,
    wave_id: waveId ?? null,
    check_name: item.check_name,
    status: item.status,
    detail: item.detail ?? null,
    timestamp: Date.now(),
  });

  return `Recorded ${item.check_name}=${item.status} verification for wave ${waveId}.`;
}

function writeTraceability(
  ctx: PluginContext,
  workflowId: string,
  item: TraceabilityPayload,
  defaultWaveNumber: number,
): string {
  const waveNumber = item.wave_number ?? defaultWaveNumber;

  ctx.db.upsertTraceability(workflowId, {
    requirement_key: item.requirement_key,
    wave_number: waveNumber,
    task_index: item.task_index,
    status: item.status,
  });

  ctx.db.appendEvent(workflowId, "traceability_write", {
    requirement_key: item.requirement_key,
    wave_number: waveNumber ?? null,
    task_index: item.task_index ?? null,
    status: item.status ?? "pending",
    timestamp: Date.now(),
  });

  return `Wrote traceability for ${item.requirement_key}.`;
}

// ---------------------------------------------------------------------------
// Tool factory
// ---------------------------------------------------------------------------

export function createGoopWriteWaveTool(ctx: PluginContext): ToolDefinition {
  return tool({
    description:
      "Write or update wave metadata and optional inline wave tasks in GoopSpecDB. " +
      "Optionally record verifications and traceability rows in the same call.",
    args: {
      wave_number: tool.schema.number(),
      title: tool.schema.string().optional(),
      status: tool.schema.string().optional(),
      pr_branch: tool.schema.string().optional(),
      pr_url: tool.schema.string().optional(),
      tasks: tool.schema
        .array(
          tool.schema.object({
            task_index: tool.schema.number(),
            description: tool.schema.string().optional(),
            agent: tool.schema.string().optional(),
            status: tool.schema.string().optional(),
          }),
        )
        .optional(),
      task_update: tool.schema
        .object({
          task_index: tool.schema.number(),
          status: tool.schema.string(),
        })
        .optional(),
      workflow_id: tool.schema.string().optional(),
      items: tool.schema
        .array(
          tool.schema.object({
            wave_number: tool.schema.number(),
            title: tool.schema.string().optional(),
            status: tool.schema.string().optional(),
            pr_branch: tool.schema.string().optional(),
            pr_url: tool.schema.string().optional(),
            tasks: tool.schema
              .array(
                tool.schema.object({
                  task_index: tool.schema.number(),
                  description: tool.schema.string().optional(),
                  agent: tool.schema.string().optional(),
                  status: tool.schema.string().optional(),
                }),
              )
              .optional(),
          }),
        )
        .optional(),
      task_updates: tool.schema
        .array(
          tool.schema.object({
            task_index: tool.schema.number(),
            status: tool.schema.string(),
          }),
        )
        .optional(),
      verifications: tool.schema
        .array(
          tool.schema.object({
            check_name: tool.schema.enum(VERIFICATION_CHECK_NAMES),
            status: tool.schema.enum(VERIFICATION_STATUSES),
            detail: tool.schema.string().optional(),
            wave_id: tool.schema
              .number()
              .optional()
              .describe("Internal wave row id (not wave_number)"),
          }),
        )
        .optional(),
      traceability: tool.schema
        .array(
          tool.schema.object({
            requirement_key: tool.schema.string(),
            wave_number: tool.schema.number().optional(),
            task_index: tool.schema.number().optional(),
            status: tool.schema.string().optional(),
          }),
        )
        .optional(),
    },
    async execute(
      args: {
        wave_number: number;
        title?: string;
        status?: string;
        pr_branch?: string;
        pr_url?: string;
        tasks?: InlineWaveTask[];
        task_update?: TaskStatusUpdate;
        workflow_id?: string;
        items?: WavePayload[];
        task_updates?: BulkTaskStatusUpdate[];
        verifications?: VerificationPayload[];
        traceability?: TraceabilityPayload[];
      },
      _context: ToolContext,
    ): Promise<string> {
      try {
        const workflowId = args.workflow_id ?? ctx.stateManager.getState().activeWorkflowId;

        if (args.items !== undefined) {
          if (args.verifications !== undefined || args.traceability !== undefined) {
            return (
              "Error in goop_write_wave: verifications and traceability side-payloads are " +
              "not supported in items[] batch mode; use the single-wave path or call the " +
              "granular tools directly."
            );
          }

          const result = runBatch(ctx.db, args.items, (item) => {
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

            for (const task of item.tasks ?? []) {
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

            return `wrote wave ${item.wave_number}`;
          });
          renderSidecars(ctx, workflowId);
          const response = formatBatchResult(result, "write-wave");
          const anyComplete = args.items.some((item) => isWaveComplete(item.status));
          return anyComplete ? `${response}${WAVE_COMPLETE_COMPACT_REMINDER}` : response;
        }

        if (args.task_updates !== undefined) {
          if (args.verifications !== undefined || args.traceability !== undefined) {
            return (
              "Error in goop_write_wave: verifications and traceability side-payloads are " +
              "not supported alongside task_updates; use the single-wave path or call the " +
              "granular tools directly."
            );
          }

          const wave = ctx.db.getWave(workflowId, args.wave_number);
          if (wave === null) {
            return `No wave ${args.wave_number} found for workflow '${workflowId}'. Use goop_write_wave to create it.`;
          }

          const result = runBatch(ctx.db, args.task_updates, (update) => {
            ctx.db.setWaveTaskStatus(wave.id, update.task_index, update.status);
            ctx.db.appendEvent(workflowId, "wave_write", {
              wave_number: args.wave_number,
              task_index: update.task_index,
              status: update.status,
              mode: "task_update",
              timestamp: Date.now(),
            });

            return `updated task ${update.task_index} to ${update.status}`;
          });
          renderSidecars(ctx, workflowId);
          return formatBatchResult(result, "write-wave-task-updates");
        }

        let mainResult = "";
        let defaultWaveId = -1;

        if (args.task_update !== undefined) {
          const wave = ctx.db.getWave(workflowId, args.wave_number);
          if (wave === null) {
            return `No wave ${args.wave_number} found for workflow '${workflowId}'. Use goop_write_wave to create it.`;
          }

          defaultWaveId = wave.id;

          ctx.db.setWaveTaskStatus(wave.id, args.task_update.task_index, args.task_update.status);
          ctx.db.appendEvent(workflowId, "wave_write", {
            wave_number: args.wave_number,
            task_index: args.task_update.task_index,
            status: args.task_update.status,
            mode: "task_update",
            timestamp: Date.now(),
          });
          renderSidecars(ctx, workflowId);

          mainResult = `Updated task ${args.task_update.task_index} on wave ${args.wave_number} to '${args.task_update.status}' for workflow '${workflowId}'.`;
        } else {
          ctx.db.upsertWave(workflowId, {
            wave_number: args.wave_number,
            title: args.title,
            status: args.status,
            pr_branch: args.pr_branch,
            pr_url: args.pr_url,
          });

          const wave = ctx.db.getWave(workflowId, args.wave_number);
          if (wave === null) {
            return `Error in goop_write_wave: wave ${args.wave_number} was not found after write`;
          }

          defaultWaveId = wave.id;

          for (const task of args.tasks ?? []) {
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
            wave_number: args.wave_number,
            task_count: args.tasks?.length ?? 0,
            mode: "wave_upsert",
            timestamp: Date.now(),
          });
          renderSidecars(ctx, workflowId);

          mainResult = `Written wave ${args.wave_number} for workflow '${workflowId}' with ${args.tasks?.length ?? 0} task(s).`;
        }

        const waveComplete = args.task_update === undefined && isWaveComplete(args.status);

        const verificationResults: string[] = [];
        if (args.verifications !== undefined && defaultWaveId !== -1) {
          for (const item of args.verifications) {
            verificationResults.push(recordVerification(ctx, workflowId, item, defaultWaveId));
          }
        }

        const traceabilityResults: string[] = [];
        if (args.traceability !== undefined) {
          for (const item of args.traceability) {
            traceabilityResults.push(writeTraceability(ctx, workflowId, item, args.wave_number));
          }
        }

        let response: string;
        if (verificationResults.length === 0 && traceabilityResults.length === 0) {
          response = mainResult;
        } else {
          const sections = [mainResult];
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
          response = sections.join("\n\n");
        }

        return waveComplete ? `${response}${WAVE_COMPLETE_COMPACT_REMINDER}` : response;
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        return `Error in goop_write_wave: ${msg}`;
      }
    },
  });
}
