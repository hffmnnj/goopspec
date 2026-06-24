import type { Session } from '$lib/api/types.js';
import type { SessionTreeNode } from './hierarchy.js';

/**
 * Disclosure (expand/collapse) helpers for the nested session sidebar.
 * Children collapse by default: the sidebar tracks *expanded* parent ids, so an
 * empty set means everything is collapsed on first render (Wave 22).
 */

export function isNodeExpanded(expandedIds: ReadonlySet<string>, id: string): boolean {
  return expandedIds.has(id);
}

export function toggleExpanded(expandedIds: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(expandedIds);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

export function parentIdOf(sessions: readonly Session[], sessionId: string): string | null {
  const target = sessions.find((s) => s.id === sessionId);
  const parentID = target?.parentID;
  if (!parentID) return null;
  return sessions.some((s) => s.id === parentID) ? parentID : null;
}

// Auto-expands an active child's parent so it stays visible. Returns the same
// set reference when no change is needed, so callers can skip a reactive write.
export function expandActiveParent(
  expandedIds: ReadonlySet<string>,
  sessions: readonly Session[],
  activeId: string | null | undefined
): Set<string> | ReadonlySet<string> {
  if (!activeId) return expandedIds;
  const parentID = parentIdOf(sessions, activeId);
  if (!parentID || expandedIds.has(parentID)) return expandedIds;
  const next = new Set(expandedIds);
  next.add(parentID);
  return next;
}

export function hasChildren(node: SessionTreeNode): boolean {
  return node.children.length > 0;
}
