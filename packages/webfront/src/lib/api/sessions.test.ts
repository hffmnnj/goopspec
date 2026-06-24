import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import type { CreateSessionOptions, OpenCodeClient, Session } from './types.js';
import {
  createSession,
  deleteSession,
  fetchSessions,
  renameSession,
} from './sessions.js';

function session(overrides: Partial<Session> = {}): Session {
  return {
    id: 'default-id',
    title: 'Untitled',
    createdAt: '2026-06-23T00:00:00.000Z',
    updatedAt: '2026-06-23T00:00:00.000Z',
    ...overrides,
  };
}

function createMockClient(): OpenCodeClient {
  return {
    listSessions: mock(() => Promise.resolve([])),
    createSession: mock(() => Promise.resolve(session())),
    deleteSession: mock(() => Promise.resolve()),
    renameSession: mock(() => Promise.resolve(session())),
    getMessages: mock(() => Promise.resolve([])),
    sendMessage: mock(() => Promise.resolve({
      id: 'm1',
      role: 'assistant',
      parts: [],
      createdAt: '2026-06-23T00:00:00.000Z',
    })),
    subscribeEvents: () => () => undefined,
    listProviders: mock(() => Promise.resolve([])),
    getConfig: mock(() => Promise.resolve({})),
    updateConfig: mock(() => Promise.resolve({})),
    readFile: mock(() => Promise.resolve('')),
    listDirectory: mock(() => Promise.resolve([])),
  } as unknown as OpenCodeClient;
}

describe('session service', () => {
  let client: OpenCodeClient;

  beforeEach(() => {
    client = createMockClient();
  });

  afterEach(() => {
    (client.listSessions as ReturnType<typeof mock>).mockClear?.();
    (client.createSession as ReturnType<typeof mock>).mockClear?.();
    (client.deleteSession as ReturnType<typeof mock>).mockClear?.();
    (client.renameSession as ReturnType<typeof mock>).mockClear?.();
  });

  it('fetchSessions calls listSessions and sorts newest first', async () => {
    const older = session({ id: 's1', title: 'Old', updatedAt: '2026-06-22T00:00:00.000Z' });
    const newer = session({ id: 's2', title: 'New', updatedAt: '2026-06-23T12:00:00.000Z' });
    (client.listSessions as ReturnType<typeof mock>).mockImplementation(() => Promise.resolve([older, newer]));

    const result = await fetchSessions(client);

    expect(client.listSessions).toHaveBeenCalled();
    expect(result.map((s) => s.id)).toEqual(['s2', 's1']);
  });

  it('createSession calls createSession with options', async () => {
    const opts: CreateSessionOptions = { title: 'My Session', path: '/workspace' };
    (client.createSession as ReturnType<typeof mock>).mockImplementation(() =>
      Promise.resolve(session({ id: 's3', title: 'My Session' }))
    );

    const result = await createSession(client, opts);

    expect(client.createSession).toHaveBeenCalledWith(opts);
    expect(result.title).toBe('My Session');
  });

  it('deleteSession calls deleteSession with the id', async () => {
    await deleteSession(client, 's4');

    expect(client.deleteSession).toHaveBeenCalledWith('s4');
  });

  it('renameSession calls renameSession with the id and title', async () => {
    (client.renameSession as ReturnType<typeof mock>).mockImplementation(() =>
      Promise.resolve(session({ id: 's5', title: 'Renamed' }))
    );

    const result = await renameSession(client, 's5', 'Renamed');

    expect(client.renameSession).toHaveBeenCalledWith('s5', 'Renamed');
    expect(result.title).toBe('Renamed');
  });
});

// Store tests import the compiled .svelte.ts module.
import { createSessionsStore } from '../stores/sessions.svelte.js';

