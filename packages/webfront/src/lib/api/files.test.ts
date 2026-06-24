import { afterEach, describe, expect, it, mock } from 'bun:test';
import { createClient } from './client.js';
import { extensionOf, fileKind, listDirectory, readFile } from './files.js';
import type { FileEntry, OpenCodeClient } from './types.js';

function entry(overrides: Partial<FileEntry> = {}): FileEntry {
  return { name: 'file.ts', path: 'file.ts', type: 'file', ...overrides };
}

function createMockClient(): OpenCodeClient {
  return {
    listSessions: mock(() => Promise.resolve([])),
    createSession: mock(() => Promise.resolve({ id: 's', title: '', createdAt: '', updatedAt: '' })),
    deleteSession: mock(() => Promise.resolve()),
    renameSession: mock(() => Promise.resolve({ id: 's', title: '', createdAt: '', updatedAt: '' })),
    getMessages: mock(() => Promise.resolve([])),
    sendMessage: mock(() => Promise.resolve({ id: 'm', role: 'assistant', parts: [], createdAt: '' })),
    subscribeEvents: () => () => undefined,
    listProviders: mock(() => Promise.resolve([])),
    getConfig: mock(() => Promise.resolve({})),
    updateConfig: mock(() => Promise.resolve({})),
    readFile: mock(() => Promise.resolve('contents')),
    listDirectory: mock(() => Promise.resolve([entry()]))
  } as unknown as OpenCodeClient;
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init
  });
}

describe('file service', () => {
  it('readFile delegates to the client with the given path', async () => {
    const client = createMockClient();

    const result = await readFile(client, 'src/index.ts');

    expect(client.readFile).toHaveBeenCalledWith('src/index.ts');
    expect(result).toBe('contents');
  });

  it('listDirectory delegates to the client with the given path', async () => {
    const client = createMockClient();

    const result = await listDirectory(client, 'src');

    expect(client.listDirectory).toHaveBeenCalledWith('src');
    expect(result).toEqual([entry()]);
  });
});

describe('file kind classification', () => {
  it('returns the lowercased extension', () => {
    expect(extensionOf('Component.SVELTE')).toBe('svelte');
    expect(extensionOf('archive.tar.gz')).toBe('gz');
  });

  it('returns empty string for dotfiles and extensionless names', () => {
    expect(extensionOf('.gitignore')).toBe('');
    expect(extensionOf('README')).toBe('');
    expect(extensionOf('trailing.')).toBe('');
  });

  it('classifies directories, code, images and text', () => {
    expect(fileKind({ name: 'src', type: 'directory' })).toBe('directory');
    expect(fileKind({ name: 'app.ts', type: 'file' })).toBe('code');
    expect(fileKind({ name: 'page.svelte', type: 'file' })).toBe('code');
    expect(fileKind({ name: 'logo.png', type: 'file' })).toBe('image');
    expect(fileKind({ name: 'notes.md', type: 'file' })).toBe('text');
    expect(fileKind({ name: 'LICENSE', type: 'file' })).toBe('text');
  });
});

describe('OpenCode REST client — listDirectory', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('requests GET /file?path= and normalizes object entries', async () => {
    const payload = [
      { name: 'src', type: 'directory' },
      { name: 'readme.md', type: 'file', size: 12 }
    ];
    const fetchMock = mock(() => Promise.resolve(jsonResponse(payload)));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await createClient('http://localhost:4096').listDirectory('.');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4096/file?path=.',
      expect.objectContaining({ headers: expect.objectContaining({ Accept: 'application/json' }) })
    );
    expect(result).toEqual([
      { name: 'src', path: 'src', type: 'directory' },
      { name: 'readme.md', path: 'readme.md', type: 'file', size: 12 }
    ]);
  });

  it('sorts directories before files, then alphabetically', async () => {
    const payload = [
      { name: 'zebra.ts', type: 'file' },
      { name: 'lib', type: 'directory' },
      { name: 'app.ts', type: 'file' },
      { name: 'assets', type: 'directory' }
    ];
    globalThis.fetch = mock(() => Promise.resolve(jsonResponse(payload))) as unknown as typeof fetch;

    const result = await createClient('http://localhost:4096').listDirectory('src');

    expect(result.map((e) => e.name)).toEqual(['assets', 'lib', 'app.ts', 'zebra.ts']);
  });

  it('tolerates an { entries } wrapper and bare-string entries', async () => {
    const payload = { entries: ['index.ts', 'components/'] };
    globalThis.fetch = mock(() => Promise.resolve(jsonResponse(payload))) as unknown as typeof fetch;

    const result = await createClient('http://localhost:4096').listDirectory('src');

    expect(result).toEqual([
      { name: 'components', path: 'src/components', type: 'directory' },
      { name: 'index.ts', path: 'src/index.ts', type: 'file' }
    ]);
  });

  it('derives path from name when the server omits it', async () => {
    const payload = [{ name: 'nested', isDirectory: true }];
    globalThis.fetch = mock(() => Promise.resolve(jsonResponse(payload))) as unknown as typeof fetch;

    const result = await createClient('http://localhost:4096').listDirectory('a/b');

    expect(result).toEqual([{ name: 'nested', path: 'a/b/nested', type: 'directory' }]);
  });
});
