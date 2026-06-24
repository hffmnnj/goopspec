// Pure, DOM-free helpers for <VcsBadge>. Split out (like project-rail.ts) so the
// visibility, label, and event-matching logic is unit-testable without a renderer.
import type { GlobalEvent, VcsInfo } from '$lib/api/types.js';

/** Whether the badge should render anything (only when a branch is known). */
export function hasBranch(info: VcsInfo): boolean {
  return info != null && typeof info.branch === 'string' && info.branch.length > 0;
}

/** Branch name for display; empty when no branch is available. */
export function branchLabel(info: VcsInfo): string {
  return hasBranch(info) ? (info as { branch: string }).branch : '';
}

/** Whether the working tree has uncommitted changes. */
export function isDirty(info: VcsInfo): boolean {
  return info != null && info.dirty === true;
}

/** Accessible label describing branch + dirty state. */
export function ariaLabel(info: VcsInfo): string {
  if (!hasBranch(info)) return 'No version control';
  const branch = branchLabel(info);
  return isDirty(info) ? `Branch ${branch}, uncommitted changes` : `Branch ${branch}`;
}

/** Whether a global event should trigger a VCS refresh. */
export function isVcsRefreshEvent(event: GlobalEvent): boolean {
  const type = event?.type?.toLowerCase?.() ?? '';
  return type.startsWith('vcs.') || type.includes('branch');
}
