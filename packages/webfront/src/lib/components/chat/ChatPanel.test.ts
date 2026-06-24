import { beforeEach, describe, expect, it, mock } from 'bun:test';
import type { Message, MessageRole, OpenCodeClient, SendMessageInput } from '$lib/api/types.js';
import { createChatStore } from '$lib/stores/chat.svelte.js';
import {
  deriveText,
  groupParts,
  isTextPart,
  isToolInvokePart,
} from '$lib/api/messages.js';

const userRole: MessageRole = 'user';
const assistantRole: MessageRole = 'assistant';

function message(overrides: Partial<Message> = {}): Message {
  return {
    id: 'm-default',
    role: assistantRole,
    parts: [],
    createdAt: '2026-06-23T00:00:00.000Z',
    ...overrides,
  };
}

function createMockClient(): OpenCodeClient {
  return {
    listSessions: mock(() => Promise.resolve([])),
    createSession: mock(() => Promise.resolve({ id: 's1', title: '', createdAt: '', updatedAt: '' })),
    deleteSession: mock(() => Promise.resolve()),
    renameSession: mock(() => Promise.resolve({ id: 's1', title: '', createdAt: '', updatedAt: '' })),
    getMessages: mock(() => Promise.resolve([])),
    sendMessage: mock((_sessionId: string, _input: SendMessageInput) =>
      Promise.resolve(message({ id: 'server-reply', role: assistantRole }))
    ),
    subscribeEvents: () => () => undefined,
    listProviders: mock(() => Promise.resolve([])),
    getConfig: mock(() => Promise.resolve({})),
    updateConfig: mock(() => Promise.resolve({})),
    readFile: mock(() => Promise.resolve('')),
    listDirectory: mock(() => Promise.resolve([])),
  } as unknown as OpenCodeClient;
}

describe('chat store', () => {
  let client: OpenCodeClient;
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    client = createMockClient();
    store = createChatStore(client);
  });

  it('loadHistory populates messages and sets the active session', async () => {
    const history = [
      message({ id: 'a', role: userRole, parts: [{ type: 'text', text: 'hi' }] }),
      message({ id: 'b', role: assistantRole, parts: [{ type: 'text', text: 'hello' }] }),
    ];
    (client.getMessages as ReturnType<typeof mock>).mockImplementation(() => Promise.resolve(history));

    await store.loadHistory('s1');

    expect(client.getMessages).toHaveBeenCalledWith('s1');
    expect(store.activeSessionId).toBe('s1');
    expect(store.loading).toBe(false);
    expect(store.error).toBeNull();
    expect(store.messages.map((m) => m.id)).toEqual(['a', 'b']);
  });

  it('loadHistory sets error state on failure', async () => {
    (client.getMessages as ReturnType<typeof mock>).mockImplementation(() =>
      Promise.reject(new Error('boom'))
    );

    await store.loadHistory('s1');

    expect(store.error).toBe('boom');
    expect(store.loading).toBe(false);
  });

  it('sendMessage appends the user message and an assistant placeholder', async () => {
    await store.loadHistory('s1');

    await store.sendMessage('  what is up?  ');

    expect(client.sendMessage).toHaveBeenCalledWith('s1', { text: 'what is up?' });
    const roles = store.messages.map((m) => m.role);
    expect(roles).toEqual([userRole, assistantRole]);
    const user = store.messages[0];
    expect(deriveText(user)).toBe('what is up?');
  });

  it('sendMessage ignores empty input', async () => {
    await store.loadHistory('s1');

    await store.sendMessage('   ');

    expect(client.sendMessage).not.toHaveBeenCalled();
    expect(store.messages).toHaveLength(0);
  });

  it('sendMessage without an active session is a no-op', async () => {
    await store.sendMessage('hello');

    expect(client.sendMessage).not.toHaveBeenCalled();
    expect(store.messages).toHaveLength(0);
  });

  it('appendStreamingPart coalesces streamed text into the active assistant message', async () => {
    await store.loadHistory('s1');
    await store.sendMessage('go');

    store.appendStreamingPart({ type: 'text', text: 'Hel' });
    store.appendStreamingPart({ type: 'text', text: 'lo' });

    const assistant = store.messages[store.messages.length - 1];
    expect(assistant.role).toBe(assistantRole);
    expect(deriveText(assistant)).toBe('Hello');
    expect(store.streaming).toBe(true);
  });

  it('finalizeStreaming clears the streaming flag', async () => {
    await store.loadHistory('s1');
    await store.sendMessage('go');
    expect(store.streaming).toBe(true);

    store.finalizeStreaming();

    expect(store.streaming).toBe(false);
  });

  it('sendMessage surfaces send errors and stops streaming', async () => {
    (client.sendMessage as ReturnType<typeof mock>).mockImplementation(() =>
      Promise.reject(new Error('network'))
    );
    await store.loadHistory('s1');

    await store.sendMessage('hi');

    expect(store.error).toBe('network');
    expect(store.streaming).toBe(false);
  });

  it('clear resets messages and streaming state', async () => {
    await store.loadHistory('s1');
    await store.sendMessage('hi');

    store.clear();

    expect(store.messages).toHaveLength(0);
    expect(store.streaming).toBe(false);
  });

  it('editLastUserMessage returns the most recent user text', async () => {
    store.activeSessionId = 's1';
    store.messages = [
      message({ id: 'u1', role: userRole, parts: [{ type: 'text', text: 'first' }] }),
      message({ id: 'a1', role: assistantRole, parts: [{ type: 'text', text: 'reply' }] }),
      message({ id: 'u2', role: userRole, parts: [{ type: 'text', text: 'second' }] }),
    ];

    expect(store.editLastUserMessage()).toBe('second');
  });

  it('editLastUserMessage returns null when there is no user message', () => {
    store.messages = [message({ id: 'a1', role: assistantRole, parts: [{ type: 'text', text: 'x' }] })];

    expect(store.editLastUserMessage()).toBeNull();
  });
});

describe('message helpers', () => {
  it('groupParts coalesces adjacent text and preserves tool order', () => {
    const groups = groupParts([
      { type: 'text', text: 'a' },
      { type: 'text', text: 'b' },
      { type: 'tool-invoke', tool: 'read', input: {} },
      { type: 'text', text: 'c' },
    ]);

    expect(groups.map((g) => g.kind)).toEqual(['text', 'tool', 'text']);
    expect(groups[0]).toEqual({ kind: 'text', text: 'ab' });
  });

  it('type guards discriminate part variants', () => {
    expect(isTextPart({ type: 'text', text: 'x' })).toBe(true);
    expect(isToolInvokePart({ type: 'tool-invoke', tool: 'read' })).toBe(true);
    expect(isTextPart({ type: 'tool-invoke', tool: 'read' })).toBe(false);
  });

  it('deriveText concatenates only text parts', () => {
    const result = deriveText(
      message({
        parts: [
          { type: 'text', text: 'one ' },
          { type: 'tool-invoke', tool: 'read' },
          { type: 'text', text: 'two' },
        ],
      })
    );
    expect(result).toBe('one two');
  });
});
