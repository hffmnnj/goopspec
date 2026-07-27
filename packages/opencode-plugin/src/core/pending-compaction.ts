/**
 * Shared, lazy pending-compaction expiry helpers.
 *
 * These predicates live in a neutral leaf module so that tools and hooks can
 * share a single definition without creating import cycles.
 */

import { PENDING_COMPACTION_TTL_MS } from "./constants.js";
import type { PendingCompactionRequest, PluginContext } from "./types.js";

/**
 * Determine whether a pending compaction request has exceeded its TTL.
 *
 * Expiry is measured from `queuedAtMs` regardless of current status.
 */
export function isPendingCompactionExpired(
  pending: PendingCompactionRequest,
  nowMs = Date.now(),
): boolean {
  return nowMs - pending.queuedAtMs > PENDING_COMPACTION_TTL_MS;
}

/**
 * Return a live pending compaction request, or clear an expired one.
 *
 * If the requested entry is expired it is removed from both
 * `pendingCompactions` and `compactionHandoff` for that session. In addition,
 * every access opportunistically reclaims other sessions' expired entries so
 * map growth stays bounded when `session.compacted` / `session.error` /
 * `session.deleted` signals are lost. Reclamation is purely access-driven — no
 * timers, no background sweep.
 */
export function getLivePendingCompaction(
  ctx: PluginContext,
  sessionID: string,
  nowMs = Date.now(),
): PendingCompactionRequest | undefined {
  // Opportunistic cross-session reclamation: every access drops other
  // sessions' expired entries, keeping growth bounded without timers.
  const expiredSessionIDs: string[] = [];
  for (const [id, pending] of ctx.pendingCompactions) {
    if (isPendingCompactionExpired(pending, nowMs)) {
      expiredSessionIDs.push(id);
    }
  }

  for (const id of expiredSessionIDs) {
    ctx.pendingCompactions.delete(id);
    ctx.compactionHandoff.delete(id);
  }

  const pending = ctx.pendingCompactions.get(sessionID);
  if (pending == null) return undefined;

  if (isPendingCompactionExpired(pending, nowMs)) {
    ctx.pendingCompactions.delete(sessionID);
    ctx.compactionHandoff.delete(sessionID);
    return undefined;
  }

  return pending;
}

/**
 * Render a short human-readable description of a pending compaction.
 *
 * Includes the status and age, e.g. "queued 42s ago" or
 * "in-flight 3m 12s ago".
 */
export function describePendingCompaction(
  pending: PendingCompactionRequest,
  nowMs = Date.now(),
): string {
  const ageMs = nowMs - pending.queuedAtMs;
  const ageText = formatDuration(ageMs);
  return `${pending.status} ${ageText} ago`;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) {
    return `${seconds}s`;
  }

  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}
