import { describe, expect, it } from 'bun:test';
import type { Session } from '$lib/api/types.js';
import { filterSessions, type SessionWithPreview } from './search.js';

function session(overrides: Partial<Session & SessionWithPreview> = {}): Session & SessionWithPreview {
  return {
    id: 's1',
    title: 'My session',
    createdAt: '2026-06-23T00:00:00.000Z',
    updatedAt: '2026-06-23T00:00:00.000Z',
    ...overrides,
  };
}

describe('filterSessions', () => {
  it('returns all sessions when the query is empty or whitespace', () => {
    const sessions = [session({ id: 'a' }), session({ id: 'b' })];
    expect(filterSessions(sessions, '')).toEqual(sessions);
    expect(filterSessions(sessions, '   ')).toEqual(sessions);
  });

  it('matches session titles case-insensitively', () => {
    const sessions = [
      session({ id: 'a', title: 'Hello World' }),
      session({ id: 'b', title: 'Other chat' }),
    ];
    expect(filterSessions(sessions, 'hello').map((s) => s.id)).toEqual(['a']);
    expect(filterSessions(sessions, 'HELLO').map((s) => s.id)).toEqual(['a']);
    expect(filterSessions(sessions, 'oThEr').map((s) => s.id)).toEqual(['b']);
  });

  it('matches the last-message preview case-insensitively', () => {
    const sessions = [
      session({ id: 'a', title: 'One', lastMessage: 'I need help with CSS' }),
      session({ id: 'b', title: 'Two', preview: 'Debugging a Svelte store' }),
    ];
    expect(filterSessions(sessions, 'CSS').map((s) => s.id)).toEqual(['a']);
    expect(filterSessions(sessions, 'SVELTE').map((s) => s.id)).toEqual(['b']);
    expect(filterSessions(sessions, 'help').map((s) => s.id)).toEqual(['a']);
  });

  it('matches either title or preview for the same query', () => {
    const sessions = [
      session({ id: 'a', title: 'Frontend bugs', lastMessage: 'hello' }),
      session({ id: 'b', title: 'Notes', preview: 'Frontend bugs are tricky' }),
      session({ id: 'c', title: 'Backend' }),
    ];
    expect(filterSessions(sessions, 'frontend').map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('returns an empty array when nothing matches', () => {
    const sessions = [session({ id: 'a', title: 'One' }), session({ id: 'b', title: 'Two' })];
    expect(filterSessions(sessions, 'three')).toEqual([]);
  });

  it('collapses whitespace in previews before matching', () => {
    const sessions = [
      session({ id: 'a', title: 'One', preview: '  hello\n  world  ' }),
    ];
    expect(filterSessions(sessions, 'hello world').map((s) => s.id)).toEqual(['a']);
  });
});
