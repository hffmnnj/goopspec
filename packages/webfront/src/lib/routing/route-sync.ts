import type { Project, Session } from '$lib/api/types.js';

export type RouteSyncResult =
  | { status: 'active'; sessionId: string }
  | { status: 'session-not-found'; sessionId: string }
  | { status: 'error'; message: string };

interface ProjectRouteStore {
  ensureProjectPath(projectPath: string): Promise<Project>;
}

interface SessionRouteStore {
  sorted: Session[];
  load(): Promise<void>;
}

interface ActiveSessionRouteStore {
  activeId: string | null;
  select(sessionId: string): void;
}

export async function syncSessionRoute(input: {
  projectPath: string;
  sessionId: string;
  projectsStore: ProjectRouteStore;
  sessionsStore: SessionRouteStore;
  activeSessionStore: ActiveSessionRouteStore;
}): Promise<RouteSyncResult> {
  try {
    await input.projectsStore.ensureProjectPath(input.projectPath);
    await input.sessionsStore.load();

    const exists = input.sessionsStore.sorted.some((session) => session.id === input.sessionId);
    if (!exists) return { status: 'session-not-found', sessionId: input.sessionId };

    if (input.activeSessionStore.activeId !== input.sessionId) {
      input.activeSessionStore.select(input.sessionId);
    }

    return { status: 'active', sessionId: input.sessionId };
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Failed to load route',
    };
  }
}
