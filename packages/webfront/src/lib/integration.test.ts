/**
 * Phase 2 end-to-end integration test.
 *
 * Exercises the core user path at the store/codec level with the real stores
 * wired together (project data layer, scoped sessions, subagent hierarchy,
 * active-session/chat, and the routing codec + route sync) behind a single
 * mock OpenCode client. This is the cross-cutting check that the individual
 * per-store unit tests do not cover: that a decoded project URL drives an
 * active project, scopes the session list, nests subagent sessions, and that
 * selecting a session loads chat messages with stable, unique keys.
 */
import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import type { Message, OpenCodeClient, Project, Session } from './api/types.js';
import { createChatStore } from './stores/chat.svelte.js';
import { createActiveSessionStore } from './stores/active-session.svelte.js';
import { createProjectsStore } from './stores/projects.svelte.js';
import { createSessionsStore } from './stores/sessions.svelte.js';
import { createWorkspaceStore } from './stores/workspace.svelte.js';
import { buildSessionHierarchy } from './sessions/hierarchy.js';
import { decodeProjectPath, encodeProjectPath } from './routing/path-codec.js';
import { projectRoute, sessionRoute } from './routing/navigation.js';
import { syncSessionRoute } from './routing/route-sync.js';

const PROJECT_A: Project = { id: 'proj-a', worktree: '/repo/alpha', time: { created: 1 } };
const PROJECT_B: Project = { id: 'proj-b', worktree: '/repo/beta', time: { created: 2 } };

function session(id: string, updatedAt: string, parentID?: string): Session {
  return {
    id,
    title: id,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt,
    parentID,
  };
}

function message(id: string, role: Message['role'], createdAt: string): Message {
  return { id, role, parts: [{ type: 'text', text: id }], createdAt };
}

/**
 * Replicates the keying contract used by `MessageList.svelte` so the
 * no-duplicate-keys guarantee (BF-1) is asserted at the data level without
 * mounting the component. Keep this in sync with `MessageList.messageKey`.
 */
function messageKey(msg: Message, index: number): string {
  return msg.id || `${msg.role}-${msg.createdAt}-${index}`;
}

/** Sessions keyed by project worktree, so listSessions can honor `?directory=`. */
const SESSIONS_BY_DIRECTORY: Record<string, Session[]> = {
  [PROJECT_A.worktree]: [
    session('ses-a-root', '2026-01-03T00:00:00.000Z'),
    session('ses-a-child', '2026-01-02T00:00:00.000Z', 'ses-a-root'),
  ],
  [PROJECT_B.worktree]: [session('ses-b-root', '2026-01-04T00:00:00.000Z')],
};

const MESSAGES_BY_SESSION: Record<string, Message[]> = {
  'ses-a-root': [
    message('msg-1', 'user', '2026-01-03T00:00:01.000Z'),
    message('msg-2', 'assistant', '2026-01-03T00:00:02.000Z'),
  ],
};

