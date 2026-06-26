/**
 * Text-to-Speech engine — Web Speech API (`SpeechSynthesis`).
 *
 * Pure utility (not a store). The chat stream reducer calls `speak(finalText)`
 * on `message.completed`; new messages/keystrokes call `cancel()`. SSR-safe,
 * no-ops when `voiceTtsEnabled` is false, and never queues (cancel-before-speak).
 */

import { settings as defaultSettings } from '../stores/settings.svelte.js';

export interface TtsSettingsSource {
  readonly current: { readonly voiceTtsEnabled: boolean };
}

export interface TtsService {
  speak(text: string): void;
  cancel(): void;
  readonly supported: boolean;
}

function isSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

// Order matters: code blocks/inline code are removed wholesale before generic
// formatting chars, and links/images collapse to their label/alt text.
export function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`]+`/g, '')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/#{1,6}\s/g, '')
    .replace(/[*_~>[\]()#|]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Settings are read lazily per call so toggling the preference takes effect
// without recreating the service.
export function createTtsService(settingsSource: TtsSettingsSource): TtsService {
  return {
    get supported(): boolean {
      return isSupported();
    },

    speak(text: string): void {
      if (!isSupported()) return;
      if (!settingsSource.current.voiceTtsEnabled) return;

      const spoken = stripMarkdown(text);
      if (spoken === '') return;

      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(spoken));
    },

    cancel(): void {
      if (!isSupported()) return;
      window.speechSynthesis.cancel();
    },
  };
}

export const tts = createTtsService(defaultSettings);
