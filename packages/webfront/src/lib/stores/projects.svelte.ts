import { createClient } from '../api/client.js';
import type { OpenCodeClient, Project } from '../api/types.js';
import { workspace, type WorkspaceStore } from './workspace.svelte.js';

const ACTIVE_PROJECT_STORAGE_KEY = 'goopspec-active-project-id';

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

function writeActiveProjectId(id: string): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(ACTIVE_PROJECT_STORAGE_KEY, id);
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
  projects = $state<Project[]>([]);
  activeProject = $state<Project | null>(null);
  loading = $state(false);
  error = $state<string | null>(null);

  private readonly activeProjectListeners = new Set<(project: Project | null) => void>();

  constructor(
    private readonly client: OpenCodeClient,
    private readonly workspaceStore: WorkspaceStore
  ) {}

  async refresh(): Promise<void> {
    this.loading = true;
    this.error = null;

    try {
      const [serverProjects, currentProject] = await Promise.all([
        this.client.listProjects(),
        this.client.getCurrentProject(),
      ]);

      this.projects = serverProjects.length > 0
        ? serverProjects
        : [createFallbackProject(this.workspaceStore.currentPath)];

      this.initFromLocalStorage();
      if (this.activeProject) return;

      const current = currentProject
        ? this.projects.find((project) => project.id === currentProject.id) ?? currentProject
        : null;
      this.setActiveProjectInternal(current ?? this.projects[0] ?? null);
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Failed to load projects';
      const fallback = createFallbackProject(this.workspaceStore.currentPath);
      this.projects = [fallback];
      this.setActiveProjectInternal(fallback);
    } finally {
      this.loading = false;
    }
  }

  setActiveProject(project: Project): void {
    this.setActiveProjectInternal(project);
    writeActiveProjectId(project.id);
  }

  initFromLocalStorage(): void {
    const persistedId = readActiveProjectId();
    if (!persistedId) return;
    const match = this.projects.find((project) => project.id === persistedId);
    if (match) this.setActiveProjectInternal(match);
  }

  onActiveProjectChange(listener: (project: Project | null) => void): () => void {
    this.activeProjectListeners.add(listener);
    return () => this.activeProjectListeners.delete(listener);
  }

  reset(): void {
    this.projects = [];
    this.setActiveProjectInternal(null);
    this.loading = false;
    this.error = null;
  }

  private setActiveProjectInternal(project: Project | null): void {
    const previous = this.activeProject;
    this.activeProject = project;
    if (previous?.id === project?.id && previous?.worktree === project?.worktree) return;
    for (const listener of this.activeProjectListeners) listener(project);
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
