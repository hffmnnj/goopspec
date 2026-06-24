import { createClient } from '../api/client.js';
import type { OpenCodeClient, Project } from '../api/types.js';
import { workspace, type WorkspaceStore } from './workspace.svelte.js';
import { AVATAR_PALETTE } from '../components/sessions/project-rail.js';

const ACTIVE_PROJECT_STORAGE_KEY = 'goopspec-active-project-id';
const OPENED_PROJECTS_STORAGE_KEY = 'goopspec-opened-projects';

/**
 * Minimal record persisted per opened project. Full project data is
 * re-hydrated from the server list when available; the stored worktree is the
 * fallback so the rail still renders before (or without) a server response.
 * `colorIndex` is assigned once on open so an avatar's color stays stable even
 * as other projects are opened/closed around it.
 */
interface OpenedProjectRecord {
  id: string;
  worktree: string;
  colorIndex: number;
}

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

function readActiveProjectId(): string | null {
  if (!isBrowser()) return null;
  try {
    return window.localStorage.getItem(ACTIVE_PROJECT_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeActiveProjectId(id: string | null): void {
  if (!isBrowser()) return;
  try {
    if (id) window.localStorage.setItem(ACTIVE_PROJECT_STORAGE_KEY, id);
    else window.localStorage.removeItem(ACTIVE_PROJECT_STORAGE_KEY);
  } catch {
    // Persistence is best-effort.
  }
}

function readOpenedRecords(): OpenedProjectRecord[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(OPENED_PROJECTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (entry): entry is OpenedProjectRecord =>
          !!entry &&
          typeof entry.id === 'string' &&
          typeof entry.worktree === 'string' &&
          typeof entry.colorIndex === 'number'
      )
      .map((entry) => ({ id: entry.id, worktree: entry.worktree, colorIndex: entry.colorIndex }));
  } catch {
    return [];
  }
}

function writeOpenedRecords(records: OpenedProjectRecord[]): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(OPENED_PROJECTS_STORAGE_KEY, JSON.stringify(records));
  } catch {
    // Persistence is best-effort.
  }
}

function createFallbackProject(currentPath: string | null): Project {
  return {
    id: 'local',
    worktree: currentPath || '/',
    time: { created: Date.now() },
  };
}

class ProjectsStore {
  /** Pool of projects the server knows about (`GET /project`); the add-picker source. */
  availableProjects = $state<Project[]>([]);
  /** Projects the user has explicitly opened — this is what the rail renders. */
  openedProjects = $state<Project[]>([]);
  activeProject = $state<Project | null>(null);
  loading = $state(false);
  error = $state<string | null>(null);

  /** Color index assigned per opened project id (stable across open/close churn). */
  private colorIndexById = new Map<string, number>();
  private readonly activeProjectListeners = new Set<(project: Project | null) => void>();

  constructor(
    private readonly client: OpenCodeClient,
    private readonly workspaceStore: WorkspaceStore
  ) {}

  /**
   * Backwards-compatible alias. Existing consumers (e.g. SessionSidebar) read
   * `projects.projects` to drive the rail; the rail must now source from the
   * opened set, so this returns the opened projects.
   */
  get projects(): Project[] {
    return this.openedProjects;
  }

  set projects(next: Project[]) {
    this.openedProjects = next;
  }

  /** Color index for an opened project's avatar; -1 if not opened. */
  colorIndexFor(id: string): number {
    return this.colorIndexById.get(id) ?? -1;
  }

  /** Available projects not yet opened — the candidates the add-picker offers. */
  unopenedAvailable(): Project[] {
    const openedIds = new Set(this.openedProjects.map((p) => p.id));
    return this.availableProjects.filter((p) => !openedIds.has(p.id));
  }

  async refresh(): Promise<void> {
    this.loading = true;
    this.error = null;

    try {
      const [serverProjects, currentProject] = await Promise.all([
        this.client.listProjects(),
        this.client.getCurrentProject(),
      ]);

      this.availableProjects = serverProjects;

      // Restore the user's opened set from localStorage, reconciling each
      // stored record against the freshest server data when available.
      this.hydrateOpenedFromStorage();

      // Sensible default: if nothing is opened yet, auto-open just the current
      // project (or a workspace fallback) so the app isn't empty on first load.
      if (this.openedProjects.length === 0) {
        const seed =
          currentProject ??
          serverProjects[0] ??
          createFallbackProject(this.workspaceStore.currentPath);
        this.openProject(seed);
      } else {
        this.restoreActiveFromStorage();
      }
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Failed to load projects';
      this.availableProjects = [];
      this.hydrateOpenedFromStorage();
      if (this.openedProjects.length === 0) {
        this.openProject(createFallbackProject(this.workspaceStore.currentPath));
      } else {
        this.restoreActiveFromStorage();
      }
    } finally {
      this.loading = false;
    }
  }