function createMockClient(): OpenCodeClient {
  return {
    listProjects: mock(() => Promise.resolve([PROJECT_A, PROJECT_B])),
    getCurrentProject: mock(() => Promise.resolve(PROJECT_A)),
    getPath: mock(() => Promise.resolve({ path: PROJECT_A.worktree })),
    getVcsInfo: mock(() => Promise.resolve(null)),
    subscribeGlobalEvents: () => ({ close: () => undefined }),
    listSessions: mock((directory?: string) =>
      Promise.resolve(directory ? (SESSIONS_BY_DIRECTORY[directory] ?? []) : [])
    ),
    createSession: mock(() => Promise.resolve(session('new', '2026-01-05T00:00:00.000Z'))),
    deleteSession: mock(() => Promise.resolve()),
    renameSession: mock((id: string) => Promise.resolve(session(id, '2026-01-05T00:00:00.000Z'))),
    getMessages: mock((sessionId: string) => Promise.resolve(MESSAGES_BY_SESSION[sessionId] ?? [])),
    getSessionDiff: mock(() => Promise.resolve([])),
    sendMessage: mock(() => Promise.resolve(message('m1', 'assistant', '2026-01-03T00:00:03.000Z'))),
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
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
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

describe('phase 2 end-to-end integration', () => {
  let client: OpenCodeClient;
  let workspace: ReturnType<typeof createWorkspaceStore>;
  let projects: ReturnType<typeof createProjectsStore>;
  let sessions: ReturnType<typeof createSessionsStore>;
  let chat: ReturnType<typeof createChatStore>;
  let activeSession: ReturnType<typeof createActiveSessionStore>;
  let stopWatcher: () => void;

  beforeEach(() => {
    installMockStorage();
    client = createMockClient();
    workspace = createWorkspaceStore();
    projects = createProjectsStore(client, workspace);
    sessions = createSessionsStore(client, projects);
    chat = createChatStore(client);
    activeSession = createActiveSessionStore(chat);
    // The real wiring: switching the active project re-scopes the session list.
    stopWatcher = sessions.initProjectWatcher();
  });

  afterEach(() => {
    stopWatcher();
    restoreGlobalWindow();
  });

  it('round-trips a project path through the routing codec', () => {
    const encoded = encodeProjectPath(PROJECT_A.worktree);
    expect(decodeProjectPath(encoded)).toBe(PROJECT_A.worktree);
    expect(projectRoute(PROJECT_A)).toBe(`/${encoded}`);
    expect(sessionRoute(PROJECT_A, 'ses-a-root')).toBe(`/${encoded}/session/ses-a-root`);
  });

  it('decodes a deep-link URL into an active project, scoped sessions, and a loaded chat', async () => {
    // 1. A deep-link URL arrives: /<base64url(path)>/session/<id>
    const url = sessionRoute(PROJECT_A, 'ses-a-root');
    const [, encodedSegment, , sessionId] = url.split('/');
    const decodedPath = decodeProjectPath(encodedSegment);
    expect(decodedPath).toBe(PROJECT_A.worktree);

    // 2. Route sync opens/activates the project and selects the session.
    const result = await syncSessionRoute({
      projectPath: decodedPath,
      sessionId,
      projectsStore: projects,
      sessionsStore: sessions,
      activeSessionStore: activeSession,
    });

    expect(result).toEqual({ status: 'active', sessionId: 'ses-a-root' });

    // 3. Project is active and was sourced from the URL.
    expect(projects.activeProject?.worktree).toBe(PROJECT_A.worktree);

    // 4. Sessions are scoped to the active project's directory.
    expect(client.listSessions).toHaveBeenCalledWith(PROJECT_A.worktree);
    expect(sessions.sorted.map((s) => s.id).sort()).toEqual(['ses-a-child', 'ses-a-root']);

    // 5. Chat target is set and messages are loaded for the selected session.
    expect(activeSession.activeId).toBe('ses-a-root');
    expect(chat.activeSessionId).toBe('ses-a-root');
    expect(client.getMessages).toHaveBeenCalledWith('ses-a-root');
  });

  it('re-scopes the session list when the active project changes', async () => {
    await projects.ensureProjectPath(PROJECT_A.worktree);
    await sessions.load();
    expect(sessions.sessions.map((s) => s.id).sort()).toEqual(['ses-a-child', 'ses-a-root']);

    // Switching the active project fires the watcher, which re-loads sessions.
    projects.openProject(PROJECT_B);
    // Allow the watcher's async load() microtask to settle.
    await Promise.resolve();
    await sessions.load();

    expect(client.listSessions).toHaveBeenLastCalledWith(PROJECT_B.worktree);
    expect(sessions.sessions.map((s) => s.id)).toEqual(['ses-b-root']);
  });

  it('nests subagent sessions under their parent in the scoped list', async () => {
    await projects.ensureProjectPath(PROJECT_A.worktree);
    await sessions.load();

    const tree = buildSessionHierarchy(sessions.sessions);
    expect(tree).toHaveLength(1);
    expect(tree[0].session.id).toBe('ses-a-root');
    expect(tree[0].children.map((c) => c.session.id)).toEqual(['ses-a-child']);
  });

  it('produces unique, stable keys for a representative message set (BF-1)', async () => {
    await syncSessionRoute({
      projectPath: PROJECT_A.worktree,
      sessionId: 'ses-a-root',
      projectsStore: projects,
      sessionsStore: sessions,
      activeSessionStore: activeSession,
    });

    // active-session.select() loads chat history fire-and-forget; await the
    // same load explicitly so we assert against the settled message list.
    await chat.loadHistory('ses-a-root');

    const keys = chat.messages.map((m, i) => messageKey(m, i));
    expect(keys).toHaveLength(2);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('keeps message keys unique even when ids are missing (synthesized fallback)', () => {
    const withMissingIds: Message[] = [
      { id: '', role: 'user', parts: [], createdAt: '2026-01-03T00:00:01.000Z' },
      { id: '', role: 'assistant', parts: [], createdAt: '2026-01-03T00:00:01.000Z' },
    ];
    const keys = withMissingIds.map((m, i) => messageKey(m, i));
    expect(new Set(keys).size).toBe(keys.length);
  });
});
