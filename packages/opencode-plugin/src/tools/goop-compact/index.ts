/**
 * goop_compact tool — trigger OpenCode session compaction with a resume handoff.
 *
 * @module tools/goop-compact
 */

import {
  describePendingCompaction,
  getLivePendingCompaction,
} from "../../core/pending-compaction.js";
import { tool } from "../../core/sdk-compat.js";
import type { ToolContext, ToolDefinition } from "../../core/sdk-compat.js";
import type {
  CompactionHandoffBlocker,
  CompactionHandoffSnapshot,
  CompactionHandoffTask,
  GoopState,
  PluginContext,
} from "../../core/types.js";
import { COMPACT_RECONCILIATION_DIRECTIVE } from "../../shared/compact-reminder.js";
import { log, logError } from "../../shared/logger.js";

/** Maximum task rows projected into the snapshot (current wave only). */
const MAX_SNAPSHOT_TASKS = 8;

/** Maximum open-blocker rows projected into the snapshot. */
const MAX_SNAPSHOT_BLOCKERS = 5;

interface ModelRef {
  providerID: string;
  modelID: string;
}

interface SessionMessage {
  info?: {
    role?: string;
    agent?: string;
    model?: ModelRef;
    providerID?: string;
    modelID?: string;
  };
}

interface FieldsResponse<T> {
  data?: T;
  error?: unknown;
}

function fieldsResponse<T>(value: unknown): FieldsResponse<T> {
  if (value !== null && typeof value === "object" && ("data" in value || "error" in value)) {
    return value as FieldsResponse<T>;
  }
  return { data: value as T };
}

function errorDetail(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error !== null && typeof error === "object") {
    const value = error as { message?: unknown; data?: { message?: unknown } };
    if (typeof value.data?.message === "string") return value.data.message;
    if (typeof value.message === "string") return value.message;
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
  return String(error);
}

function currentModel(messages: SessionMessage[]): ModelRef | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const info = messages[index]?.info;
    if (info?.role === "user" && info.model?.providerID && info.model.modelID) {
      return info.model;
    }
  }

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const info = messages[index]?.info;
    if (info?.providerID && info.modelID) {
      return { providerID: info.providerID, modelID: info.modelID };
    }
  }

  return undefined;
}

function clearFailedCompaction(ctx: PluginContext, sessionID: string): void {
  ctx.pendingCompactions.delete(sessionID);
  ctx.compactionHandoff.delete(sessionID);
}

function observeCompaction(request: Promise<unknown>, ctx: PluginContext, sessionID: string): void {
  void request
    .then((result) => {
      const response = fieldsResponse<boolean>(result);
      if (response.error !== undefined) {
        clearFailedCompaction(ctx, sessionID);
        logError(`goop_compact request rejected: ${errorDetail(response.error)}`, response.error);
        return;
      }
      if (response.data !== true) {
        clearFailedCompaction(ctx, sessionID);
        logError(
          "goop_compact request was not confirmed by the host",
          new Error(`Unexpected compaction response: ${String(response.data)}`),
        );
        return;
      }
      ctx.pendingCompactions.delete(sessionID);
      log("goop_compact summarize settled", { sessionID });
    })
    .catch((error: unknown) => {
      clearFailedCompaction(ctx, sessionID);
      logError("goop_compact request failed", error);
    });
}

interface SummarizeBody extends ModelRef {
  auto?: boolean;
}

async function resolveCurrentBranch(worktree: string): Promise<string | undefined> {
  try {
    const result = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
      const process = Bun.spawn(["git", "branch", "--show-current"], {
        cwd: worktree,
        stdout: "pipe",
        stderr: "pipe",
      });
      process.exited
        .then(async (exitCode) => {
          const stdout = await new Response(process.stdout).text();
          const stderr = await new Response(process.stderr).text();
          if (exitCode === 0) {
            resolve({ stdout, stderr });
          } else {
            reject(new Error(stderr || `git branch exited with status ${exitCode}`));
          }
        })
        .catch(reject);
    });
    const branch = result.stdout.trim();
    return branch || undefined;
  } catch {
    return undefined;
  }
}

interface DivergenceCheck {
  readonly divergentFields: string[];
  readonly persistedState: GoopState;
}

