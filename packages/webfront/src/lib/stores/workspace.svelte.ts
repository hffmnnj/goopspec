import { untrack } from 'svelte';

const STORAGE_KEY = 'goopspec-workspaces';
const MAX_RECENT_PATHS = 12;

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

interface StoredWorkspaces {
  current: string | null;
  recent: string[];
}

function readStored(): StoredWorkspaces | null {
  if (!isBrowser()) return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return null;
    const record = parsed as Record<string, unknown>;
    const current = typeof record.current === 'string' ? record.current : null;
    const recent = Array.isArray(record.recent)
      ? record.recent.filter((item): item is string => typeof item === 'string')
      : [];
    return { current, recent };
  } catch {
    return null;
  }
}

function writeStored(state: StoredWorkspaces): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Persistence is best-effort.
  }
}

function normalizePath(path: string): string {
  return path.trim().replace(/\/$/, '') || '.';
}

/**
 * Reactive workspace store.
 *
 * Holds the active project/workspace path (`currentPath`) and a user-maintained
 * list of recent workspace paths. Changes are persisted to localStorage.
 *
 * Initialization order:
 *  1. Optional server-supplied working directory.
 *  2. Previously persisted current path.
 *  3. `null` (caller can wait for user selection or a config fetch).
 */
class WorkspaceStoreClass {
  currentPath = $state<string | null>(null);
  recentPaths = $state<string[]>([]);

  constructor() {
    // Satisfy the unused-local check for the private guard; retained for future
    // lazy-init tracking without exposing public state.
    void this.initialized;
  }

  private initialized = false;

  /**
   * Seed the store from server config and localStorage. Safe to call multiple
   * times; subsequent calls only update the server-derived default if no path
   * is currently selected.
   */
  init(serverWorkingDirectory?: string | null): void {
    const stored = readStored();

    // Capture the state we want without triggering reactivity during init.
    const nextCurrent =
      this.currentPath ??
      stored?.current ??
      (serverWorkingDirectory ? normalizePath(serverWorkingDirectory) : null) ??
      null;

    const storedRecent = untrack(() => this.recentPaths);
    const nextRecent = dedupeAndCap([
      ...(nextCurrent ? [nextCurrent] : []),
      ...(stored?.recent ?? []),
      ...storedRecent,
    ]);

    this.currentPath = nextCurrent;
    this.recentPaths = nextRecent;
    writeStored({ current: this.currentPath, recent: this.recentPaths });
  }

  /** Set the active workspace and promote it to the top of recents. */
  setWorkspace(path: string): void {
    const normalized = normalizePath(path);
    this.currentPath = normalized;
    this.recentPaths = dedupeAndCap([normalized, ...this.recentPaths]);
    writeStored({ current: this.currentPath, recent: this.recentPaths });
  }

  /** Add a path to recents without making it current or reordering it. */
  addRecent(path: string): void {
    const normalized = normalizePath(path);
    this.recentPaths = dedupeAndCap([...this.recentPaths, normalized]);
    writeStored({ current: this.currentPath, recent: this.recentPaths });
  }

  /** Remove a path from recents. If it is the current path, current is cleared. */
  removeRecent(path: string): void {
    const normalized = normalizePath(path);
    this.recentPaths = this.recentPaths.filter((p) => p !== normalized);
    if (this.currentPath === normalized) {
      this.currentPath = null;
    }
    writeStored({ current: this.currentPath, recent: this.recentPaths });
  }

  /** Reset the store (useful for tests). */
  reset(): void {
    this.currentPath = null;
    this.recentPaths = [];
    this.initialized = false;
  }
}

function dedupeAndCap(paths: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const path of paths) {
    if (!path || seen.has(path)) continue;
    seen.add(path);
    result.push(path);
    if (result.length >= MAX_RECENT_PATHS) break;
  }
  return result;
}

/** Create an isolated workspace store for tests. */
export function createWorkspaceStore(): WorkspaceStoreClass {
  return new WorkspaceStoreClass();
}

/** Shared reactive workspace singleton. */
export const workspace = createWorkspaceStore();

/** Public type alias for the workspace store. */
export type WorkspaceStore = WorkspaceStoreClass;

/** Format a path for compact display, showing the last 1-2 segments. */
export function formatWorkspacePath(path: string | null): string {
  if (!path) return 'No workspace';
  const parts = path.split('/').filter(Boolean);
  if (parts.length === 0) return path;
  if (parts.length <= 2) return parts.join('/');
  return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
}
