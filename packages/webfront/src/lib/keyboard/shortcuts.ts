import { chat } from '$lib/stores/chat.svelte.js';
import { sessions } from '$lib/stores/sessions.svelte.js';
import { activeSession } from '$lib/stores/active-session.svelte.js';
import { ui } from '$lib/stores/ui.svelte.js';
import { voice } from '$lib/stores/voice.svelte.js';
import { KeyboardRegistry, keyboardRegistry, type Shortcut } from './registry.js';

/**
 * Default OpenCode-style keybindings for the web frontend.
 *
 * Single-key shortcuts (Up, Esc) include `when` guards so they do not fire while
 * the user is typing in inputs. Mod-combos are allowed everywhere because they
 * are deliberate and unlikely to collide with native typing.
 */
export const defaultShortcuts: Shortcut[] = [
  {
    id: 'command-palette',
    keys: ['mod+k'],
    description: 'Open command palette',
    category: 'General',
    handler: () => {
      ui.paletteOpen = true;
      return true;
    },
  },
  {
    id: 'keyboard-help',
    keys: ['mod+/'],
    description: 'Show keyboard shortcuts',
    category: 'General',
    handler: () => {
      ui.helpOpen = true;
      return true;
    },
  },
  {
    id: 'new-session',
    keys: ['mod+n'],
    description: 'New session',
    category: 'Session',
    handler: async () => {
      const session = await sessions.create();
      if (session) activeSession.select(session.id);
      return true;
    },
  },
  {
    id: 'close-session',
    keys: ['mod+w'],
    description: 'Close current session',
    category: 'Session',
    handler: async () => {
      const id = activeSession.activeId;
      if (!id) return true;
      await sessions.remove(id);
      activeSession.clear();
      return true;
    },
  },
  {
    id: 'clear-session',
    keys: ['mod+l'],
    description: 'Clear conversation',
    category: 'Session',
    handler: () => {
      chat.clear();
      return true;
    },
  },
  {
    id: 'focus-session-list',
    keys: ['mod+s'],
    description: 'Focus session list',
    category: 'Session',
    handler: () => {
      const list = document.querySelector('[data-shortcut="session-list"]') as HTMLElement | null;
      list?.focus();
      return true;
    },
  },
  {
    id: 'voice-mic-toggle',
    keys: ['mod+m'],
    description: 'Toggle voice input',
    category: 'Chat',
    handler: () => {
      // The MicButton owns the VAD/STT lifecycle, so route the toggle through a
      // window event it listens for. Stopping while active still goes through the
      // component so the mic stream is torn down cleanly.
      if (voice.isError) voice.reset();
      document.dispatchEvent(new CustomEvent('goopspec:voice-toggle'));
      return true;
    },
  },
  {
    id: 'interrupt',
    keys: ['ctrl+c'],
    description: 'Interrupt generation',
    category: 'Chat',
    when: () => chat.streaming,
    handler: () => {
      chat.interrupt();
      return true;
    },
  },
  {
    id: 'edit-last-message',
    keys: ['up'],
    description: 'Edit last message',
    category: 'Chat',
    // Only when an input/textarea is focused and empty, so Up still navigates
    // lists and the caret elsewhere.
    when: () => {
      const target = document.activeElement;
      if (!target) return false;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
        return target.value.length === 0;
      }
      return false;
    },
    handler: () => {
      const text = chat.editLastUserMessage();
      if (!text) return true;
      const target = document.activeElement;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
        target.value = text;
        target.dispatchEvent(new Event('input', { bubbles: true }));
        target.setSelectionRange(text.length, text.length);
      }
      return true;
    },
  },
  {
    id: 'send-message',
    keys: ['mod+enter'],
    description: 'Send message',
    category: 'Chat',
    // Only fire when a chat input is focused; otherwise it is handled by the
    // focused message input directly and we must not double-fire.
    when: () => {
      const target = document.activeElement;
      if (!target) return false;
      return target instanceof HTMLTextAreaElement && target.dataset.role === 'message-input';
    },
    handler: () => {
      const target = document.activeElement;
      if (!(target instanceof HTMLTextAreaElement)) return false;
      const text = target.value.trim();
      if (!text) return false;
      chat.sendMessage(text);
      target.value = '';
      target.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    },
  },
  {
    id: 'cancel',
    keys: ['esc'],
    description: 'Cancel / close overlays',
    category: 'General',
    handler: () => {
      if (ui.paletteOpen || ui.helpOpen || ui.addProjectOpen) {
        ui.closeAll();
        return true;
      }
      if (chat.streaming) {
        chat.interrupt();
        return true;
      }
      return false;
    },
  },
];

/** Register the default shortcuts in a registry. */
export function registerDefaultShortcuts(registry = keyboardRegistry): void {
  for (const shortcut of defaultShortcuts) {
    registry.register(shortcut);
  }
}

export { KeyboardRegistry };