function detectDivergence(cached: GoopState, persisted: GoopState): DivergenceCheck {
  const divergentFields: string[] = [];

  if (cached.activeWorkflowId !== persisted.activeWorkflowId) {
    divergentFields.push("activeWorkflowId");
  }

  const cachedWorkflow = cached.workflows[cached.activeWorkflowId];
  const persistedWorkflow = persisted.workflows[persisted.activeWorkflowId];

  if (cachedWorkflow && persistedWorkflow) {
    const keys = Object.keys(cachedWorkflow) as (keyof typeof cachedWorkflow)[];
    for (const key of keys) {
      if (cachedWorkflow[key] !== persistedWorkflow[key]) {
        divergentFields.push(key);
      }
    }
  }

  return { divergentFields, persistedState: persisted };
}

interface CurrentWaveMetadata {
  readonly currentWaveTitle: string | undefined;
  readonly currentWaveStatus: string | undefined;
  readonly tasks: ReadonlyArray<CompactionHandoffTask>;
  readonly openBlockers: ReadonlyArray<CompactionHandoffBlocker>;
  readonly prBranch: string | undefined;
  readonly prUrl: string | undefined;
}

/**
 * Collect current-wave task, blocker, and PR metadata from the GoopSpecDB.
 *
 * Returns `undefined` when the current wave has no row, the wave number is 0,
 * or any DB accessor throws. The caller must never fail to produce a valid
 * core snapshot because of a DB error — the optional fields simply drop out.
 */
function collectCurrentWaveMetadata(
  ctx: PluginContext,
  workflowId: string,
  currentWave: number,
): CurrentWaveMetadata | undefined {
  if (currentWave <= 0) return undefined;

  try {
    const waves = ctx.db.getWaves(workflowId, [currentWave]);
    const wave = waves[0];
    if (!wave) return undefined;

    const tasks: CompactionHandoffTask[] = ctx.db
      .getWaveTasks(wave.id)
      .slice(0, MAX_SNAPSHOT_TASKS)
      .map((t) => ({
        index: t.task_index,
        description: t.description,
        status: t.status,
        agent: t.agent ?? undefined,
      }));

    const openBlockers: CompactionHandoffBlocker[] = ctx.db
      .getBlockers(workflowId, "open")
      .slice(0, MAX_SNAPSHOT_BLOCKERS)
      .map((b) => ({
        id: b.id,
        severity: b.severity,
        description: b.description,
      }));

    return {
      currentWaveTitle: wave.title || undefined,
      currentWaveStatus: wave.status,
      tasks,
      openBlockers,
      prBranch: wave.pr_branch ?? undefined,
      prUrl: wave.pr_url ?? undefined,
    };
  } catch (error) {
    logError(
      "goop_compact could not collect current-wave metadata for the handoff snapshot",
      error,
    );
    return undefined;
  }
}

async function captureCompactionHandoff(
  ctx: PluginContext,
  nextStep: string,
): Promise<CompactionHandoffSnapshot | undefined> {
  try {
    const state = ctx.stateManager.getState();
    const workflow = state.workflows[state.activeWorkflowId];
    if (!workflow) {
      throw new Error(`Active workflow ${state.activeWorkflowId} was not found`);
    }

    const metadata = collectCurrentWaveMetadata(ctx, state.activeWorkflowId, workflow.currentWave);

    return {
      workflowId: state.activeWorkflowId,
      phase: workflow.phase,
      mode: workflow.mode,
      depth: workflow.depth,
      specLocked: workflow.specLocked,
      interviewComplete: workflow.interviewComplete,
      acceptanceConfirmed: workflow.acceptanceConfirmed,
      currentWave: workflow.currentWave,
      totalWaves: workflow.totalWaves,
      autopilot: workflow.autopilot,
      lazyAutopilot: workflow.lazyAutopilot,
      branch: await resolveCurrentBranch(ctx.sdk.worktree),
      nextStep,
      capturedAtMs: Date.now(),
      currentWaveTitle: metadata?.currentWaveTitle,
      currentWaveStatus: metadata?.currentWaveStatus,
      tasks: metadata?.tasks,
      openBlockers: metadata?.openBlockers,
      prBranch: metadata?.prBranch,
      prUrl: metadata?.prUrl,
    };
  } catch (error) {
    logError("goop_compact could not capture the compaction handoff snapshot", error);
    return undefined;
  }
}

export function dispatchPendingCompaction(ctx: PluginContext, sessionID: string): void {
  const pending = getLivePendingCompaction(ctx, sessionID);
  if (!pending || pending.status !== "queued") return;

  const session = ctx.sdk.client?.session;
  if (typeof session?.summarize !== "function") {
    clearFailedCompaction(ctx, sessionID);
    logError("goop_compact unavailable while dispatching the pending compaction");
    return;
  }

  pending.status = "in-flight";
  log("goop_compact dispatching summarize", { sessionID, auto: true });

  try {
    const body: SummarizeBody = { ...pending.model, auto: true };
    const request = session.summarize({ path: { id: sessionID }, body: body as SummarizeBody });
    observeCompaction(Promise.resolve(request), ctx, sessionID);
  } catch (error) {
    clearFailedCompaction(ctx, sessionID);
    logError("goop_compact failed to dispatch the pending compaction", error);
  }
}

