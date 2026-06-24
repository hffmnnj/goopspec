import { beforeEach, describe, expect, it } from 'bun:test';
import { registerDefaultShortcuts, defaultShortcuts } from './shortcuts.js';
import { KeyboardRegistry, keyboardEvent } from './registry.js';
import { chat } from '$lib/stores/chat.svelte.js';
import { ui } from '$lib/stores/ui.svelte.js';

describe('defaultShortcuts', () => {
  let registry: KeyboardRegistry;

  beforeEach(() => {
    registry = new KeyboardRegistry();
    ui.closeAll();
  });

  it('has entries for every required OpenCode shortcut', () => {
    const ids = defaultShortcuts.map((s) => s.id);
    expect(ids).toContain('command-palette');
    expect(ids).toContain('keyboard-help');
    expect(ids).toContain('new-session');
    expect(ids).toContain('close-session');
    expect(ids).toContain('clear-session');
    expect(ids).toContain('focus-session-list');
    expect(ids).toContain('interrupt');
    expect(ids).toContain('edit-last-message');
    expect(ids).toContain('send-message');
    expect(ids).toContain('cancel');
  });

  it('command-palette opens palette', async () => {
    registerDefaultShortcuts(registry);
    const e = keyboardEvent({ key: 'k', ctrlKey: true, preventDefault: () => {} });
    await registry.handle(e);
    expect(ui.paletteOpen).toBe(true);
  });

  it('keyboard-help opens help', async () => {
    registerDefaultShortcuts(registry);
    const e = keyboardEvent({ key: '/', ctrlKey: true, preventDefault: () => {} });
    await registry.handle(e);
    expect(ui.helpOpen).toBe(true);
  });

  it('cancel closes open overlays', async () => {
    ui.paletteOpen = true;
    registerDefaultShortcuts(registry);
    const e = keyboardEvent({ key: 'Escape', preventDefault: () => {} });
    await registry.handle(e);
    expect(ui.paletteOpen).toBe(false);
  });

  it('interrupt calls chat.interrupt only while streaming', () => {
    chat.streaming = false;

    const shortcut = defaultShortcuts.find((s) => s.id === 'interrupt');
    expect(shortcut?.when?.()).toBe(false);

    chat.streaming = true;
    expect(shortcut?.when?.()).toBe(true);

    chat.streaming = false;
  });
});
