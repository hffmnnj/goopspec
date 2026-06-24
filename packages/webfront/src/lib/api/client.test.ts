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

  afterEach(() => {
    globalThis.fetch = originalFetch;
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
