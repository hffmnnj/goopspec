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

  it('normalizes provider payload shapes to arrays with model maps', async () => {
    const shapes = [
      [{ id: 'openai', name: 'OpenAI', models: [{ id: 'gpt-4o', name: 'GPT-4o' }] }],
      { providers: [{ id: 'openai', name: 'OpenAI', models: [{ id: 'gpt-4o', name: 'GPT-4o' }] }] },
      { providers: { openai: { name: 'OpenAI', models: { 'gpt-4o': { name: 'GPT-4o' } } } }, default: { openai: 'gpt-4o' } },
      null,
    ];

    for (const shape of shapes) {
      const fetchMock = mock(() => Promise.resolve(jsonResponse(shape)));
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      const providers = await createClient('http://localhost:4096').listProviders();

      expect(Array.isArray(providers)).toBe(true);
      if (shape) {
        expect(providers).toEqual([
          expect.objectContaining({
            id: 'openai',
            name: 'OpenAI',
            models: [expect.objectContaining({ id: 'gpt-4o', name: 'GPT-4o' })],
          }),
        ]);
      } else {
        expect(providers).toEqual([]);
      }
    }
  });

  it('falls back to GET /provider when GET /config/providers is unavailable', async () => {
    const fetchMock = mock((url: string) => {
      if (url.endsWith('/config/providers')) return Promise.resolve(jsonResponse({ error: 'missing' }, { status: 404, statusText: 'Not Found' }));
      return Promise.resolve(jsonResponse([{ id: 'anthropic', name: 'Anthropic', models: [] }]));
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(createClient('http://localhost:4096').listProviders()).resolves.toEqual([
      { id: 'anthropic', name: 'Anthropic', models: [] },
    ]);
  });

  it('normalizes agent payload shapes to arrays', async () => {
    const fetchMock = mock(() => Promise.resolve(jsonResponse({ agents: { 'goop-orchestrator': { description: 'Plan work' } } })));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(createClient('http://localhost:4096').listAgents()).resolves.toEqual([
      expect.objectContaining({ id: 'goop-orchestrator', name: 'goop-orchestrator', description: 'Plan work' }),
    ]);
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:4096/agent', expect.any(Object));
  });

  it('lists commands from a bare array (GET /command)', async () => {
    const fetchMock = mock(() => Promise.resolve(jsonResponse([
      { name: 'help', description: 'Show help' },
      { name: 'commit', description: 'Commit changes', template: 'commit $ARGUMENTS', subtask: false },
    ])));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(createClient('http://localhost:4096').listCommands()).resolves.toEqual([
      { name: 'help', description: 'Show help' },
      { name: 'commit', description: 'Commit changes', template: 'commit $ARGUMENTS', subtask: false },
    ]);
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:4096/command', expect.any(Object));
  });

  it('normalizes a wrapped { commands: [] } payload to an array', async () => {
    const fetchMock = mock(() => Promise.resolve(jsonResponse({ commands: [{ name: 'help' }] })));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(createClient('http://localhost:4096').listCommands()).resolves.toEqual([
      { name: 'help' },
    ]);
  });

  it('normalizes an object-map command payload to an array', async () => {
    const fetchMock = mock(() => Promise.resolve(jsonResponse({ help: { description: 'Show help' }, clear: {} })));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await createClient('http://localhost:4096').listCommands();
    expect(result).toEqual([
      { name: 'help', description: 'Show help' },
      { name: 'clear' },
    ]);
  });

  it('normalizes a null command payload to an empty array', async () => {
    const fetchMock = mock(() => Promise.resolve(jsonResponse(null)));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(createClient('http://localhost:4096').listCommands()).resolves.toEqual([]);
  });

  it('runs a command via POST /session/{id}/command', async () => {
    const fetchMock = mock(() => Promise.resolve(jsonResponse({
      info: { id: 'msg-1', role: 'assistant', time: { created: 1760000000000 } },
      parts: [{ id: 'p1', type: 'text', text: 'done' }],
    })));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      createClient('http://localhost:4096').runCommand('s 1', { command: 'commit', arguments: 'tighten copy', agent: 'goop-orchestrator' })
    ).resolves.toEqual(
      expect.objectContaining({ id: 'msg-1', role: 'assistant', parts: [{ type: 'text', text: 'done' }] })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4096/session/s%201/command',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ command: 'commit', arguments: 'tighten copy', agent: 'goop-orchestrator' }),
      })
    );
  });

  it('normalizes OpenCode message envelopes from GET /session/{id}/message', async () => {
    const fetchMock = mock(() => Promise.resolve(jsonResponse([
      {
        info: { id: 'msg-user', role: 'user', time: { created: 1760000000000 } },
        parts: [{ id: 'part-1', type: 'text', text: 'hello' }]
      },
      {
        info: { id: 'msg-assistant', role: 'assistant', providerID: 'anthropic', modelID: 'claude', time: { created: 1760000001000 } },
        parts: [{ id: 'part-2', type: 'text', text: 'hi' }]
      }
    ])));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(createClient('http://localhost:4096').getMessages('s1')).resolves.toEqual([
      expect.objectContaining({ id: 'msg-user', role: 'user', parts: [{ type: 'text', text: 'hello' }] }),
      expect.objectContaining({ id: 'msg-assistant', role: 'assistant', provider: 'anthropic', model: 'claude', parts: [{ type: 'text', text: 'hi' }] })
    ]);
  });

  it('normalizes OpenCode session time and parentID fields', async () => {
    const fetchMock = mock(() => Promise.resolve(jsonResponse([
      { id: 'parent', title: 'Parent', time: { created: 1760000000000, updated: 1760000001000 } },
      { id: 'child', title: 'Child', parentID: 'parent', time: { created: 1760000002000, updated: 1760000003000 } }
    ])));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(createClient('http://localhost:4096').listSessions()).resolves.toEqual([
      expect.objectContaining({ id: 'parent', createdAt: '2025-10-09T08:53:20.000Z', updatedAt: '2025-10-09T08:53:21.000Z' }),
      expect.objectContaining({ id: 'child', parentID: 'parent', createdAt: '2025-10-09T08:53:22.000Z', updatedAt: '2025-10-09T08:53:23.000Z' })
    ]);
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
