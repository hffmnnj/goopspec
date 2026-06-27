import { encodeProjectPath } from './path-codec.js';
import type { Project } from '$lib/api/types.js';

export function projectRoute(project: Pick<Project, 'worktree'>): string {
  return `/${encodeProjectPath(project.worktree)}`;
}

export function sessionRoute(project: Pick<Project, 'worktree'>, sessionId: string): string {
  return `${projectRoute(project)}/session/${encodeURIComponent(sessionId)}`;
}

export function projectSettingsRoute(project: Pick<Project, 'worktree'>): string {
  return `${projectRoute(project)}/settings`;
}

export function needsNavigation(currentPathname: string, targetPathname: string): boolean {
  return currentPathname !== targetPathname;
}
