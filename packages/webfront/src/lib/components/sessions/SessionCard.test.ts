import { describe, expect, it } from 'bun:test';
import type { Session } from '$lib/api/types.js';
import {
  relativeTime,
  absoluteTime,
  sessionTitle,
  cardClass,
  ariaCurrent,
  sessionMeta,
  formatCount,
  formatCost,
  previewText,
  resolveRename,
  type SessionWithPreview,
} from './session-card.js';

const NOW = Date.UTC(2026, 5, 24, 12, 0, 0); // 2026-06-24T12:00:00Z

function session(overrides: Partial<Session & SessionWithPreview> = {}): Session & SessionWithPreview {
  return {
    id: 's1',
    title: 'My session',
    createdAt: new Date(NOW).toISOString(),
    updatedAt: new Date(NOW).toISOString(),
    ...overrides,
  };
}

describe('relativeTime', () => {
  it('reports "now" for very recent and future timestamps', () => {
    expect(relativeTime(NOW, NOW)).toBe('now');
    expect(relativeTime(NOW + 5000, NOW)).toBe('now');
    expect(relativeTime(NOW - 10_000, NOW)).toBe('now');
  });

  it('reports minutes, hours, days, and weeks', () => {
    expect(relativeTime(NOW - 5 * 60_000, NOW)).toBe('5m');
    expect(relativeTime(NOW - 2 * 3_600_000, NOW)).toBe('2h');
    expect(relativeTime(NOW - 3 * 86_400_000, NOW)).toBe('3d');
    expect(relativeTime(NOW - 2 * 7 * 86_400_000, NOW)).toBe('2w');
  });

  it('falls back to an absolute date for old timestamps', () => {
    const old = NOW - 60 * 86_400_000;
    const out = relativeTime(old, NOW);
    expect(out).not.toMatch(/^\d+[mhdw]$/);
    expect(out.length).toBeGreaterThan(0);
  });

  it('accepts ISO strings and Date objects', () => {
    expect(relativeTime(new Date(NOW - 3_600_000).toISOString(), NOW)).toBe('1h');
    expect(relativeTime(new Date(NOW - 3_600_000), NOW)).toBe('1h');
  });

  it('returns empty for invalid input', () => {
    expect(relativeTime('not-a-date', NOW)).toBe('');
  });
});

describe('absoluteTime', () => {
  it('formats a valid timestamp and empties on invalid input', () => {
    expect(absoluteTime(NOW).length).toBeGreaterThan(0);
    expect(absoluteTime('nope')).toBe('');
  });
});

describe('sessionTitle', () => {
  it('uses the title when present', () => {
    expect(sessionTitle({ title: 'Hello' })).toBe('Hello');
  });

  it('falls back for empty or whitespace titles', () => {
    expect(sessionTitle({ title: '' })).toBe('Untitled session');
    expect(sessionTitle({ title: '   ' })).toBe('Untitled session');
  });
});

describe('active-state helpers', () => {
  it('cardClass adds the active modifier only when active', () => {
    expect(cardClass(false)).toBe('session-card');
    expect(cardClass(true)).toBe('session-card session-card--active');
  });

  it('ariaCurrent is "true" when active, undefined otherwise', () => {
    expect(ariaCurrent(true)).toBe('true');
    expect(ariaCurrent(false)).toBeUndefined();
  });
});

describe('sessionMeta', () => {
  it('hides chips when metadata is absent or zero', () => {
    const m = sessionMeta(session({ messageCount: undefined, cost: undefined }));
    expect(m.hasMessages).toBe(false);
    expect(m.hasCost).toBe(false);
    const zero = sessionMeta(session({ messageCount: 0, cost: 0 }));
    expect(zero.hasMessages).toBe(false);
    expect(zero.hasCost).toBe(false);
  });

  it('formats message count and cost when present', () => {
    const m = sessionMeta(session({ messageCount: 12, cost: 0.0421 }));
    expect(m.hasMessages).toBe(true);
    expect(m.messages).toBe('12');
    expect(m.hasCost).toBe(true);
    expect(m.cost).toBe('$0.042');
  });
});

describe('formatCount', () => {
  it('formats plain, thousands, and millions', () => {
    expect(formatCount(42)).toBe('42');
    expect(formatCount(1200)).toBe('1.2k');
    expect(formatCount(1000)).toBe('1k');
    expect(formatCount(2_500_000)).toBe('2.5M');
  });
});

describe('formatCost', () => {
  it('keeps precision for sub-cent values', () => {
    expect(formatCost(0.0042)).toBe('$0.0042');
    expect(formatCost(0.042)).toBe('$0.042');
    expect(formatCost(0.5)).toBe('$0.500');
    expect(formatCost(12.5)).toBe('$12.50');
  });

  it('returns empty for non-positive cost', () => {
    expect(formatCost(0)).toBe('');
    expect(formatCost(-1)).toBe('');
  });
});

describe('previewText', () => {
  it('returns empty when no preview is available (graceful seam)', () => {
    expect(previewText(session())).toBe('');
  });

  it('collapses whitespace and reads lastMessage/preview', () => {
    expect(previewText(session({ lastMessage: '  hello\n  world  ' }))).toBe('hello world');
    expect(previewText(session({ preview: 'fallback field' }))).toBe('fallback field');
  });

  it('truncates long previews with an ellipsis', () => {
    const long = 'a'.repeat(200);
    const out = previewText(session({ lastMessage: long }), 50);
    expect(out.length).toBe(50);
    expect(out.endsWith('…')).toBe(true);
  });
});

describe('resolveRename', () => {
  it('returns the trimmed value when it is a real change', () => {
    expect(resolveRename('  New name  ', 'Old')).toBe('New name');
  });

  it('returns null for empty or unchanged drafts', () => {
    expect(resolveRename('', 'Old')).toBeNull();
    expect(resolveRename('   ', 'Old')).toBeNull();
    expect(resolveRename('Old', 'Old')).toBeNull();
    expect(resolveRename('  Old  ', 'Old')).toBeNull();
  });
});
