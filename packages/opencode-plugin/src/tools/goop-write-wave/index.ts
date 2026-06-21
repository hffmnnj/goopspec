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
import { runBatch, formatBatchResult } from "../../features/db/batch.js";
import type { PluginContext } from "../../core/types.js";
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

// ---------------------------------------------------------------------------
// Tool factory
// ---------------------------------------------------------------------------

export function createGoopWriteWaveTool(ctx: PluginContext): ToolDefinition {
  return tool({
    description:
      "Write or update wave metadata and optional inline wave tasks in GoopSpecDB. " +
      "Use task_update to change one task status without rewriting the wave. " +
      "Use items for batch wave writes or task_updates for bulk task status updates.\n\n" +
      "Args:\n" +
      "- wave_number: Wave number to create, update, or target\n" +
      "- title: Optional wave title\n" +
      "- status: Optional wave status\n" +
      "- pr_branch: Optional pull request branch\n" +
      "- pr_url: Optional pull request URL\n" +
      "- tasks: Optional inline task objects { task_index, description?, agent?, status? }\n" +
      "- task_update: Optional single task status update { task_index, status }\n" +
      "- workflow_id: Optional workflow ID (defaults to active workflow)\n" +
      "- items: Optional batch wave payloads\n" +
      "- task_updates: Optional bulk task status updates for wave_number",
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
      },
      _context: ToolContext,
    ): Promise<string> {
      try {
        const workflowId = args.workflow_id ?? ctx.stateManager.getState().activeWorkflowId;

        if (args.items !== undefined) {
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
          return formatBatchResult(result, "write-wave");
        }

        if (args.task_updates !== undefined) {
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

        if (args.task_update !== undefined) {
          const wave = ctx.db.getWave(workflowId, args.wave_number);
          if (wave === null) {
            return `No wave ${args.wave_number} found for workflow '${workflowId}'. Use goop_write_wave to create it.`;
          }

          ctx.db.setWaveTaskStatus(wave.id, args.task_update.task_index, args.task_update.status);
          ctx.db.appendEvent(workflowId, "wave_write", {
            wave_number: args.wave_number,
            task_index: args.task_update.task_index,
            status: args.task_update.status,
            mode: "task_update",
            timestamp: Date.now(),
          });
          renderSidecars(ctx, workflowId);

          return `Updated task ${args.task_update.task_index} on wave ${args.wave_number} to '${args.task_update.status}' for workflow '${workflowId}'.`;
        }

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

        return `Written wave ${args.wave_number} for workflow '${workflowId}' with ${args.tasks?.length ?? 0} task(s).`;
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        return `Error in goop_write_wave: ${msg}`;
      }
    },
  });
}