export function createGoopCompactTool(ctx: PluginContext): ToolDefinition {
  return tool({
    description:
      "Trigger OpenCode session compaction and seed the post-compaction resume step. WHEN TO USE: When the orchestrator context is near its limit and a clean handoff is needed. WHEN NOT TO USE: goop_checkpoint for a reversible state snapshot; goop_status to orient without compacting. RETURNS: A directive to end the turn so compaction can occur, carrying the recorded next_step. CAVEATS: Orchestrator-only and V1-only. If the host lacks session compaction the tool returns 'unavailable', which is not an error. next_step is required and is replayed as the immediate resume action; a queued compaction cannot be doubled.",
    args: {
      next_step: tool.schema
        .string()
        .describe(
          "A short 1-2 sentence description of what the Orchestrator will do immediately after compaction.",
        ),
    },
    async execute(args: { next_step: string }, context: ToolContext): Promise<string> {
      let sessionID: string | undefined;

      try {
        const session = ctx.sdk.client?.session;
        if (typeof session?.summarize !== "function") {
          return "goop_compact unavailable: session compaction is not supported on this host.";
        }

        sessionID = context.sessionID.trim();
        if (!sessionID) {
          return "goop_compact failed: a session ID is required to trigger compaction.";
        }

        const existingPending = getLivePendingCompaction(ctx, sessionID);
        if (existingPending) {
          return `Compaction is already ${describePendingCompaction(existingPending)} for session ${sessionID}; no additional compaction was requested.`;
        }

        const messagesResult = fieldsResponse<SessionMessage[]>(
          await session.messages({ path: { id: sessionID } }),
        );
        if (messagesResult.error !== undefined) {
          if (!getLivePendingCompaction(ctx, sessionID)) ctx.compactionHandoff.delete(sessionID);
          const detail = errorDetail(messagesResult.error);
          logError("goop_compact failed to resolve the session model", messagesResult.error);
          return `goop_compact failed: unable to resolve the current session model: ${detail}`;
        }

        const model = currentModel(messagesResult.data ?? []);
        if (!model) {
          if (!getLivePendingCompaction(ctx, sessionID)) ctx.compactionHandoff.delete(sessionID);
          return "goop_compact failed: unable to resolve the current session model.";
        }

        const pendingAfterModelResolution = getLivePendingCompaction(ctx, sessionID);
        if (pendingAfterModelResolution) {
          return `Compaction is already ${describePendingCompaction(pendingAfterModelResolution)} for session ${sessionID}; no additional compaction was requested.`;
        }

        log("goop_compact queuing compaction", { sessionID });

        let divergenceWarning = "";
        try {
          const cachedBeforeFlush = ctx.stateManager.getState();
          ctx.stateManager.setState(cachedBeforeFlush);
          const persistedAfterFlush = ctx.stateManager.getState();
          const divergence = detectDivergence(cachedBeforeFlush, persistedAfterFlush);
          if (divergence.divergentFields.length > 0) {
            divergenceWarning = ` WARNING: in-memory state diverged from persisted state after flush; fields: ${divergence.divergentFields.join(", ")}.`;
            logError("goop_compact detected stale in-memory state before compaction", {
              sessionID,
              fields: divergence.divergentFields,
            });
          }
        } catch (flushError) {
          logError("goop_compact failed to flush state before queuing", flushError);
        }

        const handoff = await captureCompactionHandoff(ctx, args.next_step);
        if (handoff) ctx.compactionHandoff.set(sessionID, handoff);
        ctx.pendingCompactions.set(sessionID, {
          model,
          status: "queued",
          queuedAtMs: Date.now(),
        });
        log("goop_compact queued compaction", { sessionID, model });

        return `Compaction queued. Please end your turn here so compaction can occur. Next step after compaction: ${args.next_step}${divergenceWarning}${COMPACT_RECONCILIATION_DIRECTIVE}`;
      } catch (error) {
        if (sessionID) {
          clearFailedCompaction(ctx, sessionID);
        }
        logError("goop_compact failed", error);
        return "goop_compact failed: unable to trigger session compaction.";
      }
    },
  });
}
