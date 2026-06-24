import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import type { OpenCodeClient, Project } from '../api/types.js';
import { AVATAR_PALETTE } from '../components/sessions/project-rail.js';
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
    installMockStorage();
    client = createMockClient();
    workspace = createWorkspaceStore();
    store = createProjectsStore(client, workspace);
  });

  afterEach(() => {
    store.reset();
    workspace.reset();
    restoreGlobalWindow();
  });

  describe('refresh / available pool', () => {
    it('hydrates the available pool from the server without auto-populating the rail', async () => {
      const first = project({ id: 'p1', worktree: '/repo/one' });
      const second = project({ id: 'p2', worktree: '/repo/two' });
      (client.listProjects as ReturnType<typeof mock>).mockImplementation(() =>
        Promise.resolve([first, second])
      );

      await store.refresh();

      expect(store.availableProjects.map((p) => p.id)).toEqual(['p1', 'p2']);
      // No persisted opened set + a current project → auto-open exactly one.
      expect(store.openedProjects.length).toBe(1);
    });

    it('auto-opens only the current project when nothing is persisted', async () => {
      const first = project({ id: 'p1', worktree: '/repo/one' });
      const second = project({ id: 'p2', worktree: '/repo/two' });
      (client.listProjects as ReturnType<typeof mock>).mockImplementation(() =>
        Promise.resolve([first, second])
      );
      (client.getCurrentProject as ReturnType<typeof mock>).mockImplementation(() =>
        Promise.resolve(second)
      );

      await store.refresh();

      expect(store.openedProjects.map((p) => p.id)).toEqual(['p2']);
      expect(store.activeProject?.id).toBe('p2');
    });

    it('falls back to a local project when the server is empty', async () => {
      workspace.setWorkspace('/local/repo');

      await store.refresh();

      expect(store.openedProjects).toHaveLength(1);
      expect(store.openedProjects[0]).toEqual(
        expect.objectContaining({ id: 'local', worktree: '/local/repo' })
      );
      expect(store.activeProject?.id).toBe('local');
    });
  });

  describe('openProject', () => {
    it('adds to the opened set, dedupes by id, and sets active', () => {
      const a = project({ id: 'a', worktree: '/repo/a' });
      const b = project({ id: 'b', worktree: '/repo/b' });

      store.openProject(a);
      store.openProject(b);
      store.openProject(a); // duplicate

      expect(store.openedProjects.map((p) => p.id)).toEqual(['a', 'b']);
      expect(store.activeProject?.id).toBe('a');
    });

    it('exposes the opened set through the backwards-compatible `projects` alias', () => {
      const a = project({ id: 'a', worktree: '/repo/a' });
      store.openProject(a);
      expect(store.projects.map((p) => p.id)).toEqual(['a']);
    });

    it('persists opened projects to localStorage', () => {
      const storage = installMockStorage();
      store = createProjectsStore(client, workspace);
      store.openProject(project({ id: 'a', worktree: '/repo/a' }));

      const raw = storage.get('goopspec-opened-projects');
      expect(raw).toBeDefined();
      const parsed = JSON.parse(raw as string);
      expect(parsed).toHaveLength(1);
      expect(parsed[0]).toEqual(expect.objectContaining({ id: 'a', worktree: '/repo/a' }));
    });

    it('restores opened projects across a reload', async () => {
      const storage = installMockStorage();
      store = createProjectsStore(client, workspace);
      store.openProject(project({ id: 'a', worktree: '/repo/a' }));
      store.openProject(project({ id: 'b', worktree: '/repo/b' }));

      // Simulate reload: a fresh store reading the same storage + server list.
      const reloaded = createProjectsStore(createMockClient(), createWorkspaceStore());
      void storage; // storage persists across the new store
      await reloaded.refresh();

      expect(reloaded.openedProjects.map((p) => p.id)).toEqual(['a', 'b']);
    });

    it('unopenedAvailable excludes already-opened projects', async () => {
      const a = project({ id: 'a', worktree: '/repo/a' });
      const b = project({ id: 'b', worktree: '/repo/b' });
      (client.listProjects as ReturnType<typeof mock>).mockImplementation(() =>
        Promise.resolve([a, b])
      );
      await store.refresh();
      store.openProject(a);

      expect(store.unopenedAvailable().map((p) => p.id)).toEqual(['b']);
    });
  });

  describe('closeProject', () => {
    it('removes a project from the rail', () => {
      store.openProject(project({ id: 'a', worktree: '/repo/a' }));
      store.openProject(project({ id: 'b', worktree: '/repo/b' }));

      store.closeProject('a');

      expect(store.openedProjects.map((p) => p.id)).toEqual(['b']);
    });

    it('switches active to another opened project when the active one closes', () => {
      const a = project({ id: 'a', worktree: '/repo/a' });
      const b = project({ id: 'b', worktree: '/repo/b' });
      store.openProject(a);
      store.openProject(b);
      store.setActiveProject(b);

      store.closeProject('b');

      expect(store.activeProject?.id).toBe('a');
    });

    it('sets active to null when the last project closes', () => {
      store.openProject(project({ id: 'a', worktree: '/repo/a' }));
      store.closeProject('a');

      expect(store.openedProjects).toHaveLength(0);
      expect(store.activeProject).toBeNull();
    });
  });

  describe('color assignment', () => {
    it('assigns a unique palette index to each of the first N opened projects', () => {
      const count = Math.min(AVATAR_PALETTE.length, 50);
      for (let i = 0; i < count; i++) {
        store.openProject(project({ id: `id-${i}`, worktree: `/repo/${i}` }));
      }

      const indices = store.openedProjects.map((p) => store.colorIndexFor(p.id));
      expect(new Set(indices).size).toBe(count);
      expect(indices.every((idx) => idx >= 0 && idx < AVATAR_PALETTE.length)).toBe(true);
    });

    it('keeps a color index stable when other projects close', () => {
      const a = project({ id: 'a', worktree: '/repo/a' });
      const b = project({ id: 'b', worktree: '/repo/b' });
      store.openProject(a);
      store.openProject(b);
      const bIndex = store.colorIndexFor('b');

      store.closeProject('a');

      expect(store.colorIndexFor('b')).toBe(bIndex);
    });

    it('persists and restores the assigned color index', async () => {
      const storage = installMockStorage();
      store = createProjectsStore(client, workspace);
      store.openProject(project({ id: 'a', worktree: '/repo/a' }));
      store.openProject(project({ id: 'b', worktree: '/repo/b' }));
      const aIndex = store.colorIndexFor('a');
      const bIndex = store.colorIndexFor('b');

      const reloaded = createProjectsStore(createMockClient(), createWorkspaceStore());
      void storage;
      await reloaded.refresh();

      expect(reloaded.colorIndexFor('a')).toBe(aIndex);
      expect(reloaded.colorIndexFor('b')).toBe(bIndex);
    });
  });

  describe('active project persistence', () => {
    it('persists the active project id', () => {
      const storage = installMockStorage();
      store = createProjectsStore(client, workspace);
      const selected = project({ id: 'p2', worktree: '/repo/two' });
      store.openProject(project());
      store.openProject(selected);

      store.setActiveProject(selected);

      expect(storage.get('goopspec-active-project-id')).toBe('p2');
    });

    it('restores the persisted active project during refresh', async () => {
      installMockStorage(
        new Map([
          [
            'goopspec-opened-projects',
            JSON.stringify([
              { id: 'p1', worktree: '/repo/one', colorIndex: 0 },
              { id: 'p2', worktree: '/repo/two', colorIndex: 1 },
            ]),
          ],
          ['goopspec-active-project-id', 'p2'],
        ])
      );
      store = createProjectsStore(client, workspace);

      await store.refresh();

      expect(store.activeProject?.id).toBe('p2');
    });
  });

  it('singleton is exported', () => {
    expect(projects).toBeDefined();
  });
});
