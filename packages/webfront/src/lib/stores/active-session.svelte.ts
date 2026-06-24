/**
 * Active-session store — Svelte 5 runes.
 *
 * Single source of truth for "which session is open". Selecting a session
 * updates this store and delegates history loading to the shared chat store.
 * SSR-safe: the singleton is only constructed once and guards browser APIs.
 */
import { chat } from './chat.svelte.js';
import type { ChatStore } from './chat.svelte.js';

class ActiveSessionStore {
  activeId = $state<string | null>(null);

  constructor(private readonly chatStore: ChatStore) {}

  /** Open a session and load its history into the chat store. */
  select(sessionId: string): void {
    this.activeId = sessionId;
    this.chatStore.activeSessionId = sessionId;
    void this.chatStore.loadHistory(sessionId);
  }

  /** Clear the active selection (does not clear chat history). */
  clear(): void {
    this.activeId = null;
    this.chatStore.activeSessionId = null;
  }
}

/** Factory for tests; pass a mock chat store to avoid real network calls. */
export function createActiveSessionStore(chatStore?: ChatStore): ActiveSessionStore {
  return new ActiveSessionStore(chatStore ?? chat);
}

/** Default reactive active-session singleton backed by the shared chat store. */
export const activeSession = createActiveSessionStore();
