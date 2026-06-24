import { isMac, normalizeKey, normalizeMod } from './platform.js';

/** A normalized key token such as 'cmd+k', 'ctrl+k', 'esc', or 'up'. */
export type KeyCombo = string;

/** Handler invoked when a shortcut matches. Return false to keep bubbling. */
export type ShortcutHandler = (event: KeyboardEvent) => boolean | void | Promise<boolean | void>;

export interface Shortcut {
  /** Stable identifier. */
  id: string;
  /** One or more normalized combos that trigger the shortcut. */
  keys: KeyCombo[];
  /** Human-readable description shown in the help overlay. */
  description: string;
  /** Logical grouping used to cluster shortcuts in the help overlay. */
  category: string;
  /** Handler called when the shortcut matches and `when` (if any) is satisfied. */
  handler: ShortcutHandler;
  /** Optional guard; shortcut only fires when this returns true. */
  when?: () => boolean;
}

export interface ShortcutMatch {
  shortcut: Shortcut;
  /** Combo that matched the event, after normalization. */
  combo: KeyCombo;
}

/**
 * Central keybinding registry.
 *
 * The registry is intentionally DOM-free: all matching logic operates on a
 * plain KeyboardEvent-like object so it can be fully unit tested. A thin
 * Svelte action (`useKeyboard`) wires `window` events into the registry in the
 * app shell.
 */
export class KeyboardRegistry {
  private shortcuts: Map<string, Shortcut> = new Map();

  register(shortcut: Shortcut): void {
    this.shortcuts.set(shortcut.id, shortcut);
  }

  unregister(id: string): void {
    this.shortcuts.delete(id);
  }

  /** Return all registered shortcuts in insertion order. */
  all(): Shortcut[] {
    return Array.from(this.shortcuts.values());
  }

  /**
   * Handle a keyboard event.
   *
   * - Finds the first matching shortcut whose `when` guard (if any) is true.
   * - Calls the handler.
   * - Calls preventDefault() when the handler returns a truthy value (or void).
   * - Returns the matched shortcut so callers can avoid duplicate handling.
   */
  async handle(event: KeyboardEvent): Promise<ShortcutMatch | null> {
    for (const shortcut of this.shortcuts.values()) {
      const match = this.match(shortcut, event);
      if (!match) continue;
      if (shortcut.when && !shortcut.when()) continue;

      const result = await shortcut.handler(event);
      if (result !== false) {
        event.preventDefault();
      }
      return { shortcut, combo: match };
    }
    return null;
  }

  private match(shortcut: Shortcut, event: KeyboardEvent): KeyCombo | null {
    for (const combo of shortcut.keys) {
      if (comboMatches(combo, event)) return combo;
    }
    return null;
  }
}

/**
 * Parse a combo like 'cmd+shift+k' or 'ctrl+/' into modifier expectations and a
 * normalized primary key. 'mod' is expanded to 'cmd' on macOS and 'ctrl' elsewhere.
 */
function parseCombo(combo: KeyCombo): {
  key: string;
  ctrl: boolean;
  meta: boolean;
  alt: boolean;
  shift: boolean;
} {
  const parts = combo.split('+').map((part) => normalizeKey(normalizeMod(part.trim())));
  const key = parts[parts.length - 1];
  const ctrl = parts.includes('ctrl') || parts.includes('control');
  const meta = parts.includes('cmd') || parts.includes('command') || parts.includes('meta');
  const alt = parts.includes('alt') || parts.includes('option');
  const shift = parts.includes('shift');
  return { key, ctrl, meta, alt, shift };
}

/** Map a KeyboardEvent key value to a normalized token. */
function normalizeEventKey(event: KeyboardEvent): string {
  const key = event.key;
  const lower = key.toLowerCase();

  if (lower === 'arrowup') return 'up';
  if (lower === 'arrowdown') return 'down';
  if (lower === 'arrowleft') return 'left';
  if (lower === 'arrowright') return 'right';
  if (lower === 'escape') return 'esc';
  if (lower === ' ') return 'space';
  if (lower === 'enter') return 'enter';
  if (lower === 'backspace') return 'backspace';
  if (lower === 'delete') return 'delete';
  if (lower === 'tab') return 'tab';
  if (lower === '/') return '/';
  if (lower === '.') return '.';
  if (lower === ',') return ',';

  return lower;
}

function comboMatches(combo: KeyCombo, event: KeyboardEvent): boolean {
  const expected = parseCombo(combo);
  const eventKey = normalizeEventKey(event);

  if (eventKey !== expected.key) return false;

  return (
    event.ctrlKey === expected.ctrl &&
    event.metaKey === expected.meta &&
    event.altKey === expected.alt &&
    event.shiftKey === expected.shift
  );
}

/** Format a combo for display, e.g. '⌘K' on macOS, 'Ctrl+K' elsewhere. */
export function formatCombo(combo: KeyCombo, mac: boolean = isMac()): string {
  const parts = combo.split('+').map((part) => {
    const lower = normalizeKey(part.trim());
    if (lower === 'mod') return mac ? '⌘' : 'Ctrl';
    if (lower === 'cmd' || lower === 'command' || lower === 'meta') return mac ? '⌘' : 'Win';
    if (lower === 'ctrl' || lower === 'control') return mac ? '⌃' : 'Ctrl';
    if (lower === 'alt' || lower === 'option') return mac ? '⌥' : 'Alt';
    if (lower === 'shift') return mac ? '⇧' : 'Shift';
    if (lower === 'up' || lower === 'arrowup') return '↑';
    if (lower === 'down' || lower === 'arrowdown') return '↓';
    if (lower === 'left' || lower === 'arrowleft') return '←';
    if (lower === 'right' || lower === 'arrowright') return '→';
    if (lower === 'enter' || lower === 'return') return mac ? '↵' : 'Enter';
    if (lower === 'esc' || lower === 'escape') return 'Esc';
    if (lower === '/') return '/';
    return part.trim();
  });

  // Use compact macOS ordering: modifiers then key.
  return mac ? parts.join('') : parts.join('+');
}

/** Test helper: build a KeyboardEvent-like object for unit tests. */
export function keyboardEvent(
  init: Partial<KeyboardEvent> & { key: string }
): KeyboardEvent {
  return {
    key: init.key,
    ctrlKey: init.ctrlKey ?? false,
    metaKey: init.metaKey ?? false,
    altKey: init.altKey ?? false,
    shiftKey: init.shiftKey ?? false,
    target: init.target ?? null,
    preventDefault: init.preventDefault ?? (() => {}),
    defaultPrevented: false,
  } as KeyboardEvent;
}

/** Shared singleton registry for the app. */
export const keyboardRegistry = new KeyboardRegistry();
