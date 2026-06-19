/**
 * Tool-lifecycle hook — before/after handlers with non-blocking memory distillation.
 *
 * `before`: lightweight bookkeeping (track active tool, start timing).
 * `after`: lightweight bookkeeping (timing) + fire-and-forget memory distillation
 *          for significant tool executions (phase transitions, spec locks, wave
 *          completions, ADL decisions, archive operations).
 *
 * Memory distillation replaces the cut `memory-distiller` agent from 0.2.x.
 * Distillation is NON-BLOCKING: it is kicked off without awaiting in the
 * handler's critical path. Errors are caught internally — no unhandled rejections.
 */

import type { PluginContext } from "../core/types.js";
import { logError } from "../shared/logger.js";
import type { HookFactory, Hooks } from "./types.js";
import { safeHandler } from "./utils.js";

// ---------------------------------------------------------------------------
// Timing bookkeeping — per-call start timestamps
// ---------------------------------------------------------------------------

const callTimings = new Map<string, number>();

// ---------------------------------------------------------------------------
// Significance predicate
// ---------------------------------------------------------------------------

/**
 * Tool names whose executions are considered significant enough to distill
 * into memory. These represent meaningful workflow state changes.
 */
const SIGNIFICANT_TOOLS = new Set(["goop_state", "goop_adl", "goop_checkpoint", "goop_setup"]);

/**
 * For `goop_state`, only certain actions are significant (not reads).
 */
const SIGNIFICANT_STATE_ACTIONS = new Set([
  "transition",
  "lock-spec",
  "unlock-spec",
  "complete-interview",
  "confirm-acceptance",
  "update-wave",
  "set-mode",
  "set-depth",
  "create-workflow",
  "set-active-workflow",
  "reset",
]);

/**
 * Determine whether a tool execution is significant enough to warrant
 * memory distillation.
 *
 * Significant events: phase transitions, spec lock/unlock, wave updates,
 * interview/acceptance completions, ADL decisions, checkpoint saves,
 * setup operations. NOT: trivial reads, status checks, memory searches.
 */
export function isSignificant(toolName: string, input: Record<string, unknown>): boolean {
  if (!SIGNIFICANT_TOOLS.has(toolName)) {
    return false;
  }

  // goop_state: only significant for mutating actions
  if (toolName === "goop_state") {
    const action = input.action;
    if (typeof action !== "string") return false;
    return SIGNIFICANT_STATE_ACTIONS.has(action);
  }

  // goop_adl: only significant for append (not read)
  if (toolName === "goop_adl") {
    return input.action === "append";
  }

  // goop_checkpoint: only significant for save (not list/load)
  if (toolName === "goop_checkpoint") {
    return input.action === "save";
  }

  // goop_setup: all actions are significant
  return true;
}

// ---------------------------------------------------------------------------
// Distillation — non-blocking memory write
// ---------------------------------------------------------------------------

/**
 * Build a concise observation string from a significant tool execution.
 */
function buildObservation(
  toolName: string,
  input: Record<string, unknown>,
  _output: string,
): string {
  const action = typeof input.action === "string" ? input.action : "unknown";

  switch (toolName) {
    case "goop_state": {
      const details: string[] = [`State ${action}`];
      if (input.phase) details.push(`phase → ${String(input.phase)}`);
      if (input.currentWave != null)
        details.push(`wave ${String(input.currentWave)}/${String(input.totalWaves ?? "?")}`);
      if (input.mode) details.push(`mode: ${String(input.mode)}`);
      return details.join("; ");
    }
    case "goop_adl": {
      const desc =
        typeof input.description === "string" ? input.description.slice(0, 120) : "decision logged";
      return `ADL: ${desc}`;
    }
    case "goop_checkpoint":
      return `Checkpoint saved: ${typeof input.id === "string" ? input.id : "unnamed"}`;
    case "goop_setup":
      return `Setup: ${action}`;
    default:
      return `${toolName}: ${action}`;
  }
}

/**
 * Fire-and-forget memory distillation. Catches all errors internally.
 */
function distill(
  memory: PluginContext["memory"],
  toolName: string,
  input: Record<string, unknown>,
  output: string,
): void {
  const observation = buildObservation(toolName, input, output);

  // Defer to queueMicrotask so synchronous SQLite work does not block the
  // hook's critical path. Catch errors internally — no unhandled rejections.
  queueMicrotask(() => {
    void memory
      .save({
        type: "observation",
        title: `Hook distill: ${observation.slice(0, 80)}`,
        content: observation,
        concepts: ["auto-distill", toolName],
        importance: 4,
      })
      .catch((err: unknown) => {
        logError("tool-lifecycle: fire-and-forget memory.save failed", err);
      });
  });
}

// ---------------------------------------------------------------------------
// Hook factory
// ---------------------------------------------------------------------------

/**
 * Create the tool-lifecycle hook (before/after) with non-blocking memory distillation.
 */
export function createToolLifecycleHook(ctx: PluginContext): Partial<Hooks> {
  // Cache for input args — keyed by callID so `after` can access what `before` saw
  const callArgs = new Map<string, Record<string, unknown>>();

  const before: NonNullable<Hooks["tool.execute.before"]> = safeHandler(
    "tool-lifecycle:before",
    async (
      input: { tool: string; sessionID: string; callID: string },
      _output: { args: Record<string, unknown> },
    ): Promise<void> => {
      // Track timing
      callTimings.set(input.callID, Date.now());

      // Cache the args for the after handler's significance check
      callArgs.set(input.callID, { ..._output.args });
    },
  );

  const after: NonNullable<Hooks["tool.execute.after"]> = safeHandler(
    "tool-lifecycle:after",
    async (
      input: { tool: string; sessionID: string; callID: string },
      output: { title: string; output: string; metadata: Record<string, unknown> },
    ): Promise<void> => {
      // Clean up timing
      const startTime = callTimings.get(input.callID);
      callTimings.delete(input.callID);

      // Retrieve cached args
      const args = callArgs.get(input.callID) ?? {};
      callArgs.delete(input.callID);

      // Inject timing metadata if available
      if (startTime != null) {
        output.metadata.durationMs = Date.now() - startTime;
      }

      // Non-blocking memory distillation for significant events
      if (isSignificant(input.tool, args)) {
        distill(ctx.memory, input.tool, args, output.output);
      }
    },
  );

  return {
    "tool.execute.before": before,
    "tool.execute.after": after,
  };
}

/** HookFactory-compatible wrapper. */
export const toolLifecycleHookFactory: HookFactory = (ctx) => createToolLifecycleHook(ctx);
