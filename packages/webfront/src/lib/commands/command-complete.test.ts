import { describe, it, expect } from 'bun:test';
import {
  detectCommandTrigger,
  filterCommands,
  commandTakesArguments,
  completeCommand,
  parseCommandInput,
} from './command-complete.js';
import type { SlashCommand } from '../api/types.js';

const cmds: SlashCommand[] = [
  { name: 'help', description: 'Show help' },
  { name: 'compact', description: 'Compact the conversation' },
  { name: 'commit', description: 'Create a git commit', template: 'commit $ARGUMENTS' },
  { name: 'clear', description: 'Clear the session' },
];

describe('detectCommandTrigger', () => {
  it('opens on a leading slash at cursor 1', () => {
    expect(detectCommandTrigger('/', 1)).toEqual({ query: '', start: 0 });
  });

  it('captures the query after the slash up to the cursor', () => {
    expect(detectCommandTrigger('/hel', 4)).toEqual({ query: 'hel', start: 0 });
  });

  it('does not open when the slash is not first', () => {
    expect(detectCommandTrigger('hi /help', 8)).toBeNull();
  });

  it('closes once a space is typed (arguments mode)', () => {
    expect(detectCommandTrigger('/help me', 8)).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(detectCommandTrigger('', 0)).toBeNull();
  });

  it('does not trigger on @-file mentions (coexistence)', () => {
    expect(detectCommandTrigger('@src/app.ts', 11)).toBeNull();
    expect(detectCommandTrigger('look at @file', 13)).toBeNull();
  });

  it('closes when the slash is deleted', () => {
    // After deleting the leading slash, the value no longer starts with "/".
    expect(detectCommandTrigger('help', 4)).toBeNull();
  });

  it('uses the cursor, not the whole value, for the query', () => {
    // Cursor after "/he" even though more text follows.
    expect(detectCommandTrigger('/help', 3)).toEqual({ query: 'he', start: 0 });
  });
});

describe('filterCommands', () => {
  it('returns all commands alphabetically for an empty query', () => {
    expect(filterCommands(cmds, '').map((c) => c.name)).toEqual(['clear', 'commit', 'compact', 'help']);
  });

  it('ranks exact match first', () => {
    const out = filterCommands(cmds, 'commit');
    expect(out[0].name).toBe('commit');
  });

  it('prefers prefix matches over substring matches', () => {
    const out = filterCommands(cmds, 'c');
    // All of clear/commit/compact are prefix matches; help is excluded.
    expect(out.map((c) => c.name)).not.toContain('help');
    expect(out[0].name).toBe('clear'); // shortest among c-prefixed
  });

  it('is case-insensitive', () => {
    expect(filterCommands(cmds, 'HELP').map((c) => c.name)).toEqual(['help']);
  });

  it('falls back to description substring matches', () => {
    const out = filterCommands(cmds, 'git');
    expect(out.map((c) => c.name)).toEqual(['commit']);
  });

  it('returns nothing when no command matches', () => {
    expect(filterCommands(cmds, 'zzz')).toEqual([]);
  });
});

describe('commandTakesArguments', () => {
  it('detects $ARGUMENTS placeholder', () => {
    expect(commandTakesArguments({ name: 'commit', template: 'commit $ARGUMENTS' })).toBe(true);
  });

  it('detects positional placeholders', () => {
    expect(commandTakesArguments({ name: 'x', template: 'do $1' })).toBe(true);
  });

  it('returns false for templates without placeholders', () => {
    expect(commandTakesArguments({ name: 'help', template: 'show help' })).toBe(false);
  });

  it('returns false when there is no template', () => {
    expect(commandTakesArguments({ name: 'help' })).toBe(false);
  });
});

describe('completeCommand', () => {
  it('completes the command with a trailing space and end cursor', () => {
    const out = completeCommand('/he', { name: 'help' });
    expect(out.value).toBe('/help ');
    expect(out.cursor).toBe('/help '.length);
  });

  it('preserves already-typed arguments after the first space', () => {
    const out = completeCommand('/co make it tighter', { name: 'commit' });
    expect(out.value).toBe('/commit make it tighter');
    expect(out.cursor).toBe('/commit '.length);
  });

  it('replaces the whole token when no arguments are present', () => {
    const out = completeCommand('/cl', { name: 'clear' });
    expect(out.value).toBe('/clear ');
  });
});

describe('parseCommandInput', () => {
  it('parses a known command with arguments', () => {
    expect(parseCommandInput('/commit tighten copy', cmds)).toEqual({
      command: 'commit',
      arguments: 'tighten copy',
    });
  });

  it('parses a known command without arguments', () => {
    expect(parseCommandInput('/help', cmds)).toEqual({ command: 'help', arguments: '' });
  });

  it('returns null for unknown commands', () => {
    expect(parseCommandInput('/nope', cmds)).toBeNull();
  });

  it('returns null for plain text', () => {
    expect(parseCommandInput('hello there', cmds)).toBeNull();
  });

  it('returns null for a bare slash', () => {
    expect(parseCommandInput('/', cmds)).toBeNull();
  });
});
