// Pure, DOM-free helpers driving <ProjectRail>. Split out (like session-card.ts)
// so the avatar color/initial/label/active-state logic is unit-testable without
// a Svelte renderer.
import type { Project } from '$lib/api/types.js';

/**
 * 64 distinct avatar colors: 16 evenly-spread hues x 4 sat/light variants,
 * variants offset between rings so adjacent indices stay distinguishable. Mid
 * lightness keeps every color legible on both the dark and light themes.
 */
export const AVATAR_PALETTE: string[] = (() => {
  const colors: string[] = [];
  const hueSteps = 16;
  const variants = [
    { s: 65, l: 55 },
    { s: 75, l: 45 },
    { s: 55, l: 60 },
    { s: 70, l: 50 },
  ];
  const hueSpan = 360 / hueSteps;
  for (let v = 0; v < variants.length; v++) {
    for (let h = 0; h < hueSteps; h++) {
      const hue = Math.round(hueSpan * h + (v * hueSpan) / variants.length) % 360;
      colors.push(`hsl(${hue}, ${variants[v].s}%, ${variants[v].l}%)`);
    }
  }
  return colors;
})();

/**
 * Backwards-compatible export. Older code referenced `PROJECT_AVATAR_COLORS`;
 * it now aliases the expanded palette.
 */
export const PROJECT_AVATAR_COLORS = AVATAR_PALETTE;

/** Dependency-free djb2 hash of a string, normalized to a non-negative int. */
function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0; // keep within 32-bit range to avoid precision drift
  }
  return Math.abs(hash);
}

/**
 * Resolve an avatar color. Prefer an explicit, stable palette index assigned
 * when the project was opened (so the first N opened projects are all unique
 * and a color never shifts as siblings open/close). Falls back to a
 * deterministic id hash when no index is supplied (e.g. legacy callers / tests).
 */
export function projectColor(id: string, colorIndex?: number): string {
  if (typeof colorIndex === 'number' && colorIndex >= 0) {
    return AVATAR_PALETTE[colorIndex % AVATAR_PALETTE.length];
  }
  if (!id) return AVATAR_PALETTE[0];
  return AVATAR_PALETTE[hashString(id) % AVATAR_PALETTE.length];
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
