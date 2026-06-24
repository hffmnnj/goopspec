import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { createConnectionStore, connection, getConnectionState } from './connection.svelte';
import type { GlobalEvent, Message, MessageRole, OpenCodeClient, SendMessageInput } from '$lib/api/types.js';

const assistantRole: MessageRole = 'assistant';

const realSetInterval = globalThis.setInterval;
const realClearInterval = globalThis.clearInterval;
let intervalCallbacks = new Map<number, () => void>();
let nextIntervalId = 1;

function installFakeIntervals(): void {
  intervalCallbacks = new Map();
  nextIntervalId = 1;
  globalThis.setInterval = ((handler: TimerHandler) => {
    const id = nextIntervalId++;
    if (typeof handler === 'function') intervalCallbacks.set(id, handler as () => void);
    return id as unknown as ReturnType<typeof setInterval>;
  }) as unknown as typeof setInterval;
  globalThis.clearInterval = ((id?: ReturnType<typeof setInterval>) => {
    intervalCallbacks.delete(Number(id));
  }) as typeof clearInterval;
}

function tickFakeIntervals(): void {
  for (const callback of Array.from(intervalCallbacks.values())) callback();
}

function restoreFakeIntervals(): void {
  globalThis.setInterval = realSetInterval;
  globalThis.clearInterval = realClearInterval;
  intervalCallbacks.clear();
}

