import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { DEFAULT_SERVER_URL, getServerUrl, setServerUrl } from './config';
import { createClient, parseSSEEvent } from './client';

function createStorage(): Storage {
  const values = new Map<string, string>();

  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value)
  };
}

function setMockWindow(storage: Storage | undefined): void {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: storage ? { localStorage: storage } : undefined
  });
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init
  });
}

describe('OpenCode server config', () => {
  let storage: Storage;

  beforeEach(() => {
    storage = createStorage();
    setMockWindow(storage);
  });

  afterEach(() => {
    storage.clear();
    setMockWindow(undefined);
  });

  it('uses the default server URL when no runtime URL is configured', () => {
    expect(getServerUrl()).toBe(DEFAULT_SERVER_URL);
  });

  it('prefers the runtime localStorage URL and normalizes trailing slashes', () => {
    setServerUrl('http://localhost:7777///');

    expect(getServerUrl()).toBe('http://localhost:7777');
  });
});

describe('OpenCode REST client', () => {
  const originalFetch = globalThis.fetch;
  const originalEventSource = globalThis.EventSource;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    Object.defineProperty(globalThis, 'EventSource', { configurable: true, value: originalEventSource });
  });

  it('lists projects from GET /project', async () => {
    const projects = [{ id: 'p1', worktree: '/repo', time: { created: 1 }, vcs: 'git' as const }];
    const fetchMock = mock(() => Promise.resolve(jsonResponse(projects)));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(createClient('http://localhost:4096').listProjects()).resolves.toEqual(projects);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4096/project',
      expect.objectContaining({ headers: expect.objectContaining({ Accept: 'application/json' }) })
    );
  });

  it('loads the current project from GET /project/current', async () => {
    const project = { id: 'p1', worktree: '/repo', time: { created: 1 } };
    const fetchMock = mock(() => Promise.resolve(jsonResponse(project)));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(createClient('http://localhost:4096').getCurrentProject()).resolves.toEqual(project);
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:4096/project/current', expect.any(Object));
  });

  it('loads the server path from GET /path', async () => {
    const fetchMock = mock(() => Promise.resolve(jsonResponse({ path: '/repo' })));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(createClient('http://localhost:4096').getPath()).resolves.toEqual({ path: '/repo' });
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:4096/path', expect.any(Object));
  });

  it('loads vcs info from GET /vcs', async () => {
    const vcs = { branch: 'main', dirty: true, ahead: 1, behind: 2 };
    const fetchMock = mock(() => Promise.resolve(jsonResponse(vcs)));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(createClient('http://localhost:4096').getVcsInfo()).resolves.toEqual(vcs);
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:4096/vcs', expect.any(Object));
  });

  it('subscribes to the global event stream', () => {
    const close = mock(() => undefined);
    const created: { url: string; source: EventSource; close: typeof close }[] = [];
    class MockEventSource {
      onmessage: ((event: MessageEvent<string>) => void) | null = null;
      constructor(readonly url: string) {
        created.push({ url, source: this as unknown as EventSource, close });
      }
      close = close;
    }
    Object.defineProperty(globalThis, 'EventSource', { configurable: true, value: MockEventSource });
    const handler = mock(() => undefined);

    const subscription = createClient('http://localhost:4096').subscribeGlobalEvents(handler);
    created[0].source.onmessage?.({ data: JSON.stringify({ type: 'project.updated', id: 'p1' }) } as MessageEvent<string>);
    subscription.close();

    expect(created[0].url).toBe('http://localhost:4096/event');
    expect(handler).toHaveBeenCalledWith({ type: 'project.updated', id: 'p1' });
    expect(close).toHaveBeenCalled();
  });

  it('lists sessions from GET /session', async () => {
    const fetchMock = mock(() => Promise.resolve(jsonResponse([{ id: 's1', title: 'One', createdAt: 'now', updatedAt: 'now' }])));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(createClient('http://localhost:4096').listSessions()).resolves.toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4096/session',
      expect.objectContaining({ headers: expect.objectContaining({ Accept: 'application/json' }) })
    );
  });

  it('adds directory query params when listing sessions', async () => {
    const fetchMock = mock(() => Promise.resolve(jsonResponse([])));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await createClient('http://localhost:4096').listSessions('/home/user/project a');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4096/session?directory=%2Fhome%2Fuser%2Fproject+a',
      expect.any(Object)
    );
  });

  it('creates sessions with POST /session', async () => {
    const session = { id: 's1', title: 'New', createdAt: 'now', updatedAt: 'now' };
    const fetchMock = mock(() => Promise.resolve(jsonResponse(session)));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(createClient('http://localhost:4096').createSession({ title: 'New' })).resolves.toEqual(session);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4096/session',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ title: 'New' }) })
    );
  });

  it('passes session directory in body and query when creating sessions', async () => {
    const session = { id: 's1', title: 'New', createdAt: 'now', updatedAt: 'now' };
    const fetchMock = mock(() => Promise.resolve(jsonResponse(session)));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await createClient('http://localhost:4096').createSession({ title: 'New', directory: '/repo' });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4096/session?directory=%2Frepo',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ title: 'New', directory: '/repo' }) })
    );
  });

  it('adds directory query params when sending messages', async () => {
    const message = { id: 'm1', role: 'assistant', parts: [], createdAt: 'now' };
    const fetchMock = mock(() => Promise.resolve(jsonResponse(message)));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await createClient('http://localhost:4096').sendMessage('s1', { text: 'hello' }, '/repo');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4096/session/s1/message?directory=%2Frepo',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ text: 'hello' }) })
    );
  });

  it('deletes sessions with DELETE /session/{id}', async () => {
    const fetchMock = mock(() => Promise.resolve(new Response(null, { status: 204 })));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(createClient('http://localhost:4096').deleteSession('abc 123')).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4096/session/abc%20123',
      expect.objectContaining({ method: 'DELETE' })
    );
  });
});

describe('OpenCode SSE parsing', () => {
  it('maps text part events to the typed event union', () => {
    expect(parseSSEEvent('message.part.text', JSON.stringify({ messageId: 'm1', text: 'hello' }))).toEqual(
      expect.objectContaining({ type: 'message.part.text', messageId: 'm1', text: 'hello' })
    );
  });

  it('maps tool invocation events to a typed message part', () => {
    expect(
      parseSSEEvent('message.part.tool-invoke', JSON.stringify({ messageId: 'm1', tool: 'read', input: { path: 'README.md' } }))
    ).toEqual(
      expect.objectContaining({
        type: 'message.part.tool-invoke',
        messageId: 'm1',
        part: { type: 'tool-invoke', tool: 'read', input: { path: 'README.md' }, id: undefined }
      })
    );
  });

  it('ignores unknown event types', () => {
    expect(parseSSEEvent('unknown.event', '{}')).toBeUndefined();
  });
});
