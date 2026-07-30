/**
 * background_cancel tool — terminate a background job and its entire process group.
 *
 * ORDERING IS LOAD-BEARING: state is marked `cancelled` BEFORE the kill is
 * issued. Bun resolves `proc.exited` to `128 + signum` (143 for SIGTERM)
 * moments after the kill, and the Wave-2 `transitionJobToExited` helper only
 * applies `running -> exited` when state is still `running`. Killing before
 * marking cancelled would let the arriving 143 overwrite state to `exited`,
 * silently reporting every cancelled job as a normal exit.
 *
 * The kill itself is delegated to the Wave-2 `killJobGroup` helper, which
 * negates the pgid internally (process group, not the single pid) and
 * escalates SIGTERM -> SIGKILL after 2s. This tool never reimplements either.
 *
 * @module tools/background-cancel
 */

import { tool } from "../../core/sdk-compat.js";
import type { ToolContext, ToolDefinition } from "../../core/sdk-compat.js";
import type { PluginContext } from "../../core/types.js";
import { killJobGroup } from "../../features/background-jobs/kill.js";
import type { JobState } from "../../features/background-jobs/types.js";
import { logError } from "../../shared/logger.js";

/** States from which a job can no longer be cancelled. */
const TERMINAL_STATES: ReadonlySet<JobState> = new Set(["exited", "cancelled", "timed-out"]);

export function createBackgroundCancelTool(ctx: PluginContext): ToolDefinition {
  return tool({
    description:
      "Cancel a background job by terminating its entire process group " +
      "(SIGTERM, escalating to SIGKILL after 2s). Returns a no-op message if " +
      "the job is already terminal, and not-found for unknown ids. Never throws.",
    args: {
      job_id: tool.schema.string(),
    },
    async execute(args: { job_id: string }, _context: ToolContext): Promise<string> {
      try {
        const job = ctx.backgroundJobs.get(args.job_id);
        if (!job) {
          return `Background job not found: ${args.job_id}`;
        }

        if (TERMINAL_STATES.has(job.state)) {
          return (
            `Background job ${job.id} is already ${job.state}` +
            ` (exitCode ${job.exitCode ?? "n/a"}). No action taken.`
          );
        }

        // 1. Mark cancelled BEFORE the kill (see module docblock) and detach the
        //    expiry timer from the registry in the same atomic update.
        // 2. Clear the OS-level timer so a pending timeout cannot race the
        //    cancel. All of steps 1-2 are synchronous, so no timer callback can
        //    interleave before the kill below.
        // 3. Reuse the Wave-2 group-kill helper — it negates the pgid and
        //    handles SIGTERM -> SIGKILL escalation. Do not reimplement.
        const timer = job.timer;
        ctx.backgroundJobs.update(job.id, {
          state: "cancelled",
          timer: undefined,
        });
        if (timer) clearTimeout(timer);
        killJobGroup(job.pgid);

        return `Cancelled background job ${job.id} ("${job.command}"). Sent SIGTERM to process group (pgid ${job.pgid}, signaled as ${-job.pgid}); escalates to SIGKILL after 2s if the group does not exit.`;
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logError("Failed to cancel background job", error);
        return `Failed to cancel background job ${args.job_id}: ${msg}`;
      }
    },
  });
}
