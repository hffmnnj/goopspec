import { createClient } from '../api/client.js';
import {
  createSession,
  deleteSession,
  fetchSessions,
  renameSession,
} from '../api/sessions.js';
import type { CreateSessionOptions, OpenCodeClient, Session } from '../api/types.js';
import { projects, type ProjectsStore } from './projects.svelte.js';
import { workspace } from './workspace.svelte.js';

class SessionsStore {
  sessions = $state<Session[]>([]);
  loading = $state(false);
  error = $state<string | null>(null);

  private readonly optimisticByDirectory = new Map<string, Session[]>();

  /** Sorted newest first by updatedAt */
  sorted = $derived<Session[]>(
    [...this.sessions].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    )
  );

  constructor(
    private readonly client: OpenCodeClient,
    private readonly projectStore: ProjectsStore
  ) {}

  private activeProjectDirectory(): string | undefined {
    const activeProject = this.projectStore.activeProject;
    if (!activeProject || activeProject.id === 'local') return undefined;
    return activeProject.worktree;
  }

  private createSessionDirectory(): string | undefined {
    const activeProject = this.projectStore.activeProject;
    if (activeProject?.id === 'local') return undefined;
    return activeProject?.worktree ?? workspace.currentPath ?? undefined;
  }

  private directoryKey(directory: string | undefined): string {
    return directory ?? '__local__';
  }

  private rememberOptimistic(directory: string | undefined, session: Session): void {
    const key = this.directoryKey(directory);
    const existing = this.optimisticByDirectory.get(key) ?? [];
    this.optimisticByDirectory.set(key, [session, ...existing.filter((s) => s.id !== session.id)]);
  }

  private mergeOptimistic(directory: string | undefined, loaded: Session[]): Session[] {
    const optimistic = this.optimisticByDirectory.get(this.directoryKey(directory)) ?? [];
    if (optimistic.length === 0) return loaded;

    const loadedIds = new Set(loaded.map((session) => session.id));
    const missing = optimistic.filter((session) => !loadedIds.has(session.id));
    return missing.length === 0 ? loaded : [...missing, ...loaded];
  }

  async load(): Promise<void> {
    this.loading = true;
    this.error = null;

    try {
      const directory = this.activeProjectDirectory();
      this.sessions = this.mergeOptimistic(directory, await fetchSessions(this.client, directory));
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Failed to load sessions';
    } finally {
      this.loading = false;
    }
  }

  async create(opts: CreateSessionOptions = {}): Promise<Session | undefined> {
    this.error = null;

    try {
      const directory = this.createSessionDirectory();
      const session = await createSession(this.client, directory ? { directory, ...opts } : opts);
      this.rememberOptimistic(directory, session);
      // Prepend so it appears immediately in the UI; re-sort on next load.
      this.sessions = [session, ...this.sessions.filter((s) => s.id !== session.id)];
      return session;
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Failed to create session';
      return undefined;
    }
  }

  async remove(id: string): Promise<boolean> {
    this.error = null;

    try {
      await deleteSession(this.client, id);
      this.sessions = this.sessions.filter((s) => s.id !== id);
      return true;
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Failed to delete session';
      return false;
    }
  }

  async rename(id: string, title: string): Promise<Session | undefined> {
    this.error = null;

    try {
      const session = await renameSession(this.client, id, title);
      this.sessions = this.sessions.map((s) => (s.id === id ? session : s));
      return session;
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Failed to rename session';
      return undefined;
    }
  }

  clearError(): void {
    this.error = null;
  }

  initProjectWatcher(): () => void {
    return this.projectStore.onActiveProjectChange(() => {
      void this.load();
    });
  }
}

export function createSessionsStore(client?: OpenCodeClient, projectStore?: ProjectsStore): SessionsStore {
  return new SessionsStore(client ?? createClient(), projectStore ?? projects);
}

/** Default reactive session store backed by the configured OpenCode client. */
export const sessions = createSessionsStore();

export type { SessionsStore };
