import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { createConnectionStore, connection, getConnectionState } from './connection.svelte';
import type { Message, MessageRole, OpenCodeClient, SendMessageInput } from '$lib/api/types.js';

const assistantRole: MessageRole = 'assistant';

describe('ConnectionStore', () => {
  let client: OpenCodeClient;
  let store: ReturnType<typeof createConnectionStore>;

  beforeEach(() => {
    client = {
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
      readFile: mock(() => Promise.resolve(''))
    };
    store = createConnectionStore(client);
  });

  afterEach(() => {
    store.disconnect();
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
});

describe('Connection singleton', () => {
  it('exports a singleton instance', () => {
    expect(connection).toBeDefined();
    expect(connection.current.status).toBe('disconnected');
  });
});
