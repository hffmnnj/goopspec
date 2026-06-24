import { describe, expect, it } from 'bun:test';
import type { Project, Session } from '$lib/api/types.js';
import {
  buildRecentProjects,
  buildRecentSessions,
  buildShortcutHints,
  describeConnection,
  isOnboarding,
  newSessionTarget,
  type ProjectSession,
} from './home.js';

const NOW = Date.UTC(2026, 5, 24, 12, 0, 0);

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: 'p1',
    worktree: '/home/me/projects/my-app',
    time: { created: 1 },
    ...overrides,
  };
}

function session(overrides: Partial<Session> = {}): Session {
  return {
    id: 's1',
    title: 'My session',
    createdAt: new Date(NOW).toISOString(),
    updatedAt: new Date(NOW).toISOString(),
    ...overrides,
  };
}

describe('buildRecentProjects', () => {
  it('maps opened projects to cards, newest opened first', () => {
    const projects = [
      project({ id: 'a', worktree: '/repo/alpha' }),
      project({ id: 'b', worktree: '/repo/beta' }),
    ];
    const cards = buildRecentProjects(projects, (id) => (id === 'a' ? 0 : 1));
    expect(cards.map((c) => c.id)).toEqual(['b', 'a']);
    expect(cards[1]).toMatchObject({
      id: 'a',
      name: 'alpha',
      path: '/repo/alpha',
      initial: 'A',
      colorIndex: 0,
    });
  });

  it('respects the limit', () => {
    const projects = Array.from({ length: 12 }, (_, i) =>
      project({ id: `p${i}`, worktree: `/repo/p${i}` })
    );
    expect(buildRecentProjects(projects, () => 0, { limit: 4 })).toHaveLength(4);
  });

  it('includes a session count when a resolver is provided', () => {
    const cards = buildRecentProjects([project({ id: 'a' })], () => 0, {
      sessionCountFor: (id) => (id === 'a' ? 3 : undefined),
    });
    expect(cards[0].sessionCount).toBe(3);
  });

  it('falls back to "Untitled project" for a root worktree', () => {
    const cards = buildRecentProjects([project({ id: 'a', worktree: '/' })], () => 0);
    expect(cards[0].name).toBe('Untitled project');
    expect(cards[0].initial).toBe('?');
  });

  it('returns an empty list for no opened projects', () => {
    expect(buildRecentProjects([], () => 0)).toEqual([]);
  });
});

describe('isOnboarding', () => {
  it('is true only when there are no opened projects', () => {
    expect(isOnboarding([])).toBe(true);
    expect(isOnboarding([project()])).toBe(false);
  });
});

describe('buildRecentSessions', () => {
  it('sorts across projects by updatedAt descending and caps at limit', () => {
    const alpha = project({ id: 'a', worktree: '/repo/alpha' });
    const beta = project({ id: 'b', worktree: '/repo/beta' });
    const entries: ProjectSession[] = [
      { session: session({ id: 'old', updatedAt: new Date(NOW - 86_400_000).toISOString() }), project: alpha },
      { session: session({ id: 'new', updatedAt: new Date(NOW - 60_000).toISOString() }), project: beta },
      { session: session({ id: 'mid', updatedAt: new Date(NOW - 3_600_000).toISOString() }), project: alpha },
    ];
    const rows = buildRecentSessions(entries, { now: NOW, limit: 2 });
    expect(rows.map((r) => r.id)).toEqual(['new', 'mid']);
    expect(rows[0]).toMatchObject({ projectName: 'beta', updatedLabel: '1m' });
  });

  it('falls back to "Untitled session" when a title is blank', () => {
    const rows = buildRecentSessions(
      [{ session: session({ title: '   ' }), project: project() }],
      { now: NOW }
    );
    expect(rows[0].title).toBe('Untitled session');
  });

  it('returns an empty list when there are no sessions', () => {
    expect(buildRecentSessions([], { now: NOW })).toEqual([]);
  });
});

describe('describeConnection', () => {
  it('reports connected with the server url and no hint', () => {
    const d = describeConnection('connected', 'http://localhost:4096');
    expect(d.connected).toBe(true);
    expect(d.label).toContain('http://localhost:4096');
    expect(d.hint).toBeNull();
  });

  it('offers a start-server hint when disconnected', () => {
    const d = describeConnection('disconnected', 'http://localhost:4096');
    expect(d.connected).toBe(false);
    expect(d.hint).toBeTruthy();
  });

  it('reports connecting and error states as not connected', () => {
    expect(describeConnection('connecting', 'x').connected).toBe(false);
    expect(describeConnection('error', 'x').connected).toBe(false);
    expect(describeConnection('error', 'x').hint).toBeTruthy();
  });
});

describe('newSessionTarget', () => {
  it('prefers the active project', () => {
    const active = project({ id: 'a' });
    expect(newSessionTarget(active, [project({ id: 'b' }), active])).toBe(active);
  });

  it('falls back to the most recently opened project', () => {
    const last = project({ id: 'z' });
    expect(newSessionTarget(null, [project({ id: 'a' }), last])).toBe(last);
  });

  it('returns null when nothing is opened', () => {
    expect(newSessionTarget(null, [])).toBeNull();
  });
});

describe('buildShortcutHints', () => {
  const shortcuts = [
    { id: 'command-palette', keys: ['mod+k'], description: 'Open command palette' },
    { id: 'new-session', keys: ['mod+n'], description: 'New session' },
    { id: 'keyboard-help', keys: ['mod+/'], description: 'Show keyboard shortcuts' },
  ];
  const format = (combo: string) => combo.toUpperCase();

  it('builds hints in the requested order', () => {
    const hints = buildShortcutHints(shortcuts, format);
    expect(hints.map((h) => h.combo)).toEqual(['MOD+K', 'MOD+N', 'MOD+/']);
    expect(hints[0].description).toBe('Open command palette');
  });

  it('skips ids that are not registered', () => {
    const hints = buildShortcutHints(shortcuts, format, ['missing', 'new-session']);
    expect(hints).toHaveLength(1);
    expect(hints[0].description).toBe('New session');
  });

  it('skips shortcuts without a key binding', () => {
    const hints = buildShortcutHints(
      [{ id: 'x', keys: [], description: 'No keys' }],
      format,
      ['x']
    );
    expect(hints).toEqual([]);
  });
});
