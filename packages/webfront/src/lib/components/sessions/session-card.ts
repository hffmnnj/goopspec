/**
 * Session-card presentation logic (T5.1).
 *
 * Pure, DOM-free helpers that drive `<SessionCard>` / `<SessionSidebar>`:
 * relative-time formatting, active-state class derivation, metadata
 * formatting (message count + cost), title display, and rename-edit state
 * transitions. Keeping this logic here (the same split as `tool-card.ts`
 * vs `ToolCard.svelte`) makes the behavior unit-testable without a Svelte
 * renderer.
 */
import type { Session } from '$lib/api/types.js';

/* ---------------------------------------------------------------------------
 * Relative time
 * ------------------------------------------------------------------------- */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/**
 * Format an ISO timestamp (or epoch ms) as a compact relative string:
 * "now", "5m", "2h", "3d", "2w", then an absolute short date for older.
 *
 * `now` is injectable so the helper is deterministic under test.
 */
export function relativeTime(value: string | number | Date, now: number = Date.now()): string {
  const then = toMillis(value);
  if (then == null) return '';

  // Clock skew / future timestamps read as "now" rather than negatives.
  const diff = now - then;
  if (diff < 45 * 1000) return 'now';
  if (diff < HOUR) return `${Math.round(diff / MINUTE)}m`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h`;
  if (diff < WEEK) return `${Math.floor(diff / DAY)}d`;
  if (diff < 4 * WEEK) return `${Math.floor(diff / WEEK)}w`;

  // Older than a month → short absolute date (e.g. "Mar 4" or "Mar 4, 2024").
  const date = new Date(then);
  const sameYear = new Date(now).getFullYear() === date.getFullYear();
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

/** A full, human-readable timestamp for tooltips / `title` / `datetime`. */
export function absoluteTime(value: string | number | Date): string {
  const ms = toMillis(value);
  if (ms == null) return '';
  return new Date(ms).toLocaleString();
}

function toMillis(value: string | number | Date): number | null {
  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isNaN(t) ? null : t;
  }
  if (typeof value === 'number') return Number.isNaN(value) ? null : value;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : t;
}

/* ---------------------------------------------------------------------------
 * Title
 * ------------------------------------------------------------------------- */

/** Display title for a session, with a stable fallback for untitled ones. */
export function sessionTitle(session: Pick<Session, 'title'>): string {
  const title = session.title?.trim();
  return title && title.length > 0 ? title : 'Untitled session';
}

/* ---------------------------------------------------------------------------
 * Active state
 * ------------------------------------------------------------------------- */

/**
 * Class list for a session card given its active state. Returned as a single
 * string so the component can bind it directly; `active` adds the accent
 * treatment used for `aria-current` cards.
 */
export function cardClass(active: boolean): string {
  return active ? 'session-card session-card--active' : 'session-card';
}

/** The `aria-current` value for a card — `'true'` when active, else undefined. */
export function ariaCurrent(active: boolean): 'true' | undefined {
  return active ? 'true' : undefined;
}

/* ---------------------------------------------------------------------------
 * Metadata (message count + cost)
 * ------------------------------------------------------------------------- */

export interface SessionMeta {
  /** Whether the message-count chip should render. */
  hasMessages: boolean;
  /** Formatted message count, e.g. "12". Empty when absent. */
  messages: string;
  /** Whether the cost chip should render. */
  hasCost: boolean;
  /** Formatted cost, e.g. "$0.0421". Empty when absent. */
  cost: string;
}

/** Format the metadata row (message count + cost) for a session. */
export function sessionMeta(session: Pick<Session, 'messageCount' | 'cost'>): SessionMeta {
  const count = session.messageCount;
  const cost = session.cost;

  const hasMessages = typeof count === 'number' && count > 0;
  const hasCost = typeof cost === 'number' && cost > 0;

  return {
    hasMessages,
    messages: hasMessages ? formatCount(count as number) : '',
    hasCost,
    cost: hasCost ? formatCost(cost as number) : '',
  };
}

/** Compact integer formatting (1234 → "1.2k"). */
export function formatCount(n: number): string {
  if (!Number.isFinite(n)) return '0';
  const abs = Math.abs(n);
  if (abs < 1000) return String(Math.round(n));
  if (abs < 1_000_000) return `${trimZero(n / 1000)}k`;
  return `${trimZero(n / 1_000_000)}M`;
}

/**
 * Format a cost (USD). Small values keep more precision so sub-cent runs are
 * still legible; larger values use two decimals.
 */
export function formatCost(cost: number): string {
  if (!Number.isFinite(cost) || cost <= 0) return '';
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  if (cost < 1) return `$${cost.toFixed(3)}`;
  return `$${cost.toFixed(2)}`;
}

function trimZero(n: number): string {
  // 1.0 → "1", 1.2 → "1.2"
  return n.toFixed(1).replace(/\.0$/, '');
}

/* ---------------------------------------------------------------------------
 * Last-message preview (seam for T5.2)
 * ------------------------------------------------------------------------- */

/**
 * A session may carry an optional last-message preview in a future iteration
 * (T5.2 wiring). The `Session` type does not yet expose it, so we read it
 * defensively from an extended shape and gracefully omit when absent.
 */
export interface SessionWithPreview {
  lastMessage?: string;
  preview?: string;
}

/** Extract a single-line preview snippet, or empty string when unavailable. */
export function previewText(session: Session & SessionWithPreview, limit = 120): string {
  const raw = session.lastMessage ?? session.preview;
  if (typeof raw !== 'string') return '';
  const oneLine = raw.replace(/\s+/g, ' ').trim();
  if (oneLine.length === 0) return '';
  return oneLine.length > limit ? `${oneLine.slice(0, limit - 1)}…` : oneLine;
}

/* ---------------------------------------------------------------------------
 * Rename editing
 * ------------------------------------------------------------------------- */

/**
 * Resolve a rename commit: trims the draft and decides whether it represents
 * a real change worth persisting. Returns the value to commit, or `null` when
 * the edit should be discarded (empty or unchanged).
 */
export function resolveRename(draft: string, current: string): string | null {
  const next = draft.trim();
  if (next.length === 0) return null;
  if (next === current.trim()) return null;
  return next;
}