describe('sessions store', () => {
  let client: OpenCodeClient;
  let store: ReturnType<typeof createSessionsStore>;

  beforeEach(() => {
    client = createMockClient();
    store = createSessionsStore(client);
  });

  it('loads sessions into reactive state sorted newest first', async () => {
    const a = session({ id: 'a', updatedAt: '2026-06-20T00:00:00.000Z' });
    const b = session({ id: 'b', updatedAt: '2026-06-23T00:00:00.000Z' });
    (client.listSessions as ReturnType<typeof mock>).mockImplementation(() => Promise.resolve([a, b]));

    await store.load();

    expect(store.loading).toBe(false);
    expect(store.error).toBeNull();
    expect(store.sessions.map((s) => s.id)).toEqual(['b', 'a']);
    expect(store.sorted.map((s) => s.id)).toEqual(['b', 'a']);
  });

  it('sets error state when load fails', async () => {
    (client.listSessions as ReturnType<typeof mock>).mockImplementation(() =>
      Promise.reject(new Error('network down'))
    );

    await store.load();

    expect(store.error).toBe('network down');
    expect(store.loading).toBe(false);
  });

  it('create prepends the new session and clears duplicates', async () => {
    const existing = session({ id: 'a', updatedAt: '2026-06-20T00:00:00.000Z' });
    store.sessions = [existing];
    const created = session({ id: 'b', title: 'Created', updatedAt: '2026-06-25T00:00:00.000Z' });
    (client.createSession as ReturnType<typeof mock>).mockImplementation(() => Promise.resolve(created));

    const result = await store.create({ title: 'Created' });

    expect(client.createSession).toHaveBeenCalledWith({ title: 'Created' });
    expect(result?.id).toBe('b');
    expect(store.sessions.map((s) => s.id)).toEqual(['b', 'a']);
  });

  it('sets error state when create fails without mutating the list', async () => {
    const existing = session({ id: 'a' });
    store.sessions = [existing];
    (client.createSession as ReturnType<typeof mock>).mockImplementation(() =>
      Promise.reject(new Error('forbidden'))
    );

    const result = await store.create({ title: 'Bad' });

    expect(result).toBeUndefined();
    expect(store.error).toBe('forbidden');
    expect(store.sessions.map((s) => s.id)).toEqual(['a']);
  });

  it('remove filters the session out after delete succeeds', async () => {
    store.sessions = [session({ id: 'a' }), session({ id: 'b' })];

    const ok = await store.remove('a');

    expect(ok).toBe(true);
    expect(client.deleteSession).toHaveBeenCalledWith('a');
    expect(store.sessions.map((s) => s.id)).toEqual(['b']);
  });

  it('sets error state and keeps session when delete fails', async () => {
    store.sessions = [session({ id: 'a' })];
    (client.deleteSession as ReturnType<typeof mock>).mockImplementation(() =>
      Promise.reject(new Error('not found'))
    );

    const ok = await store.remove('a');

    expect(ok).toBe(false);
    expect(store.error).toBe('not found');
    expect(store.sessions.map((s) => s.id)).toEqual(['a']);
  });

  it('rename replaces the matching session in the list', async () => {
    store.sessions = [session({ id: 'a', title: 'Old' })];
    (client.renameSession as ReturnType<typeof mock>).mockImplementation(() =>
      Promise.resolve(session({ id: 'a', title: 'New' }))
    );

    const result = await store.rename('a', 'New');

    expect(client.renameSession).toHaveBeenCalledWith('a', 'New');
    expect(result?.title).toBe('New');
    expect(store.sessions[0].title).toBe('New');
  });

  it('sets error state and leaves sessions unchanged when rename fails', async () => {
    store.sessions = [session({ id: 'a', title: 'Old' })];
    (client.renameSession as ReturnType<typeof mock>).mockImplementation(() =>
      Promise.reject(new Error('rename failed'))
    );

    const result = await store.rename('a', 'New');

    expect(result).toBeUndefined();
    expect(store.error).toBe('rename failed');
    expect(store.sessions[0].title).toBe('Old');
  });
});
