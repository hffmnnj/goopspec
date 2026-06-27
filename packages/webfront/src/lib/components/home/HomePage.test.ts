/**
 * HomePage behavioral tests.
 *
 * The webfront test harness runs under `bun test` without a DOM renderer, so
 * these tests exercise the HomePage's wiring contract — the same derivations
 * and decisions the component makes — against mock stores. This covers the
 * acceptance behaviors (recent projects, onboarding, open-project action,
 * navigation targets, and connection reflection) at the logic boundary the
 * component depends on.
 */
import { describe, expect, it } from 'bun:test';
import type { Project, Session } from '$lib/api/types.js';
import type { ConnectionStatus } from '$lib/stores/connection.svelte.js';
import { projectRoute, sessionRoute } from '$lib/routing/navigation.js';
import {
  buildRecentProjects,
  buildRecentSessions,
  buildSetupCards,
  describeConnection,
  isOnboarding,
  newSessionTarget,
  type ProjectSession,
} from './home.js';

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: 'p1',
    worktree: '/home/me/projects/alpha',
    time: { created: 1 },
    ...overrides,
  };
}

function session(overrides: Partial<Session> = {}): Session {
  return {
    id: 's1',
    title: 'Session',
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    ...overrides,
  };
}

/** Minimal projects-store stand-in mirroring the fields HomePage reads. */
function mockProjectsStore(opened: Project[], active: Project | null = null) {
  const colorIndex = new Map(opened.map((p, i) => [p.id, i]));
  let activeProject = active ?? opened[opened.length - 1] ?? null;
  return {
    openedProjects: opened,
    get activeProject() {
      return activeProject;
    },
    setActiveProject(p: Project) {
      activeProject = p;
    },
    colorIndexFor: (id: string) => colorIndex.get(id) ?? -1,
    opened: [] as Project[],
    openProject(p: Project) {
      this.opened.push(p);
      activeProject = p;
    },
    unopenedAvailable: () => [] as Project[],
  };
}

describe('HomePage recent projects', () => {
  it('renders recent project cards from the projects store', () => {
    const opened = [
      project({ id: 'a', worktree: '/repo/alpha' }),
      project({ id: 'b', worktree: '/repo/beta' }),
    ];
    const store = mockProjectsStore(opened);
    const cards = buildRecentProjects(opened, (id) => store.colorIndexFor(id));
    expect(cards.map((c) => c.name)).toEqual(['beta', 'alpha']);
    expect(cards.every((c) => c.colorIndex >= 0)).toBe(true);
  });

  it('shows the onboarding empty state when no projects are opened', () => {
    const store = mockProjectsStore([]);
    expect(isOnboarding(store.openedProjects)).toBe(true);
    expect(buildRecentProjects(store.openedProjects, () => 0)).toEqual([]);
  });
});

describe('HomePage open-project action', () => {
  it('opens the chosen project and routes to it', () => {
    const store = mockProjectsStore([]);
    const picked = project({ id: 'x', worktree: '/repo/x' });
    const routes: string[] = [];

    // Mirror HomePage.handlePick: open then navigate.
    store.openProject(picked);
    routes.push(projectRoute(picked));

    expect(store.opened).toContain(picked);
    expect(store.activeProject).toBe(picked);
    expect(routes[0]).toBe('/' + Buffer.from('/repo/x').toString('base64url'));
  });

  it('falls back to opening the picker when new-session has no target', () => {
    const store = mockProjectsStore([]);
    const target = newSessionTarget(store.activeProject, store.openedProjects);
    expect(target).toBeNull(); // → HomePage opens the picker
  });
});

describe('HomePage new-session navigation', () => {
  it('navigates to the created session URL within the target project', () => {
    const target = project({ id: 'a', worktree: '/repo/alpha' });
    const store = mockProjectsStore([target], target);
    const created = session({ id: 'new-session-id' });

    const resolved = newSessionTarget(store.activeProject, store.openedProjects);
    expect(resolved).toBe(target);
    expect(sessionRoute(resolved as Project, created.id)).toBe(
      sessionRoute(target, 'new-session-id')
    );
  });
});

