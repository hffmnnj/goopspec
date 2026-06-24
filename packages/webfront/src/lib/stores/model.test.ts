import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { createModelStore, model } from './model.svelte';
import type { MessageRole, OpenCodeClient, Provider, SendMessageInput } from '../api/types.js';
import { agent } from './agent.svelte.js';
import { createChatStore } from './chat.svelte';

const PROVIDERS: Provider[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o', context: 128_000 },
      { id: 'gpt-4o-mini', name: 'GPT-4o mini', context: 128_000 },
    ],
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    models: [{ id: 'claude-opus', name: 'Claude Opus', context: 200_000 }],
  },
];

function createMockClient(sendMessage: OpenCodeClient['sendMessage']): OpenCodeClient {
  return {
    listSessions: mock(() => Promise.resolve([])),
    createSession: mock(() => Promise.resolve({ id: 's1', title: '', createdAt: '', updatedAt: '' })),
    deleteSession: mock(() => Promise.resolve()),
    renameSession: mock(() => Promise.resolve({ id: 's1', title: '', createdAt: '', updatedAt: '' })),
    getMessages: mock(() => Promise.resolve([])),
    sendMessage,
    runCommand: mock(() => Promise.resolve({ id: 'm1', role: 'assistant' as MessageRole, parts: [], createdAt: '' })),
    subscribeEvents: () => () => undefined,
    listProviders: mock(() => Promise.resolve(PROVIDERS)),
    listAgents: mock(() => Promise.resolve([])),
    listCommands: mock(() => Promise.resolve([])),
    getConfig: mock(() => Promise.resolve({})),
    updateConfig: mock(() => Promise.resolve({})),
    readFile: mock(() => Promise.resolve('')),
    listDirectory: mock(() => Promise.resolve([])),
  } as unknown as OpenCodeClient;
}

describe('model store', () => {
  let store: ReturnType<typeof createModelStore>;

  beforeEach(() => {
    store = createModelStore();
  });

  afterEach(() => {
    store.reset();
  });

  it('select sets provider and model ids', () => {
    store.setProviders(PROVIDERS);
    store.select('anthropic', 'claude-opus');

    expect(store.selectedProviderId).toBe('anthropic');
    expect(store.selectedModelId).toBe('claude-opus');
    expect(store.selectedModel).toEqual({ id: 'claude-opus', name: 'Claude Opus', context: 200_000 });
  });

  it('ignores selection for an unknown provider/model pair', () => {
    store.setProviders(PROVIDERS);
    store.select('anthropic', 'gpt-4o');

    expect(store.selectedProviderId).toBe('openai');
    expect(store.selectedModelId).toBe('gpt-4o');
  });

  it('defaults to the first provider and model when no persisted choice exists', () => {
    store.setProviders(PROVIDERS);

    expect(store.selectedProviderId).toBe('openai');
    expect(store.selectedModelId).toBe('gpt-4o');
  });

  it('persists selection to localStorage', () => {
    const storage = new Map<string, string>();
    const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      writable: true,
      value: {
        localStorage: {
          getItem: (key: string) => storage.get(key) ?? null,
          setItem: (key: string, value: string) => storage.set(key, value),
          removeItem: (key: string) => storage.delete(key),
          clear: () => storage.clear(),
        },
      },
    });

    try {
      const localStore = createModelStore();
      localStore.setProviders(PROVIDERS);
      localStore.select('anthropic', 'claude-opus');

      expect(JSON.parse(storage.get('goopspec-model') ?? '{}')).toEqual({
        providerId: 'anthropic',
        modelId: 'claude-opus',
      });

      localStore.reset();
      restoreGlobal('window', windowDescriptor);
    } catch (error) {
      restoreGlobal('window', windowDescriptor);
      throw error;
    }
  });

  it('restores a persisted selection when it is valid', () => {
    const storage = new Map<string, string>([
      ['goopspec-model', JSON.stringify({ providerId: 'anthropic', modelId: 'claude-opus' })],
    ]);
    const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      writable: true,
      value: {
        localStorage: {
          getItem: (key: string) => storage.get(key) ?? null,
          setItem: (key: string, value: string) => storage.set(key, value),
          removeItem: (key: string) => storage.delete(key),
          clear: () => storage.clear(),
        },
      },
    });

    try {
      const localStore = createModelStore();
      localStore.setProviders(PROVIDERS);

      expect(localStore.selectedProviderId).toBe('anthropic');
      expect(localStore.selectedModelId).toBe('claude-opus');

      localStore.reset();
      restoreGlobal('window', windowDescriptor);
    } catch (error) {
      restoreGlobal('window', windowDescriptor);
      throw error;
    }
  });

  it('falls back to default when persisted selection no longer exists', () => {
    const storage = new Map<string, string>([
      ['goopspec-model', JSON.stringify({ providerId: 'ghost', modelId: 'old-model' })],
    ]);
    const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      writable: true,
      value: {
        localStorage: {
          getItem: (key: string) => storage.get(key) ?? null,
          setItem: (key: string, value: string) => storage.set(key, value),
          removeItem: (key: string) => storage.delete(key),
          clear: () => storage.clear(),
        },
      },
    });

    try {
      const localStore = createModelStore();
      localStore.setProviders(PROVIDERS);

      expect(localStore.selectedProviderId).toBe('openai');
      expect(localStore.selectedModelId).toBe('gpt-4o');

      localStore.reset();
      restoreGlobal('window', windowDescriptor);
    } catch (error) {
      restoreGlobal('window', windowDescriptor);
      throw error;
    }
  });
});

describe('chat store + model selection', () => {
  let client: OpenCodeClient;
  let chat: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    const assistantRole: MessageRole = 'assistant';
    const sendMessage = mock((_sessionId: string, _input: SendMessageInput) =>
      Promise.resolve({ id: 'm1', role: assistantRole, parts: [], createdAt: '' })
    );
    client = createMockClient(sendMessage);
    chat = createChatStore(client);
    model.reset();
    agent.reset();
    model.setProviders(PROVIDERS);
  });

  afterEach(() => {
    model.reset();
    agent.reset();
  });

  it('sendMessage attaches the selected model from the model store', async () => {
    model.select('anthropic', 'claude-opus');

    await chat.loadHistory('s1');
    await chat.sendMessage('hello');

    expect(client.sendMessage).toHaveBeenCalledWith('s1', {
      text: 'hello',
      providerId: 'anthropic',
      modelId: 'claude-opus',
    });
  });

  it('sendMessage sends provider/model only when a selection exists', async () => {
    model.reset();

    await chat.loadHistory('s1');
    await chat.sendMessage('hello');

    expect(client.sendMessage).toHaveBeenCalledWith('s1', { text: 'hello' });
  });

  it('sendMessage attaches the selected agent id', async () => {
    agent.agents = [{ id: 'goop-orchestrator', name: 'goop-orchestrator' }];
    agent.select('goop-orchestrator');

    await chat.loadHistory('s1');
    await chat.sendMessage('hello');

    expect(client.sendMessage).toHaveBeenCalledWith('s1', expect.objectContaining({
      text: 'hello',
      agent: 'goop-orchestrator',
    }));
  });
});

function restoreGlobal(key: string, descriptor: PropertyDescriptor | undefined): void {
  if (descriptor) {
    Object.defineProperty(globalThis, key, descriptor);
  } else {
    delete (globalThis as Record<string, unknown>)[key];
  }
}
