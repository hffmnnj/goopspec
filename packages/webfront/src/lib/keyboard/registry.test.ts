import { beforeEach, describe, expect, it } from 'bun:test';
import { KeyboardRegistry, formatCombo, keyboardEvent } from './registry.js';

function event(
  key: string,
  modifiers: Partial<KeyboardEvent> = {}
): KeyboardEvent {
  return keyboardEvent({ key, ...modifiers });
}

function preventable(
  key: string,
  modifiers: Partial<KeyboardEvent> = {}
): KeyboardEvent {
  const calls: string[] = [];
  const e = keyboardEvent({
    key,
    ...modifiers,
    preventDefault: () => {
      calls.push('preventDefault');
    },
  });
  return Object.assign(e, { _calls: calls }) as KeyboardEvent & { _calls: string[] };
}

describe('KeyboardRegistry', () => {
  let registry: KeyboardRegistry;

  beforeEach(() => {
    registry = new KeyboardRegistry();
  });

  it('matches a simple mod combo on macOS', async () => {
    let calls = 0;
    registry.register({
      id: 'open-palette',
      keys: ['cmd+k'],
      description: 'Open palette',
      category: 'General',
      handler: () => {
        calls += 1;
        return true;
      },
    });

    const macEvent = event('k', { metaKey: true });
    const result = await registry.handle(macEvent);

    expect(result?.combo).toBe('cmd+k');
    expect(calls).toBe(1);
  });

  it('matches mod on Windows/Linux as Ctrl', async () => {
    let calls = 0;
    registry.register({
      id: 'open-palette',
      keys: ['mod+k'],
      description: 'Open palette',
      category: 'General',
      handler: () => {
        calls += 1;
        return true;
      },
    });

    const winEvent = event('k', { ctrlKey: true });
    const result = await registry.handle(winEvent);

    expect(result?.combo).toBe('mod+k');
    expect(calls).toBe(1);
  });

  it('does not match when modifiers differ', async () => {
    let calls = 0;
    registry.register({
      id: 'open-palette',
      keys: ['mod+k'],
      description: 'Open palette',
      category: 'General',
      handler: () => {
        calls += 1;
        return true;
      },
    });

    const noMod = event('k');
    const shiftK = event('k', { shiftKey: true });
    const altK = event('k', { altKey: true });

    expect(await registry.handle(noMod)).toBeNull();
    expect(await registry.handle(shiftK)).toBeNull();
    expect(await registry.handle(altK)).toBeNull();
    expect(calls).toBe(0);
  });

  it('calls preventDefault on match', async () => {
    registry.register({
      id: 'copy',
      keys: ['ctrl+c'],
      description: 'Copy',
      category: 'General',
      handler: () => true,
    });

    const e = preventable('c', { ctrlKey: true });
    await registry.handle(e);

    expect((e as unknown as { _calls: string[] })._calls).toContain('preventDefault');
  });

  it('does not prevent default when handler returns false', async () => {
    registry.register({
      id: 'pass-through',
      keys: ['esc'],
      description: 'Pass through',
      category: 'General',
      handler: () => false,
    });

    const e = preventable('Escape');
    await registry.handle(e);

    expect((e as unknown as { _calls: string[] })._calls).not.toContain('preventDefault');
  });

  it('respects the when guard', async () => {
    let enabled = false;
    let calls = 0;
    registry.register({
      id: 'conditional',
      keys: ['up'],
      description: 'Up when enabled',
      category: 'Chat',
      when: () => enabled,
      handler: () => {
        calls += 1;
        return true;
      },
    });

    const e = event('ArrowUp');

    expect(await registry.handle(e)).toBeNull();
    expect(calls).toBe(0);

    enabled = true;
    expect((await registry.handle(e))?.shortcut.id).toBe('conditional');
    expect(calls).toBe(1);
  });

  it('unregisters shortcuts', async () => {
    registry.register({
      id: 'tmp',
      keys: ['x'],
      description: 'Temporary',
      category: 'Test',
      handler: () => true,
    });

    expect((await registry.handle(event('x')))?.shortcut.id).toBe('tmp');

    registry.unregister('tmp');

    expect(await registry.handle(event('x'))).toBeNull();
  });

  it('matches first registered shortcut when combos overlap', async () => {
    const log: string[] = [];
    registry.register({
      id: 'first',
      keys: ['ctrl+k'],
      description: 'First',
      category: 'Test',
      handler: () => {
        log.push('first');
        return true;
      },
    });
    registry.register({
      id: 'second',
      keys: ['ctrl+k'],
      description: 'Second',
      category: 'Test',
      handler: () => {
        log.push('second');
        return true;
      },
    });

    await registry.handle(event('k', { ctrlKey: true }));

    expect(log).toEqual(['first']);
  });
});

describe('formatCombo', () => {
  it('formats mod+k for macOS', () => {
    expect(formatCombo('mod+k', true)).toBe('⌘k');
  });

  it('formats mod+k for non-mac', () => {
    expect(formatCombo('mod+k', false)).toBe('Ctrl+k');
  });

  it('formats ctrl+shift+/', () => {
    expect(formatCombo('ctrl+shift+/', false)).toBe('Ctrl+Shift+/');
    expect(formatCombo('mod+/', true)).toBe('⌘/');
  });

  it('formats arrow and escape keys', () => {
    expect(formatCombo('up', false)).toBe('↑');
    expect(formatCombo('esc', true)).toBe('Esc');
    expect(formatCombo('mod+enter', true)).toBe('⌘↵');
  });
});

describe('typing guard integration', () => {
  it('does not fire single-key shortcuts while typing in inputs', async () => {
    const registry = new KeyboardRegistry();
    let calls = 0;
    const target = { tagName: 'INPUT', value: '' } as unknown as EventTarget;

    registry.register({
      id: 'escape',
      keys: ['esc'],
      description: 'Cancel',
      category: 'General',
      when: () => {
        const active = eventTarget;
        return !isInputElement(active);
      },
      handler: () => {
        calls += 1;
        return true;
      },
    });

    eventTarget = target;

    try {
      const e = event('Escape');
      expect(await registry.handle(e)).toBeNull();
      expect(calls).toBe(0);
    } finally {
      eventTarget = null;
    }
  });
});

let eventTarget: EventTarget | null = null;

function isInputElement(target: EventTarget | null): boolean {
  if (!target) return false;
  const tag = (target as { tagName?: string }).tagName?.toLowerCase() ?? '';
  return tag === 'input' || tag === 'textarea';
}