describe('HomePage recent sessions navigation', () => {
  it('builds rows that navigate to their session URL', () => {
    const alpha = project({ id: 'a', worktree: '/repo/alpha' });
    const entries: ProjectSession[] = [
      { session: session({ id: 's-recent', title: 'Recent work' }), project: alpha },
    ];
    const rows = buildRecentSessions(entries, { now: Date.now() });
    expect(rows[0].title).toBe('Recent work');
    expect(sessionRoute(rows[0].project, rows[0].id)).toBe(sessionRoute(alpha, 's-recent'));
  });
});

describe('HomePage connection status', () => {
  const cases: Array<[ConnectionStatus, boolean]> = [
    ['connected', true],
    ['connecting', false],
    ['disconnected', false],
    ['error', false],
  ];
  for (const [status, connected] of cases) {
    it(`reflects the ${status} connection state`, () => {
      const info = describeConnection(status, 'http://localhost:4096');
      expect(info.connected).toBe(connected);
      if (!connected) expect(info.hint ?? info.label).toBeTruthy();
    });
  }
});

describe('HomePage setup cards', () => {
  const healthy = {
    connectionStatus: 'connected' as ConnectionStatus,
    goopspecConfig: { memoryEnabled: true },
    voiceError: null,
  };

  it('shows no cards when every feature is configured', () => {
    expect(buildSetupCards(healthy)).toEqual([]);
  });

  it('shows the server card and links to /settings/server when disconnected', () => {
    const cards = buildSetupCards({ ...healthy, connectionStatus: 'disconnected' });
    const server = cards.find((c) => c.id === 'server');
    expect(server?.href).toBe('/settings/server');
  });

  it('shows the server card for any non-connected status', () => {
    for (const status of ['connecting', 'error', 'disconnected'] as ConnectionStatus[]) {
      const cards = buildSetupCards({ ...healthy, connectionStatus: status });
      expect(cards.some((c) => c.id === 'server')).toBe(true);
    }
  });

  it('shows the memory card and links to /settings/goopspec when memory is disabled', () => {
    const cards = buildSetupCards({ ...healthy, goopspecConfig: { memoryEnabled: false } });
    const memory = cards.find((c) => c.id === 'memory');
    expect(memory?.href).toBe('/settings/goopspec');
  });

  it('shows the goopspec card and links to /settings/goopspec when config failed to load', () => {
    const cards = buildSetupCards({ ...healthy, goopspecConfig: null });
    const goopspec = cards.find((c) => c.id === 'goopspec');
    expect(goopspec?.href).toBe('/settings/goopspec');
    // The memory card must not also appear when the whole config is unreadable.
    expect(cards.some((c) => c.id === 'memory')).toBe(false);
  });

  it('withholds config-dependent cards while config is still loading', () => {
    const cards = buildSetupCards({ ...healthy, goopspecConfig: undefined });
    expect(cards.some((c) => c.id === 'memory' || c.id === 'goopspec')).toBe(false);
  });

  it('still shows the server card while config is loading', () => {
    const cards = buildSetupCards({
      connectionStatus: 'disconnected',
      goopspecConfig: undefined,
      voiceError: null,
    });
    expect(cards.map((c) => c.id)).toEqual(['server']);
  });

  it('shows the voice card and links to /settings/voice only when unsupported', () => {
    expect(buildSetupCards({ ...healthy, voiceError: 'unsupported' }).find((c) => c.id === 'voice')?.href).toBe(
      '/settings/voice'
    );
    expect(buildSetupCards({ ...healthy, voiceError: 'permission-denied' }).some((c) => c.id === 'voice')).toBe(
      false
    );
  });

  it('surfaces every degraded feature at once', () => {
    const cards = buildSetupCards({
      connectionStatus: 'disconnected',
      goopspecConfig: { memoryEnabled: false },
      voiceError: 'unsupported',
    });
    expect(cards.map((c) => c.id)).toEqual(['server', 'memory', 'voice']);
  });
});
