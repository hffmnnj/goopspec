import { describe, expect, it } from 'bun:test';
import {
  CommandRegistry,
  fuzzyMatch,
  searchCommands,
  type Command,
} from './registry.js';

function command(overrides: Partial<Command> = {}): Command {
  return {
    id: overrides.id ?? 'cmd',
    title: overrides.title ?? 'Command',
    category: overrides.category ?? 'General',
    keywords: overrides.keywords,
    keys: overrides.keys,
    subtitle: overrides.subtitle,
    icon: overrides.icon,
    run: overrides.run ?? (() => {}),
  };
}

describe('fuzzyMatch', () => {
  it('returns a positive score for an empty query (matches everything)', () => {
    expect(fuzzyMatch('', command({ title: 'Anything' }))).toBeGreaterThan(0);
  });

  it('ranks exact > prefix > contains > subsequence > no match', () => {
    const c = command({ title: 'New session' });

    const exact = fuzzyMatch('new session', c);
    const prefix = fuzzyMatch('new', c);
    const contains = fuzzyMatch('session', c);
    const subsequence = fuzzyMatch('nss', c); // n..s..s subsequence
    const none = fuzzyMatch('xyz', c);

    expect(exact).toBeGreaterThan(prefix);
    expect(prefix).toBeGreaterThan(contains);
    expect(contains).toBeGreaterThan(subsequence);
    expect(subsequence).toBeGreaterThan(0);
    expect(none).toBe(0);
  });

  it('is case-insensitive', () => {
    const c = command({ title: 'Toggle Theme' });
    expect(fuzzyMatch('TOGGLE', c)).toBe(fuzzyMatch('toggle', c));
  });

  it('matches against keywords but never above a title hit', () => {
    const c = command({ title: 'Clear conversation', keywords: ['reset', 'wipe'] });

    const keywordHit = fuzzyMatch('reset', c);
    const titleHit = fuzzyMatch('clear', c);

    expect(keywordHit).toBeGreaterThan(0);
    expect(titleHit).toBeGreaterThan(keywordHit);
  });

  it('returns 0 when neither title nor keywords match', () => {
    const c = command({ title: 'Open settings', keywords: ['preferences'] });
    expect(fuzzyMatch('zzzz', c)).toBe(0);
  });

  it('rewards a prefix that covers more of the title', () => {
    const longer = command({ title: 'New' });
    const shorter = command({ title: 'New session and more' });
    expect(fuzzyMatch('new', longer)).toBeGreaterThan(fuzzyMatch('new', shorter));
  });

  it('supports multi-word subsequence queries', () => {
    const c = command({ title: 'New session' });
    expect(fuzzyMatch('new ses', c)).toBeGreaterThan(0);
  });
});

