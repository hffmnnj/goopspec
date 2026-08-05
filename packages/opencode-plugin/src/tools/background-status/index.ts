/**
 * background_status tool — poll one background job, or list them all.
 *
 * READ-ONLY apart from the lazy expiry sweep: a job past its deadline while
 * still marked `running` is flipped to `timed-out` on poll. The tool never
 * terminates a job — the eager timer (spawned with the job) owns the kill.
 *
 * @module tools/background-status
 */

import { existsSync } from "node:fs";
import { join } from "node:path";

import { tool } from "../../core/sdk-compat.js";
import type { ToolContext, ToolDefinition } from "../../core/sdk-compat.js";
import type { PluginContext } from "../../core/types.js";
import { sweepIfExpired } from "../../features/background-jobs/kill.js";
import type { BackgroundJobRegistry } from "../../features/background-jobs/registry.js";
import type { JobRecord } from "../../features/background-jobs/types.js";
import { logError } from "../../shared/logger.js";

const DEFAULT_TAIL_BYTES = 4096;

// ---------------------------------------------------------------------------
// Expiry sweep (lazy half of hybrid expiry)
// ---------------------------------------------------------------------------

/**
 * Flip every `running` job past its deadline to `timed-out`.
 *
 * This is the lazy half of the hybrid expiry design: the eager timer set up at
 * spawn time owns the actual process kill; this sweep only corrects stale state
 * when a poll observes an expired-but-still-running job. It never terminates a
 * process and never overwrites an already-terminal state.
 */
