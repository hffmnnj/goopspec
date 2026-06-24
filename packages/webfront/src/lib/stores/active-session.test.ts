import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { createActiveSessionStore, activeSession } from './active-session.svelte';
import type { ChatStore } from './chat.svelte';

function createMockChatStore(): ChatStore {
  return {
    messages: [],
    loading: false,
    streaming: false,
    error: null,
    activeSessionId: null,
    loadHistory: mock(() => Promise.resolve()),
    sendMessage: mock(() => Promise.resolve()),
    appendStreamingPart: mock(() => {}),
    finalizeStreaming: mock(() => {}),
    interrupt: mock(() => {}),
    clear: mock(() => {}),
    editLastUserMessage: mock(() => null),
    clearError: mock(() => {}),
  } as unknown as ChatStore;
}

describe('active-session store', () => {
  let chatStore: ChatStore;
  let store: ReturnType<typeof createActiveSessionStore>;

  beforeEach(() => {
    chatStore = createMockChatStore();
    store = createActiveSessionStore(chatStore);
  });

  afterEach(() => {
    activeSession.clear();
  });

  it('starts with no active session', () => {
    expect(store.activeId).toBeNull();
  });

  it('select sets activeId and updates the chat store', () => {
    store.select('s1');
    expect(store.activeId).toBe('s1');
    expect(chatStore.activeSessionId).toBe('s1');
  });

  it('select triggers chat.loadHistory for the chosen session', () => {
    store.select('s2');
    expect(chatStore.loadHistory).toHaveBeenCalledTimes(1);
    expect(chatStore.loadHistory).toHaveBeenCalledWith('s2');
  });

  it('clear resets activeId and chat.activeSessionId', () => {
    store.select('s3');
    store.clear();
    expect(store.activeId).toBeNull();
    expect(chatStore.activeSessionId).toBeNull();
  });

  it('singleton is exported and backed by the shared chat store', () => {
    expect(activeSession).toBeDefined();
    expect(activeSession.activeId).toBeNull();
  });
});
