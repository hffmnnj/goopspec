import { createClient } from '../api/client.js';
import {
  createSession,
  deleteSession,
  fetchSessions,
  renameSession,
} from '../api/sessions.js';
import type { CreateSessionOptions, OpenCodeClient, Session } from '../api/types.js';
import { workspace } from './workspace.svelte.js';

class SessionsStore {
  sessions = $state<Session[]>([]);
  loading = $state(false);
  error = $state<string | null>(null);

  /** Sorted newest first by updatedAt */
  sorted = $derived<Session[]>(
    [...this.sessions].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    )
  );

  constructor(private readonly client: OpenCodeClient) {}

  async load(): Promise<void> {
    this.loading = true;
    this.error = null;

    try {
      this.sessions = await fetchSessions(this.client);
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Failed to load sessions';
    } finally {
      this.loading = false;
    }
  }

  async create(opts: CreateSessionOptions = {}): Promise<Session | undefined> {
    this.error = null;

    try {
      const session = await createSession(this.client, {
        path: workspace.currentPath ?? undefined,
        ...opts,
      });
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
}

export function createSessionsStore(client?: OpenCodeClient): SessionsStore {
  return new SessionsStore(client ?? createClient());
}

/** Default reactive session store backed by the configured OpenCode client. */
export const sessions = createSessionsStore();
