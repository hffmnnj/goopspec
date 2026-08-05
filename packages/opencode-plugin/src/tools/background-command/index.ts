import { tool } from "../../core/sdk-compat.js";
import type { ToolContext, ToolDefinition } from "../../core/sdk-compat.js";
import type { PluginContext } from "../../core/types.js";
import { killJobGroup, startExpiryTimer } from "../../features/background-jobs/kill.js";
import { generateJobId } from "../../features/background-jobs/registry.js";
import { spawnBackgroundJob } from "../../features/background-jobs/spawn.js";
import type { JobRecord } from "../../features/background-jobs/types.js";
import { logError } from "../../shared/logger.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_TIMEOUT_SECONDS = 1800;
const MIN_TIMEOUT_SECONDS = 1;
const MAX_TIMEOUT_SECONDS = 86400;
const TIMEOUT_RANGE_LABEL = `an integer between ${MIN_TIMEOUT_SECONDS} and ${MAX_TIMEOUT_SECONDS} seconds`;

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validate `timeout_seconds`. Returns an error string when the value is
 * unacceptable, or null when it is valid (including the undefined default).
 *
 * Never clamps: an out-of-range or non-integer value is rejected explicitly so
 * the caller's stated intent is never silently discarded.
 */
function validateTimeoutSeconds(value: number | undefined): string | null {
  if (value === undefined) return null;
  if (Number.isNaN(value)) {
    return `timeout_seconds must be ${TIMEOUT_RANGE_LABEL} (received NaN).`;
  }
  if (!Number.isInteger(value)) {
    return `timeout_seconds must be ${TIMEOUT_RANGE_LABEL} (received non-integer ${value}).`;
  }
  if (value < MIN_TIMEOUT_SECONDS || value > MAX_TIMEOUT_SECONDS) {
    return `timeout_seconds must be ${TIMEOUT_RANGE_LABEL} (received ${value}).`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Tool factory
// ---------------------------------------------------------------------------

export function createBackgroundCommandTool(ctx: PluginContext): ToolDefinition {
  return tool({
    description:
      "Start a detached background job and return immediately with its id, pid, cwd, and deadline. " +
      "WHEN TO USE: Long-running work that should not block the response — dev servers, slow test suites. " +
      "WHEN NOT TO USE: bash to wait on a command; background_status to poll a job; background_cancel to stop one. " +
      "RETURNS: A block with the job id, pid, cwd, and ISO-8601 deadline. " +
      "CAVEATS: The job outlives this call (detached, via sh -c). timeout_seconds defaults to 1800 (30 minutes); when the timeout expires the command is killed. Must be an integer in [1, 86400]; other values are rejected, not clamped. cwd defaults to the plugin working directory; logs land in .goopspec/background-jobs/<jobId>/.",
    args: {
      command: tool.schema
        .string()
        .describe(
          "Shell command to run detached. Must be a non-empty string; an empty command is rejected.",
        ),
      cwd: tool.schema.string().optional().describe(
        "Working directory for the command. Defaults to the plugin working directory " +
          "(ctx.sdk.directory) when omitted.",
      ),
      timeout_seconds: tool.schema.number().optional().describe(
        "Maximum runtime in seconds before the job is killed. Defaults to 1800 (30 min). " +
          "Must be an integer in [1, 86400]; non-integer or out-of-range values are rejected, not clamped.",
      ),
    },
    async execute(
      args: { command: string; cwd?: string; timeout_seconds?: number },
      _context: ToolContext,
    ): Promise<string> {
      try {
        const { command, cwd, timeout_seconds } = args;

        if (typeof command !== "string" || command.trim() === "") {
          return "Error: command is required and must be a non-empty string.";
        }

        const timeoutError = validateTimeoutSeconds(timeout_seconds);
        if (timeoutError) {
          return `Error: ${timeoutError}`;
        }

        const effectiveTimeout = timeout_seconds ?? DEFAULT_TIMEOUT_SECONDS;
        const effectiveCwd = cwd ?? ctx.sdk.directory;

        const id = generateJobId();
        const deadline = Date.now() + effectiveTimeout * 1000;

        const job = spawnBackgroundJob(ctx.backgroundJobs, {
          id,
          command,
          cwd: effectiveCwd,
          projectDir: ctx.sdk.directory,
          deadline,
        });

        // Start the expiry timer. The callback runs in an UNSUPERVISED
        // setTimeout — it must be total: never throw, never leave a floating
        // promise. All work is wrapped in try/catch and uses only synchronous
        // registry operations.
        startExpiryTimer(job, (expired: JobRecord) => {
          try {
            const current = ctx.backgroundJobs.get(expired.id);
            if (!current || current.state !== "running") return;
            killJobGroup(current.pgid);
            ctx.backgroundJobs.update(expired.id, { state: "timed-out" });
          } catch (error) {
            logError("Failed to expire background job", error);
          }
        });

        return [
          "Background job started.",
          `  job id:  ${job.id}`,
          `  pid:     ${job.pid}`,
          `  cwd:     ${job.cwd}`,
          `  deadline: ${new Date(job.deadline).toISOString()}`,
        ].join("\n");
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logError("Failed to start background job", error);
        return `Error: failed to start background job: ${msg}`;
      }
    },
  });
}