function sweepExpiredJobs(registry: BackgroundJobRegistry): void {
  for (const job of registry.list()) {
    if (job.state !== "running") continue;
    if (!sweepIfExpired(job)) continue;
    registry.update(job.id, { state: "timed-out" });
  }
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatDuration(ms: number): string {
  if (ms <= 0) return "0s";
  const totalSeconds = Math.floor(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const remSeconds = totalSeconds % 60;
  if (totalMinutes < 60)
    return remSeconds > 0 ? `${totalMinutes}m ${remSeconds}s` : `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const remMinutes = totalMinutes % 60;
  return remMinutes > 0 ? `${hours}h ${remMinutes}m` : `${hours}h`;
}

function formatTimeRemaining(deadline: number, now: number): string {
  const diff = deadline - now;
  if (diff > 0) return `in ${formatDuration(diff)}`;
  return `expired ${formatDuration(-diff)} ago`;
}

function formatTimestamp(ms: number): string {
  return new Date(ms).toISOString();
}

// ---------------------------------------------------------------------------
// Log tail reading
// ---------------------------------------------------------------------------

interface LogTail {
  totalBytes: number;
  tail: string;
  truncated: boolean;
}

/**
 * Read the last `tailBytes` of a log file without loading the whole file into
 * memory. Uses `Bun.file(path).size` for the total byte count and `BunFile.slice`
 * for the tail view so only the requested range is read from disk. A missing log
 * file yields empty output, never an error.
 */
async function readLogTail(logPath: string, tailBytes: number): Promise<LogTail> {
  if (!existsSync(logPath)) {
    return { totalBytes: 0, tail: "", truncated: false };
  }
  try {
    const file = Bun.file(logPath);
    const totalBytes = file.size;
    if (totalBytes === 0) {
      return { totalBytes: 0, tail: "", truncated: false };
    }
    const start = Math.max(0, totalBytes - tailBytes);
    const tail = await file.slice(start).text();
    return { totalBytes, tail, truncated: start > 0 };
  } catch (error) {
    logError("Failed to read background job log tail", error);
    return { totalBytes: 0, tail: "", truncated: false };
  }
}

function formatOutputSection(label: string, log: LogTail, tailBytes: number): string {
  const lines: string[] = [];
  if (log.truncated) {
    lines.push(
      `### ${label} (${log.totalBytes} bytes total — truncated, showing last ${tailBytes})`,
    );
  } else {
    lines.push(`### ${label} (${log.totalBytes} bytes total)`);
  }
  lines.push("");
  if (log.totalBytes === 0) {
    lines.push("(empty)");
  } else {
    lines.push(log.tail);
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Single-job report
// ---------------------------------------------------------------------------

function formatJobReport(
  job: JobRecord,
  stdoutLog: LogTail,
  stderrLog: LogTail,
  tailBytes: number,
  now: number,
): string {
  const lines: string[] = [];
  lines.push(`## Background Job · ${job.id}`);
  lines.push("");
  lines.push(`- **State:** ${job.state}`);
  lines.push(`- **PID:** ${job.pid}`);
  if (job.exitCode !== null) {
    lines.push(`- **Exit code:** ${job.exitCode}`);
  }
  lines.push(`- **Started:** ${formatTimestamp(job.startedAt)}`);
  lines.push(
    `- **Deadline:** ${formatTimestamp(job.deadline)} (${formatTimeRemaining(job.deadline, now)})`,
  );
  lines.push(`- **Command:** \`${job.command}\``);
  lines.push("");
  lines.push(formatOutputSection("stdout", stdoutLog, tailBytes));
  lines.push("");
  lines.push(formatOutputSection("stderr", stderrLog, tailBytes));
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Job list table
// ---------------------------------------------------------------------------

function formatJobList(jobs: JobRecord[], now: number): string {
  if (jobs.length === 0) {
    return "No background jobs registered.";
  }
  const lines: string[] = [];
  lines.push(`## Background Jobs (${jobs.length})`);
  lines.push("");
  lines.push("| ID | State | Command | Started | Deadline |");
  lines.push("|---|---|---|---|---|");
  for (const job of jobs) {
    lines.push(
      `| ${job.id} | ${job.state} | \`${job.command}\` | ${formatTimestamp(job.startedAt)} | ${formatTimeRemaining(job.deadline, now)} |`,
    );
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Tool factory
// ---------------------------------------------------------------------------

export function createBackgroundStatusTool(ctx: PluginContext): ToolDefinition {
  return tool({
    description:
      "Poll one background job by id, or list all registered jobs. " +
      "WHEN TO USE: Check whether a job is running, read its recent output, or enumerate every job. " +
      "WHEN NOT TO USE: background_command to start a job; background_cancel to stop one. " +
      "RETURNS: With job_id, a detailed report (state, pid, exit code, started/deadline, command, truncated stdout/stderr tails). Without job_id, a table of all jobs. " +
      "CAVEATS: Runs a lazy expiry sweep that marks any still-running job past its deadline as timed-out but does NOT kill it — the eager timer owns the kill, so timed-out does not mean the process is dead. tail_bytes (default 4096) bounds each output tail.",
    args: {
      job_id: tool.schema.string().optional().describe(
        "Job id to poll for a detailed report. Omit entirely to list all registered jobs; " +
          "do not pass an empty string.",
      ),
      tail_bytes: tool.schema.number().optional().describe(
        "Bytes of stdout/stderr tail to show in a single-job report. Defaults to 4096. " +
          "Has no effect when listing all jobs.",
      ),
    },
    async execute(
      args: { job_id?: string; tail_bytes?: number },
      _context: ToolContext,
    ): Promise<string> {
      try {
        const tailBytes = Math.max(0, Math.floor(args.tail_bytes ?? DEFAULT_TAIL_BYTES));
        const registry = ctx.backgroundJobs;

        // Lazy expiry sweep — flip stale running jobs to timed-out before reporting.
        sweepExpiredJobs(registry);

        const now = Date.now();

        // No job_id → list all jobs.
        if (args.job_id === undefined) {
          return formatJobList(registry.list(), now);
        }

        const job = registry.get(args.job_id);
        if (!job) {
          return `Background job '${args.job_id}' not found.`;
        }

        const stdoutPath = join(job.logDir, "stdout.log");
        const stderrPath = join(job.logDir, "stderr.log");
        const [stdoutLog, stderrLog] = await Promise.all([
          readLogTail(stdoutPath, tailBytes),
          readLogTail(stderrPath, tailBytes),
        ]);

        return formatJobReport(job, stdoutLog, stderrLog, tailBytes, now);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        return `Error in background_status: ${msg}`;
      }
    },
  });
}
