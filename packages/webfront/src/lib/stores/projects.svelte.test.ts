import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import type { OpenCodeClient, Project } from '../api/types.js';
import { createWorkspaceStore } from './workspace.svelte';
import { createProjectsStore, projects } from './projects.svelte';

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: 'p1',
    worktree: '/repo/one',
    time: { created: 1 },
    ...overrides,
  };
}

function createMockClient(): OpenCodeClient {
  return {
    listProjects: mock(() => Promise.resolve([])),
    getCurrentProject: mock(() => Promise.resolve(null)),
    getPath: mock(() => Promise.resolve({ path: '/repo' })),
    getVcsInfo: mock(() => Promise.resolve(null)),
    subscribeGlobalEvents: () => ({ close: () => undefined }),
    listSessions: mock(() => Promise.resolve([])),
    createSession: mock(() => Promise.resolve({ id: 's1', title: '', createdAt: '', updatedAt: '' })),
    deleteSession: mock(() => Promise.resolve()),
    renameSession: mock(() => Promise.resolve({ id: 's1', title: '', createdAt: '', updatedAt: '' })),
    getMessages: mock(() => Promise.resolve([])),
    sendMessage: mock(() => Promise.resolve({ id: 'm1', role: 'assistant', parts: [], createdAt: '' })),
    subscribeEvents: () => () => undefined,
    listProviders: mock(() => Promise.resolve([])),
    getConfig: mock(() => Promise.resolve({})),
    updateConfig: mock(() => Promise.resolve({})),
    readFile: mock(() => Promise.resolve('')),
    listDirectory: mock(() => Promise.resolve([])),
  } as unknown as OpenCodeClient;
}

function installMockStorage(initial: Map<string, string> = new Map()): Map<string, string> {
  const storage = new Map(initial);
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
  return storage;
}

function restoreGlobalWindow(): void {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  if (descriptor) {
    delete (globalThis as Record<string, unknown>).window;
  }
}

describe('projects store', () => {
  let client: OpenCodeClient;
  let workspace = createWorkspaceStore();
  let store: ReturnType<typeof createProjectsStore>;

  beforeEach(() => {
    client = createMockClient();
    workspace = createWorkspaceStore();
    store = createProjectsStore(client, workspace);
    installMockStorage();
  });

  afterEach(() => {
    store.reset();
    workspace.reset();
    restoreGlobalWindow();
  });

  it('hydrates projects and current project from the server', async () => {
    const first = project({ id: 'p1', worktree: '/repo/one' });
    const second = project({ id: 'p2', worktree: '/repo/two' });
    (client.listProjects as ReturnType<typeof mock>).mockImplementation(() => Promise.resolve([first, second]));
    (client.getCurrentProject as ReturnType<typeof mock>).mockImplementation(() => Promise.resolve(second));

    await store.refresh();

    expect(store.loading).toBe(false);
    expect(store.error).toBeNull();
    expect(store.projects.map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(store.activeProject?.id).toBe('p2');
  });

  it('selects and persists the active project id', () => {
    const storage = installMockStorage();
    const selected = project({ id: 'p2', worktree: '/repo/two' });
    store.projects = [project(), selected];

    store.setActiveProject(selected);

    expect(store.activeProject).toEqual(selected);
    expect(storage.get('goopspec-active-project-id')).toBe('p2');
  });

  it('restores the active project from localStorage', () => {
    installMockStorage(new Map([['goopspec-active-project-id', 'p2']]));
    const selected = project({ id: 'p2', worktree: '/repo/two' });
    store.projects = [project(), selected];

    store.initFromLocalStorage();

    expect(store.activeProject).toEqual(selected);
  });

  it('uses the persisted project during refresh when it exists', async () => {
    installMockStorage(new Map([['goopspec-active-project-id', 'p1']]));
    const first = project({ id: 'p1', worktree: '/repo/one' });
    const second = project({ id: 'p2', worktree: '/repo/two' });
    (client.listProjects as ReturnType<typeof mock>).mockImplementation(() => Promise.resolve([first, second]));
    (client.getCurrentProject as ReturnType<typeof mock>).mockImplementation(() => Promise.resolve(second));

    await store.refresh();

    expect(store.activeProject?.id).toBe('p1');
  });

  it('creates a local fallback project when the server returns no projects', async () => {
    workspace.setWorkspace('/local/repo');

    await store.refresh();

    expect(store.projects).toHaveLength(1);
    expect(store.projects[0]).toEqual(expect.objectContaining({ id: 'local', worktree: '/local/repo' }));
    expect(store.activeProject?.id).toBe('local');
  });

  it('falls back to root when no workspace path is available', async () => {
    await store.refresh();

    expect(store.projects[0].worktree).toBe('/');
    expect(store.activeProject?.worktree).toBe('/');
  });

  it('singleton is exported', () => {
    expect(projects).toBeDefined();
  });
});
