// Pure, DOM-free helpers for <ProjectPopover>: the most-recent-session slice
// and a tiny per-project session cache so repeated hovers don't refetch.
import type { Session } from '$lib/api/types.js';
import { projectName } from './project-rail.js';

/** Default number of recent sessions shown in the popover. */
export const RECENT_SESSION_LIMIT = 5;

/** Display name for the popover header: the worktree's last segment. */
export function popoverProjectName(worktree: string | null | undefined): string {
  return projectName(worktree) || 'Untitled project';
}

/** Sort sessions newest-first and take the top `limit`. */
export function recentSessions(sessions: Session[], limit = RECENT_SESSION_LIMIT): Session[] {
  return [...sessions]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, limit);
}

type Fetcher = (worktree: string) => Promise<Session[]>;

/**
 * Caches recent-session lists per project worktree. A hover triggers at most
 * one fetch per worktree; concurrent hovers share the in-flight promise.
 */
export class ProjectSessionCache {
  private readonly resolved = new Map<string, Session[]>();
  private readonly inflight = new Map<string, Promise<Session[]>>();

  constructor(private readonly fetcher: Fetcher) {}

  /** Cached sessions for a worktree, or undefined when not yet fetched. */
  peek(worktree: string): Session[] | undefined {
    return this.resolved.get(worktree);
  }

  /** Fetch (or return the cached/in-flight) recent sessions for a worktree. */
  async get(worktree: string): Promise<Session[]> {
    const cached = this.resolved.get(worktree);
    if (cached) return cached;

    const pending = this.inflight.get(worktree);
    if (pending) return pending;

    const promise = this.fetcher(worktree)
      .then((sessions) => {
        const recent = recentSessions(sessions);
        this.resolved.set(worktree, recent);
        this.inflight.delete(worktree);
        return recent;
      })
      .catch((err) => {
        this.inflight.delete(worktree);
        throw err;
      });

    this.inflight.set(worktree, promise);
    return promise;
  }

  /** Drop the cached list for a worktree (e.g. after the project closes). */
  invalidate(worktree: string): void {
    this.resolved.delete(worktree);
    this.inflight.delete(worktree);
  }
}

/** Whether a session is the one currently open (active). */
export function isActiveSession(
  session: Pick<Session, 'id'>,
  activeId: string | null | undefined
): boolean {
  return activeId != null && session.id === activeId;
}

/**
 * A short, one-line, muted hint shown under a session's title in the popover.
 * The `Session` shape carries no summary field, so we derive a useful hint from
 * the data we do have: a sub-session marker plus a compact message count.
 * Returns an empty string when there's nothing meaningful to show.
 */
export function sessionHint(
  session: Pick<Session, 'parentID' | 'messageCount'>
): string {
  const parts: string[] = [];
  if (session.parentID) parts.push('Sub-session');

  const count = session.messageCount;
  if (typeof count === 'number' && count > 0) {
    parts.push(`${count} ${count === 1 ? 'message' : 'messages'}`);
  }

  return parts.join(' · ');
}
