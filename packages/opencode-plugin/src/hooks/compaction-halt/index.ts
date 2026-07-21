import type { PluginContext } from "../../core/types.js";
import { logError } from "../../shared/logger.js";
import type { HookFactory, Hooks } from "../types.js";
import { safeHandler } from "../utils.js";
import { buildCompactionHaltMessage } from "./message.js";

interface FallbackPendingTurn {
  queuedAtMs: number;
  turn: number;
}

type IdleSinceSignal = { available: true; idleSince: number | null } | { available: false };

const requestTurns = new Map<string, number>();
const fallbackPendingTurns = new Map<string, FallbackPendingTurn>();

function getIdleSinceSignal(ctx: PluginContext, sessionID: string): IdleSinceSignal {
  const manager: unknown = ctx.sessionManager;
  if (!manager || typeof manager !== "object" || !("get" in manager)) {
    return { available: false };
  }

  const get = (manager as { get?: unknown }).get;
  if (typeof get !== "function") return { available: false };

  const record: unknown = get.call(manager, sessionID);
  if (!record || typeof record !== "object" || !("meta" in record)) {
    return { available: false };
  }

  const meta: unknown = (record as { meta?: unknown }).meta;
  if (!meta || typeof meta !== "object" || !("idleSince" in meta)) {
    return { available: false };
  }

  const idleSince: unknown = (meta as { idleSince?: unknown }).idleSince;
  if (idleSince === null || typeof idleSince === "number") {
    return { available: true, idleSince };
  }

  return { available: false };
}

function isFallbackSubsequentTurn(sessionID: string, queuedAtMs: number): boolean {
  const turn = requestTurns.get(sessionID) ?? 0;
  const recorded = fallbackPendingTurns.get(sessionID);

  if (!recorded || recorded.queuedAtMs !== queuedAtMs) {
    fallbackPendingTurns.set(sessionID, { queuedAtMs, turn });
    return false;
  }

  return turn > recorded.turn;
}

/**
 * Redirect agents that persist into a later turn while compaction is queued.
 * V1 uses the session manager's idle boundary; V2 falls back to request turns.
 */
export function createCompactionHaltHook(ctx: PluginContext): Partial<Hooks> {
  const trackRequestTurn: NonNullable<Hooks["experimental.chat.system.transform"]> = safeHandler(
    "compaction-halt:track-request-turn",
    async (input): Promise<void> => {
      try {
        const sessionID = input.sessionID;
        if (!sessionID) return;
        requestTurns.set(sessionID, (requestTurns.get(sessionID) ?? 0) + 1);
      } catch (error: unknown) {
        logError("compaction-halt: unable to track request turn", error);
      }
    },
  );

  const haltAfterTool: NonNullable<Hooks["tool.execute.after"]> = safeHandler(
    "compaction-halt:after-tool",
    async (input, output): Promise<void> => {
      try {
        const pending = ctx.pendingCompactions.get(input.sessionID);
        if (!pending) {
          fallbackPendingTurns.delete(input.sessionID);
          return;
        }

        const idleSignal = getIdleSinceSignal(ctx, input.sessionID);
        if (idleSignal.available) {
          if (idleSignal.idleSince === null || idleSignal.idleSince <= pending.queuedAtMs) return;
          output.output = buildCompactionHaltMessage(output.output);
          return;
        }

        if (!isFallbackSubsequentTurn(input.sessionID, pending.queuedAtMs)) return;
        output.output = buildCompactionHaltMessage(output.output);
      } catch (error: unknown) {
        logError("compaction-halt: unable to evaluate pending compaction", error);
      }
    },
  );

  return {
    "experimental.chat.system.transform": trackRequestTurn,
    "tool.execute.after": haltAfterTool,
  };
}

export const compactionHaltHookFactory: HookFactory = createCompactionHaltHook;
