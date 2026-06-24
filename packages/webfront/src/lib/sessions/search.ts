import type { Session } from '$lib/api/types.js';

export interface SessionWithPreview {
  lastMessage?: string;
  preview?: string;
}

function normalizeQuery(query: string): string {
  return query.trim().toLowerCase();
}

/** Extract a searchable preview from the session. */
function sessionPreview(session: Session & SessionWithPreview): string {
  const raw = session.lastMessage ?? session.preview;
  if (typeof raw !== 'string') return '';
  return raw.replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Filter sessions by a client-side query over title and last-message preview.
 * The match is case-insensitive; an empty or whitespace-only query returns all
 * sessions unchanged (NH-01).
 */
export function filterSessions(
  sessions: (Session & SessionWithPreview)[],
  query: string
): (Session & SessionWithPreview)[] {
  const needle = normalizeQuery(query);
  if (!needle) return sessions;

  return sessions.filter((session) => {
    const title = session.title?.trim().toLowerCase() ?? '';
    const preview = sessionPreview(session);
    return title.includes(needle) || preview.includes(needle);
  });
}
