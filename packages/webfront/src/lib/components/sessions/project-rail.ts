// Pure, DOM-free helpers driving <ProjectRail>. Split out (like session-card.ts)
// so the avatar color/initial/label/active-state logic is unit-testable without
// a Svelte renderer.
import type { Project } from '$lib/api/types.js';

/** Fixed palette so a project id always resolves to the same color across reloads. */
export const PROJECT_AVATAR_COLORS = [
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#14b8a6',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
] as const;

/** Map a project id to a stable palette color via a dependency-free djb2 hash. */
export function projectColor(id: string): string {
  if (!id) return PROJECT_AVATAR_COLORS[0];
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash << 5) - hash + id.charCodeAt(i);
    hash |= 0; // keep within 32-bit range to avoid precision drift
  }
  const index = Math.abs(hash) % PROJECT_AVATAR_COLORS.length;
  return PROJECT_AVATAR_COLORS[index];
}

/** The last non-empty path segment of a worktree, used as the display name. */
export function projectName(worktree: string | null | undefined): string {
  if (!worktree) return '';
  const parts = worktree.split('/').filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : '';
}

/** Uppercase initial for the avatar; falls back to `?` for a root/unnamed worktree. */
export function projectInitial(worktree: string | null | undefined): string {
  const name = projectName(worktree);
  const first = name.trim().charAt(0);
  return first ? first.toUpperCase() : '?';
}

/** Tooltip / accessible label: the worktree path, or a fallback when unnamed. */
export function projectLabel(project: Project): string {
  return project.worktree?.trim() || 'Untitled project';
}

/** Whether `project` is the currently-active project, comparing by id. */
export function isActiveProject(project: Project, activeId: string | null | undefined): boolean {
  return activeId != null && project.id === activeId;
}

/** Avatar root class, adding the active modifier only when selected. */
export function avatarClass(active: boolean): string {
  return active ? 'rail-avatar rail-avatar--active' : 'rail-avatar';
}

/** `aria-current` value for the active avatar; undefined when inactive. */
export function avatarAriaCurrent(active: boolean): 'true' | undefined {
  return active ? 'true' : undefined;
}
