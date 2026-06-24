import { afterEach, describe, expect, it } from 'bun:test';
import { builtinCommands } from './commands.js';

describe('builtinCommands', () => {
  const original = (globalThis as { document?: unknown }).document;

  afterEach(() => {
    (globalThis as { document?: unknown }).document = original;
  });

  it('registers a switch-workspace command', () => {
    const ids = builtinCommands().map((c) => c.id);
    expect(ids).toContain('switch-workspace');
  });

  it('switch-workspace opens the [data-shortcut="workspace-switcher"] trigger', () => {
    const command = builtinCommands().find((c) => c.id === 'switch-workspace');
    expect(command).toBeDefined();

    const calls: string[] = [];
    let clicked = false;
    let focused = false;
    const trigger = {
      click: () => (clicked = true),
      focus: () => (focused = true),
    };
    (globalThis as { document?: unknown }).document = {
      querySelector(selector: string) {
        calls.push(selector);
        return trigger;
      },
    };

    command?.run();

    expect(calls).toContain('[data-shortcut="workspace-switcher"]');
    expect(clicked).toBe(true);
    expect(focused).toBe(true);
  });

  it('switch-workspace is a no-op when the trigger is absent', () => {
    (globalThis as { document?: unknown }).document = {
      querySelector: () => null,
    };
    const command = builtinCommands().find((c) => c.id === 'switch-workspace');
    expect(() => command?.run()).not.toThrow();
  });
});
