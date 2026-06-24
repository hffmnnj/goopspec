import { describe, beforeEach, afterEach, it, expect } from 'bun:test';
import { createWorkspaceStore, workspace, formatWorkspacePath } from './workspace.svelte';

function restoreGlobalWindow(): void {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  if (descriptor) {
    Object.defineProperty(globalThis, 'window', descriptor);
  } else {
    delete (globalThis as Record<string, unknown>).window;
  }
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

describe('workspace store', () => {
  let store: ReturnType<typeof createWorkspaceStore>;

  beforeEach(() => {
    store = createWorkspaceStore();
  });

  afterEach(() => {
    store.reset();
    restoreGlobalWindow();
  });

  it('starts with no current path and empty recents', () => {
    expect(store.currentPath).toBeNull();
    expect(store.recentPaths).toEqual([]);
  });

  it('setWorkspace updates current and adds to recents', () => {
    installMockStorage();

    store.setWorkspace('/home/user/project-a');

    expect(store.currentPath).toBe('/home/user/project-a');
    expect(store.recentPaths).toEqual(['/home/user/project-a']);
  });

  it('setWorkspace deduplicates and reorders recents', () => {
    installMockStorage();

    store.setWorkspace('/home/user/project-a');
    store.setWorkspace('/home/user/project-b');
    store.setWorkspace('/home/user/project-a');

    expect(store.recentPaths).toEqual([
      '/home/user/project-a',
      '/home/user/project-b',
    ]);
  });

  it('setWorkspace caps the recent list', () => {
    installMockStorage();

    for (let i = 0; i < 15; i += 1) {
      store.setWorkspace(`/home/user/project-${i}`);
    }

    expect(store.recentPaths.length).toBeLessThanOrEqual(12);
    expect(store.recentPaths[0]).toBe('/home/user/project-14');
  });

  it('addRecent appends without changing current', () => {
    installMockStorage();

    store.setWorkspace('/home/user/project-a');
    store.addRecent('/home/user/project-b');

    expect(store.currentPath).toBe('/home/user/project-a');
    expect(store.recentPaths).toEqual([
      '/home/user/project-a',
      '/home/user/project-b',
    ]);
  });

  it('removeRecent removes a path and clears current if it matches', () => {
    installMockStorage();

    store.setWorkspace('/home/user/project-a');
    store.setWorkspace('/home/user/project-b');
    store.removeRecent('/home/user/project-b');

    expect(store.currentPath).toBeNull();
    expect(store.recentPaths).toEqual(['/home/user/project-a']);
  });

  it('removeRecent keeps current when removing a different path', () => {
    installMockStorage();

    store.setWorkspace('/home/user/project-a');
    store.setWorkspace('/home/user/project-b');
    store.removeRecent('/home/user/project-a');

    expect(store.currentPath).toBe('/home/user/project-b');
    expect(store.recentPaths).toEqual(['/home/user/project-b']);
  });

  it('persists state to localStorage', () => {
    const storage = installMockStorage();

    store.setWorkspace('/home/user/project-a');
    store.addRecent('/home/user/project-b');

    expect(JSON.parse(storage.get('goopspec-workspaces') ?? '{}')).toEqual({
      current: '/home/user/project-a',
      recent: ['/home/user/project-a', '/home/user/project-b'],
    });
  });

  it('initializes current from persisted choice', () => {
    installMockStorage(
      new Map([
        [
          'goopspec-workspaces',
          JSON.stringify({
            current: '/home/user/persisted',
            recent: ['/home/user/persisted', '/home/user/other'],
          }),
        ],
      ])
    );

    store.init();

    expect(store.currentPath).toBe('/home/user/persisted');
    expect(store.recentPaths).toEqual(['/home/user/persisted', '/home/user/other']);
  });

  it('initializes current from server working directory when nothing is persisted', () => {
    installMockStorage();

    store.init('/server/working/dir');

    expect(store.currentPath).toBe('/server/working/dir');
    expect(store.recentPaths).toEqual(['/server/working/dir']);
  });

  it('prefers persisted current over server working directory', () => {
    const storage = installMockStorage(
      new Map([
        [
          'goopspec-workspaces',
          JSON.stringify({
            current: '/home/user/persisted',
            recent: ['/home/user/persisted'],
          }),
        ],
      ])
    );

    store.init('/server/working/dir');

    expect(store.currentPath).toBe('/home/user/persisted');
    expect(storage.get('goopspec-workspaces')).toContain('/home/user/persisted');
  });

  it('falls back to null when nothing is available', () => {
    installMockStorage();

    store.init();

    expect(store.currentPath).toBeNull();
    expect(store.recentPaths).toEqual([]);
  });

  it('ignores malformed localStorage entries', () => {
    const storage = installMockStorage(
      new Map([['goopspec-workspaces', 'not valid json']])
    );

    store.init('/server/working/dir');

    expect(store.currentPath).toBe('/server/working/dir');
    expect(storage.get('goopspec-workspaces')).toContain('/server/working/dir');
  });

  it('normalizes trailing slashes in paths', () => {
    installMockStorage();

    store.setWorkspace('/home/user/project-a/');

    expect(store.currentPath).toBe('/home/user/project-a');
    expect(store.recentPaths).toEqual(['/home/user/project-a']);
  });

  it('formatWorkspacePath shows the last two segments', () => {
    expect(formatWorkspacePath('/home/user/project-a')).toBe('user/project-a');
  });

  it('formatWorkspacePath shows single segment when path is shallow', () => {
    expect(formatWorkspacePath('project-a')).toBe('project-a');
  });

  it('formatWorkspacePath returns placeholder for null', () => {
    expect(formatWorkspacePath(null)).toBe('No workspace');
  });

  it('singleton is exported', () => {
    expect(workspace).toBeDefined();
    expect(workspace.currentPath).toBeNull();
  });
});
