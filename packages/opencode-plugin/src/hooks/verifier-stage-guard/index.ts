/**
 * Verifier stage-dispatch guard — blocks a `task` delegation to
 * `goop-verifier` or `goop-wave-verifier` outside its permitted lifecycle
 * phase. `goop-verifier` is acceptance-only; `goop-wave-verifier` is
 * execute-only.
 *
 * Denial is a deliberate `IntentionalToolDenialError` (see `../utils.js`):
 * `safeHandler` rethrows only that sentinel, so this guard's decision
 * reaches the host and aborts the pending `task` call before the subagent
 * session is created, while every other error this guard (or any other
 * hook) might raise keeps the default catch-and-log behavior.
 *
 * Fails OPEN: an unrecognized tool, a missing/unrecognized `subagent_type`,
 * or a failure to read the active workflow phase all fall through to the
 * underlying `safeHandler` catch clause and permit the call unchanged.
 */

import type { PluginContext } from "../../core/types.js";
import { isVerifierDispatchAllowed } from "../../features/enforcement/verifier-stage.js";
import type { HookFactory, Hooks } from "../types.js";
import { IntentionalToolDenialError, safeHandler } from "../utils.js";

const TASK_TOOL_NAME = "task";
const GOOP_PREFIX = "goop-";

/** Strips a leading `goop-` prefix; returns the raw value for unprefixed names. */
function normalizeRole(subagentType: unknown): string | undefined {
  if (typeof subagentType !== "string" || subagentType.length === 0) return undefined;
  return subagentType.startsWith(GOOP_PREFIX)
    ? subagentType.slice(GOOP_PREFIX.length)
    : subagentType;
}

function extractSubagentType(args: unknown): unknown {
  if (typeof args !== "object" || args === null) return undefined;
  return (args as Record<string, unknown>).subagent_type;
}

/**
 * Rewrites bare `verifier`/`wave-verifier` role mentions in the predicate's
 * reason text to their real, `goop-`-prefixed agent names, matching what a
 * caller actually types into a subsequent `task` dispatch. Presentational
 * only — the allow/deny decision itself is fully owned by
 * `isVerifierDispatchAllowed`.
 */
const VERIFIER_ROLE_NAMES = /\b(wave-verifier|verifier)\b/g;
function withGoopPrefix(message: string): string {
  return message.replace(VERIFIER_ROLE_NAMES, (role) => `${GOOP_PREFIX}${role}`);
}

/**
 * Create the verifier stage-dispatch guard hook.
 */
export function createVerifierStageGuardHook(ctx: PluginContext): Partial<Hooks> {
  const handler: NonNullable<Hooks["tool.execute.before"]> = async (input, output) => {
    if (input.tool.toLowerCase() !== TASK_TOOL_NAME) return;

    const role = normalizeRole(extractSubagentType(output.args));
    if (!role) return;

    const phase = ctx.stateManager.getActiveWorkflow().phase;
    const result = isVerifierDispatchAllowed({ role, phase });
    if (result.allowed) return;

    const reason =
      result.reason ?? `${GOOP_PREFIX}${role} dispatch is not permitted in the ${phase} phase.`;
    throw new IntentionalToolDenialError(withGoopPrefix(reason));
  };

  return {
    "tool.execute.before": safeHandler("verifier-stage-guard", handler),
  };
}

/** HookFactory-compatible wrapper. */
export const verifierStageGuardHookFactory: HookFactory = createVerifierStageGuardHook;
