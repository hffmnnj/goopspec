/**
 * SessionSidebar wiring integration (Wave 12, Task 12.3).
 *
 * The webfront package has no DOM/component render harness, so these tests
 * drive the exact path that `<ProjectRail onSelect>` triggers from inside
 * `<SessionSidebar>`: selecting a project must (1) update the projects store's
 * active project and (2) re-scope the session list through the active-project
 * watcher, propagating `?directory=` to `listSessions`. See ADL Wave 12.
 */
import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import type { OpenCodeClient, Project, Session } from '$lib/api/types.js';
import { createWorkspaceStore } from '$lib/stores/workspace.svelte.js';
import { createProjectsStore } from '$lib/stores/projects.svelte.js';
import { createSessionsStore } from '$lib/stores/sessions.svelte.js';

function project(overrides: Partial<Project> = {}): Project {
  return { id: 'p1', worktree: '/repo/one', time: { created: 1 }, ...overrides };
}

function session(id: string, dir: string): Session {
  return {
    id,
    title: `session for ${dir}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function createMockClient(): OpenCodeClient {
  return {
    listProjects: mock(() => Promise.resolve([])),
    getCurrentProject: mock(() => Promise.resolve(null)),
    getPath: mock(() => Promise.resolve({ path: '/repo' })),
    getVcsInfo: mock(() => Promise.resolve(null)),
    subscribeGlobalEvents: () => ({ close: () => undefined }),
    listSessions: mock((directory?: string) =>
      Promise.resolve([session('s1', directory ?? 'default')])
    ),
    createSession: mock(() => Promise.resolve(session('s1', 'x'))),
    deleteSession: mock(() => Promise.resolve()),
    renameSession: mock(() => Promise.resolve(session('s1', 'x'))),
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

function installMockStorage(): void {
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    writable: true,
    value: {
      localStorage: {
        getItem: (k: string) => storage.get(k) ?? null,
        setItem: (k: string, v: string) => storage.set(k, v),
        removeItem: (k: string) => storage.delete(k),
        clear: () => storage.clear(),
      },
    },
  });
}

function restoreGlobalWindow(): void {
  if (Object.getOwnPropertyDescriptor(globalThis, 'window')) {
    delete (globalThis as Record<string, unknown>).window;
  }
}

describe('SessionSidebar project-rail wiring', () => {
  let client: OpenCodeClient;
  let workspace = createWorkspaceStore();
  let projectsStore = createProjectsStore();
  let sessionsStore = createSessionsStore();
  let stopWatcher: () => void;

  beforeEach(() => {
    installMockStorage();
    client = createMockClient();
    workspace = createWorkspaceStore();
    projectsStore = createProjectsStore(client, workspace);
    sessionsStore = createSessionsStore(client, projectsStore);
    stopWatcher = sessionsStore.initProjectWatcher();
  });

  afterEach(() => {
    stopWatcher();
    sessionsStore.sessions = [];
    projectsStore.reset();
    workspace.reset();
    restoreGlobalWindow();
  });

  it('selecting a project (as the rail does) updates the active project', () => {
    const first = project({ id: 'p1', worktree: '/repo/one' });
    const second = project({ id: 'p2', worktree: '/repo/two' });
    projectsStore.projects = [first, second];

    // Mirrors SessionSidebar.handleProjectSelect → ProjectRail onSelect callback.
    projectsStore.setActiveProject(second);

    expect(projectsStore.activeProject?.id).toBe('p2');
  });

  it('re-scopes the session list to the selected project worktree', async () => {
    const first = project({ id: 'p1', worktree: '/repo/one' });
    const second = project({ id: 'p2', worktree: '/repo/two' });
    projectsStore.projects = [first, second];

    projectsStore.setActiveProject(second);
    // The watcher fires load() asynchronously; await a tick for it to settle.
    await Promise.resolve();
    await sessionsStore.load();

    const calls = (client.listSessions as ReturnType<typeof mock>).mock.calls;
    expect(calls.at(-1)?.[0]).toBe('/repo/two');
    expect(sessionsStore.sorted[0]?.title).toContain('/repo/two');
  });

  it('does not scope the local fallback project (undefined directory)', async () => {
    projectsStore.projects = [project({ id: 'local', worktree: '/local/repo' })];
    projectsStore.setActiveProject(projectsStore.projects[0]);
    await Promise.resolve();
    await sessionsStore.load();

    const calls = (client.listSessions as ReturnType<typeof mock>).mock.calls;
    expect(calls.at(-1)?.[0]).toBeUndefined();
  });
});