  /** Open (add) a project: append to the opened set, make it active, persist. */
  openProject(project: Project): void {
    const existing = this.openedProjects.find((p) => p.id === project.id);
    if (!existing) {
      this.assignColorIndex(project.id);
      this.openedProjects = [...this.openedProjects, project];
      this.persistOpened();
    } else if (existing.worktree !== project.worktree) {
      // Keep the freshest server data for an already-opened project.
      this.openedProjects = this.openedProjects.map((p) =>
        p.id === project.id ? project : p
      );
      this.persistOpened();
    }
    this.setActiveProject(project);
  }

  /**
   * Close (remove) a project from the rail. If it was active, switch to another
   * opened project (or null when the rail becomes empty).
   */
  closeProject(projectId: string): void {
    const wasActive = this.activeProject?.id === projectId;
    const remaining = this.openedProjects.filter((p) => p.id !== projectId);
    this.openedProjects = remaining;
    this.colorIndexById.delete(projectId);
    this.persistOpened();

    if (wasActive) {
      this.setActiveProjectInternal(remaining[0] ?? null);
      writeActiveProjectId(remaining[0]?.id ?? null);
    }
  }

  setActiveProject(project: Project): void {
    this.setActiveProjectInternal(project);
    writeActiveProjectId(project.id);
  }

  async ensureProjectPath(projectPath: string): Promise<Project> {
    if (this.availableProjects.length === 0 && this.openedProjects.length === 0 && !this.loading) {
      await this.refresh();
    }

    const match =
      this.openedProjects.find((project) => project.worktree === projectPath) ??
      this.availableProjects.find((project) => project.worktree === projectPath) ??
      this.createPathProject(projectPath);

    this.openProject(match);
    return match;
  }

  onActiveProjectChange(listener: (project: Project | null) => void): () => void {
    this.activeProjectListeners.add(listener);
    return () => this.activeProjectListeners.delete(listener);
  }

  reset(): void {
    this.availableProjects = [];
    this.openedProjects = [];
    this.colorIndexById.clear();
    this.setActiveProjectInternal(null);
    this.loading = false;
    this.error = null;
  }

  /** Restore opened projects from localStorage, reconciling with the server list. */
  private hydrateOpenedFromStorage(): void {
    const records = readOpenedRecords();
    if (records.length === 0) return;

    const serverById = new Map(this.availableProjects.map((p) => [p.id, p]));
    const restored: Project[] = [];
    this.colorIndexById.clear();

    for (const record of records) {
      const fromServer = serverById.get(record.id);
      const project: Project =
        fromServer ?? {
          id: record.id,
          worktree: record.worktree,
          time: { created: Date.now() },
        };
      this.colorIndexById.set(record.id, record.colorIndex);
      restored.push(project);
    }

    this.openedProjects = restored;
  }

  private restoreActiveFromStorage(): void {
    const persistedId = readActiveProjectId();
    const match = persistedId
      ? this.openedProjects.find((p) => p.id === persistedId)
      : undefined;
    this.setActiveProjectInternal(match ?? this.openedProjects[0] ?? null);
  }

  /** Assign the next palette index for a newly-opened project (stable thereafter). */
  private assignColorIndex(id: string): void {
    if (this.colorIndexById.has(id)) return;
    const used = new Set(this.colorIndexById.values());
    // Prefer the first unused palette slot so the first N opened projects are
    // all unique; once every slot is used, wrap by opened count.
    let index = -1;
    for (let i = 0; i < AVATAR_PALETTE.length; i++) {
      if (!used.has(i)) {
        index = i;
        break;
      }
    }
    if (index === -1) index = this.colorIndexById.size % AVATAR_PALETTE.length;
    this.colorIndexById.set(id, index);
  }

  private persistOpened(): void {
    const records: OpenedProjectRecord[] = this.openedProjects.map((p) => ({
      id: p.id,
      worktree: p.worktree,
      colorIndex: this.colorIndexById.get(p.id) ?? 0,
    }));
    writeOpenedRecords(records);
  }

  private setActiveProjectInternal(project: Project | null): void {
    const previous = this.activeProject;
    this.activeProject = project;
    if (previous?.id === project?.id && previous?.worktree === project?.worktree) return;
    for (const listener of this.activeProjectListeners) listener(project);
  }

  private createPathProject(projectPath: string): Project {
    return {
      id: projectPath,
      worktree: projectPath,
      time: { created: Date.now() },
    };
  }
}

export function createProjectsStore(
  client?: OpenCodeClient,
  workspaceStore?: WorkspaceStore
): ProjectsStore {
  return new ProjectsStore(client ?? createClient(), workspaceStore ?? workspace);
}

export const projects = createProjectsStore();

export type { ProjectsStore };