describe('ConnectionStore', () => {
  let client: OpenCodeClient;
  let store: ReturnType<typeof createConnectionStore>;
  let globalEventHandler: ((event: GlobalEvent) => void) | undefined;
  let closeGlobalEvents: ReturnType<typeof mock>;

  beforeEach(() => {
    globalEventHandler = undefined;
    closeGlobalEvents = mock(() => undefined);
    client = {
      listProjects: mock(() => Promise.resolve([])),
      getCurrentProject: mock(() => Promise.resolve(null)),
      getPath: mock(() => Promise.resolve({ path: '' })),
      getVcsInfo: mock(() => Promise.resolve(null)),
      subscribeGlobalEvents: mock((handler: (event: GlobalEvent) => void) => {
        globalEventHandler = handler;
        return { close: closeGlobalEvents };
      }),
      listSessions: mock(() => Promise.resolve([])),
      createSession: mock(() => Promise.resolve({ id: 's1', title: '', createdAt: '', updatedAt: '' })),
      deleteSession: mock(() => Promise.resolve()),
      renameSession: mock(() => Promise.resolve({ id: 's1', title: '', createdAt: '', updatedAt: '' })),
      getMessages: mock(() => Promise.resolve([])),
      sendMessage: mock((_sessionId: string, _input: SendMessageInput) =>
        Promise.resolve({ id: 'm1', role: assistantRole, parts: [], createdAt: '' } as Message)
      ),
      subscribeEvents: () => () => undefined,
      listProviders: mock(() => Promise.resolve([])),
      getConfig: mock(() => Promise.resolve({})),
      updateConfig: mock(() => Promise.resolve({})),
      readFile: mock(() => Promise.resolve('')),
      listDirectory: mock(() => Promise.resolve([]))
    };
    store = createConnectionStore(client);
  });

  afterEach(() => {
    store.disconnect();
    restoreFakeIntervals();
  });

  it('starts disconnected', () => {
    expect(getConnectionState().status).toBe('disconnected');
    expect(store.current.status).toBe('disconnected');
  });

  it('transitions disconnected → connecting → connected', async () => {
    const order: string[] = [];
    client.getConfig = mock(async () => {
      order.push(store.current.status);
      await Promise.resolve();
      order.push(store.current.status);
      return {};
    });

    const promise = store.connect();
    expect(store.current.status).toBe('connecting');

    await promise;
    expect(store.current.status).toBe('connected');
    expect(store.current.error).toBeNull();
    expect(order).toEqual(['connecting', 'connecting']);
  });

  it('transitions to error when getConfig fails', async () => {
    client.getConfig = mock(() => Promise.reject(new Error('Server unreachable')));

    await store.connect();

    expect(store.current.status).toBe('error');
    expect(store.current.error).toBe('Server unreachable');
  });

  it('disconnect resets to disconnected and clears errors', async () => {
    client.getConfig = mock(() => Promise.reject(new Error('boom')));
    await store.connect();
    expect(store.current.status).toBe('error');

    store.disconnect();

    expect(store.current.status).toBe('disconnected');
    expect(store.current.error).toBeNull();
    expect(store.current.retryCount).toBe(0);
  });

  it('retries failures with exponential backoff then succeeds', async () => {
    let attempts = 0;
    client.getConfig = mock(async () => {
      attempts += 1;
      if (attempts < 3) {
        throw new Error(`fail ${attempts}`);
      }
      return {};
    });

    await store.connectWithRetry(4);

    expect(attempts).toBe(3);
    expect(store.current.status).toBe('connected');
    expect(store.current.error).toBeNull();
    expect(store.current.retryCount).toBe(0);
  });

  it('retries to exhausted error state when all attempts fail', async () => {
    let attempts = 0;
    client.getConfig = mock(() => {
      attempts += 1;
      return Promise.reject(new Error('still down'));
    });

    await store.connectWithRetry(2);

    expect(attempts).toBe(3); // initial + 2 retries
    expect(store.current.status).toBe('error');
    expect(store.current.error).toBe('still down');
  });

  it('uses getConfig as the health-check call', async () => {
    const getConfig = mock(() => Promise.resolve({ provider: 'openai' }));
    client.getConfig = getConfig;

    await store.connect();

    expect(getConfig).toHaveBeenCalledTimes(1);
  });

  it('starts a global event subscription after connecting', async () => {
    await store.connect();

    expect(client.subscribeGlobalEvents).toHaveBeenCalledTimes(1);
    expect(globalEventHandler).toBeDefined();
  });

  it('closes the global event subscription on disconnect', async () => {
    await store.connect();

    store.disconnect();

    expect(closeGlobalEvents).toHaveBeenCalledTimes(1);
    expect(store.current.status).toBe('disconnected');
  });

  it('handles server.connected global events as a healthy connected state', async () => {
    await store.connect();
    store.current.error = 'stale';
    store.current.retryCount = 2;

    globalEventHandler?.({ type: 'server.connected' });

    expect(store.current.status).toBe('connected');
    expect(store.current.error).toBeNull();
    expect(store.current.retryCount).toBe(0);
  });

  it('runs a health check after a successful connection', async () => {
    installFakeIntervals();
    const getConfig = mock(() => Promise.resolve({}));
    client.getConfig = getConfig;

    await store.connect();
    tickFakeIntervals();
    await Promise.resolve();

    expect(getConfig).toHaveBeenCalledTimes(2);
    expect(store.current.status).toBe('connected');
  });

  it('reconnects when a health check fails', async () => {
    installFakeIntervals();
    let calls = 0;
    client.getConfig = mock(() => {
      calls += 1;
      if (calls === 2) return Promise.reject(new Error('health down'));
      return Promise.resolve({});
    });

    await store.connect();
    tickFakeIntervals();
    await Promise.resolve();
    await Promise.resolve();

    expect(calls).toBe(3);
    expect(store.current.status).toBe('connected');
    expect(client.subscribeGlobalEvents).toHaveBeenCalledTimes(2);
  });

  it('clears the health-check interval on disconnect', async () => {
    installFakeIntervals();
    const getConfig = mock(() => Promise.resolve({}));
    client.getConfig = getConfig;

    await store.connect();
    store.disconnect();
    tickFakeIntervals();
    await Promise.resolve();

    expect(getConfig).toHaveBeenCalledTimes(1);
  });
});

describe('Connection singleton', () => {
  it('exports a singleton instance', () => {
    expect(connection).toBeDefined();
    expect(connection.current.status).toBe('disconnected');
  });
});
