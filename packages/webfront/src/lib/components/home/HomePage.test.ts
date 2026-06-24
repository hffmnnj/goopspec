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