describe('searchCommands', () => {
  const commands: Command[] = [
    command({ id: 'a', title: 'New session', keywords: ['create'] }),
    command({ id: 'b', title: 'Delete current session' }),
    command({ id: 'c', title: 'Clear conversation', keywords: ['reset'] }),
    command({ id: 'd', title: 'Open settings' }),
  ];

  it('returns all commands for an empty query in original order', () => {
    const result = searchCommands('', commands);
    expect(result.map((c) => c.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('returns all commands for a whitespace-only query', () => {
    expect(searchCommands('   ', commands)).toHaveLength(commands.length);
  });

  it('filters out non-matching commands', () => {
    const result = searchCommands('session', commands);
    const ids = result.map((c) => c.id);
    expect(ids).toContain('a');
    expect(ids).toContain('b');
    expect(ids).not.toContain('d');
  });

  it('sorts results by descending score', () => {
    const result = searchCommands('session', commands);
    // "New session" / "Delete current session" both contain "session"; both rank
    // above anything that only matches by subsequence.
    expect(result[0].id === 'a' || result[0].id === 'b').toBe(true);
  });

  it('matches by keyword', () => {
    const result = searchCommands('reset', commands);
    expect(result.map((c) => c.id)).toContain('c');
  });

  it('is a stable, pure function (does not mutate input)', () => {
    const input = [...commands];
    searchCommands('open', input);
    expect(input.map((c) => c.id)).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('CommandRegistry', () => {
  it('registers and returns static commands in insertion order', () => {
    const registry = new CommandRegistry();
    registry.register(command({ id: 'one', title: 'One' }));
    registry.register(command({ id: 'two', title: 'Two' }));

    expect(registry.getCommands().map((c) => c.id)).toEqual(['one', 'two']);
  });

  it('replaces a command when re-registered with the same id', () => {
    const registry = new CommandRegistry();
    registry.register(command({ id: 'x', title: 'First' }));
    registry.register(command({ id: 'x', title: 'Second' }));

    const all = registry.getCommands();
    expect(all).toHaveLength(1);
    expect(all[0].title).toBe('Second');
  });

  it('unregisters a command', () => {
    const registry = new CommandRegistry();
    registry.register(command({ id: 'gone', title: 'Gone' }));
    registry.unregister('gone');
    expect(registry.getCommands()).toHaveLength(0);
  });

  it('appends dynamic provider commands after static ones', () => {
    const registry = new CommandRegistry();
    registry.register(command({ id: 'static', title: 'Static' }));
    registry.registerProvider('dyn', () => [
      command({ id: 'dyn-1', title: 'Dynamic 1' }),
      command({ id: 'dyn-2', title: 'Dynamic 2' }),
    ]);

    expect(registry.getCommands().map((c) => c.id)).toEqual([
      'static',
      'dyn-1',
      'dyn-2',
    ]);
  });

  it('re-evaluates providers on each call (reflects live state)', () => {
    const registry = new CommandRegistry();
    let items = ['s1'];
    registry.registerProvider('sessions', () =>
      items.map((id) => command({ id: `session:${id}`, title: `Switch to ${id}` }))
    );

    expect(registry.getCommands()).toHaveLength(1);
    items = ['s1', 's2', 's3'];
    expect(registry.getCommands()).toHaveLength(3);
  });

  it('swallows provider errors so one bad provider cannot break the palette', () => {
    const registry = new CommandRegistry();
    registry.register(command({ id: 'safe', title: 'Safe' }));
    registry.registerProvider('boom', () => {
      throw new Error('provider exploded');
    });

    expect(registry.getCommands().map((c) => c.id)).toEqual(['safe']);
  });

  it('search() filters and sorts through the registry', () => {
    const registry = new CommandRegistry();
    registry.registerAll([
      command({ id: 'a', title: 'New session' }),
      command({ id: 'b', title: 'Open settings' }),
    ]);

    const result = registry.search('settings');
    expect(result.map((c) => c.id)).toEqual(['b']);
  });

  it('clear() removes static commands and providers', () => {
    const registry = new CommandRegistry();
    registry.register(command({ id: 'a', title: 'A' }));
    registry.registerProvider('p', () => [command({ id: 'b', title: 'B' })]);
    registry.clear();
    expect(registry.getCommands()).toHaveLength(0);
  });
});

describe('dynamic session commands', () => {
  // Mirror the shape produced by commands.ts#sessionToCommand without importing
  // the store singletons (which would pull in network clients).
  interface FakeSession {
    id: string;
    title: string;
    updatedAt: string;
  }

  function sessionCommandsFrom(sessions: FakeSession[], activeId: string | null): Command[] {
    return sessions
      .filter((s) => s.id !== activeId)
      .map((s) =>
        command({
          id: `session:${s.id}`,
          title: `Switch to session: ${s.title || 'Untitled session'}`,
          category: 'Sessions',
          keywords: ['open', s.title],
          run: () => {},
        })
      );
  }

  const fakeSessions: FakeSession[] = [
    { id: 's1', title: 'Refactor auth', updatedAt: new Date().toISOString() },
    { id: 's2', title: 'Fix tests', updatedAt: new Date().toISOString() },
    { id: 's3', title: '', updatedAt: new Date().toISOString() },
  ];

  it('generates one command per non-active session', () => {
    const cmds = sessionCommandsFrom(fakeSessions, 's1');
    expect(cmds.map((c) => c.id)).toEqual(['session:s2', 'session:s3']);
  });

  it('includes all sessions when none is active', () => {
    expect(sessionCommandsFrom(fakeSessions, null)).toHaveLength(3);
  });

  it('falls back to "Untitled session" for empty titles', () => {
    const cmds = sessionCommandsFrom(fakeSessions, null);
    const untitled = cmds.find((c) => c.id === 'session:s3');
    expect(untitled?.title).toContain('Untitled session');
  });

  it('session commands are searchable by their title', () => {
    const cmds = sessionCommandsFrom(fakeSessions, null);
    const result = searchCommands('auth', cmds);
    expect(result.map((c) => c.id)).toContain('session:s1');
  });
});
