import { describe, expect, it, mock } from 'bun:test';
import type { Session } from '$lib/api/types.js';
import {
  ProjectSessionCache,
  isActiveSession,
  popoverProjectName,
  recentSessions,
  sessionHint,
  RECENT_SESSION_LIMIT,
} from './project-popover.js';

function session(id: string, updatedAt: string): Session {
  return { id, title: `Session ${id}`, createdAt: updatedAt, updatedAt };
}

describe('popoverProjectName', () => {
  it('uses the last worktree segment', () => {
    expect(popoverProjectName('/home/me/my-app')).toBe('my-app');
  });

  it('falls back for a root or empty worktree', () => {
    expect(popoverProjectName('/')).toBe('Untitled project');
    expect(popoverProjectName('')).toBe('Untitled project');
    expect(popoverProjectName(null)).toBe('Untitled project');
  });
});

describe('isActiveSession', () => {
  it('is true only when the ids match', () => {
    expect(isActiveSession(session('a', '2024-01-01T00:00:00Z'), 'a')).toBe(true);
    expect(isActiveSession(session('a', '2024-01-01T00:00:00Z'), 'b')).toBe(false);
  });

  it('is false for null/undefined active ids', () => {
    expect(isActiveSession(session('a', '2024-01-01T00:00:00Z'), null)).toBe(false);
    expect(isActiveSession(session('a', '2024-01-01T00:00:00Z'), undefined)).toBe(false);
  });
});

describe('sessionHint', () => {
  it('returns empty when there is nothing to show', () => {
    expect(sessionHint({})).toBe('');
    expect(sessionHint({ messageCount: 0 })).toBe('');
  });

  it('marks sub-sessions', () => {
    expect(sessionHint({ parentID: 'p1' })).toBe('Sub-session');
  });

  it('pluralizes the message count', () => {
    expect(sessionHint({ messageCount: 1 })).toBe('1 message');
    expect(sessionHint({ messageCount: 5 })).toBe('5 messages');
  });

  it('joins a sub-session marker with the message count', () => {
    expect(sessionHint({ parentID: 'p1', messageCount: 3 })).toBe('Sub-session · 3 messages');
  });
});

describe('recentSessions', () => {
  it('sorts newest-first and caps at the limit', () => {
    const list = [
      session('a', '2024-01-01T00:00:00Z'),
      session('b', '2024-03-01T00:00:00Z'),
      session('c', '2024-02-01T00:00:00Z'),
    ];
    expect(recentSessions(list).map((s) => s.id)).toEqual(['b', 'c', 'a']);
  });

  it('limits to RECENT_SESSION_LIMIT by default', () => {
    const list = Array.from({ length: 10 }, (_, i) =>
      session(`s${i}`, `2024-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`)
    );
    expect(recentSessions(list)).toHaveLength(RECENT_SESSION_LIMIT);
  });

  it('does not mutate the input array', () => {
    const list = [session('a', '2024-01-01T00:00:00Z'), session('b', '2024-02-01T00:00:00Z')];
    const before = list.map((s) => s.id);
    recentSessions(list);
    expect(list.map((s) => s.id)).toEqual(before);
  });
});

describe('ProjectSessionCache', () => {
  it('fetches recent sessions for a worktree', async () => {
    const fetcher = mock((_w: string) =>
      Promise.resolve([
        session('a', '2024-01-01T00:00:00Z'),
        session('b', '2024-03-01T00:00:00Z'),
      ])
    );
    const cache = new ProjectSessionCache(fetcher);

    const result = await cache.get('/repo/x');

    expect(result.map((s) => s.id)).toEqual(['b', 'a']);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('caches per worktree, fetching at most once', async () => {
    const fetcher = mock((_w: string) => Promise.resolve([session('a', '2024-01-01T00:00:00Z')]));
    const cache = new ProjectSessionCache(fetcher);

    await cache.get('/repo/x');
    await cache.get('/repo/x');

    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('shares an in-flight promise for concurrent requests', async () => {
    let resolveFn: (s: Session[]) => void = () => undefined;
    const fetcher = mock(
      (_w: string) =>
        new Promise<Session[]>((resolve) => {
          resolveFn = resolve;
        })
    );
    const cache = new ProjectSessionCache(fetcher);

    const p1 = cache.get('/repo/x');
    const p2 = cache.get('/repo/x');
    resolveFn([session('a', '2024-01-01T00:00:00Z')]);
    await Promise.all([p1, p2]);

    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('peek returns undefined before fetch and the list after', async () => {
    const fetcher = mock((_w: string) => Promise.resolve([session('a', '2024-01-01T00:00:00Z')]));
    const cache = new ProjectSessionCache(fetcher);

    expect(cache.peek('/repo/x')).toBeUndefined();
    await cache.get('/repo/x');
    expect(cache.peek('/repo/x')?.map((s) => s.id)).toEqual(['a']);
  });

  it('does not cache a failed fetch so a later hover can retry', async () => {
    let attempt = 0;
    const fetcher = mock((_w: string) => {
      attempt += 1;
      return attempt === 1
        ? Promise.reject(new Error('boom'))
        : Promise.resolve([session('a', '2024-01-01T00:00:00Z')]);
    });
    const cache = new ProjectSessionCache(fetcher);

    await expect(cache.get('/repo/x')).rejects.toThrow('boom');
    const retried = await cache.get('/repo/x');

    expect(retried.map((s) => s.id)).toEqual(['a']);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('invalidate drops a cached worktree', async () => {
    const fetcher = mock((_w: string) => Promise.resolve([session('a', '2024-01-01T00:00:00Z')]));
    const cache = new ProjectSessionCache(fetcher);

    await cache.get('/repo/x');
    cache.invalidate('/repo/x');
    await cache.get('/repo/x');

    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
