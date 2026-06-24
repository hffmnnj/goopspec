import type { Session } from '$lib/api/types.js';

export interface SessionTreeNode {
  session: Session;
  children: SessionTreeNode[];
}

function sortByUpdatedAtDesc(a: SessionTreeNode, b: SessionTreeNode): number {
  return new Date(b.session.updatedAt).getTime() - new Date(a.session.updatedAt).getTime();
}

export function buildSessionHierarchy(sessions: Session[]): SessionTreeNode[] {
  const nodes = new Map<string, SessionTreeNode>();
  for (const session of sessions) nodes.set(session.id, { session, children: [] });

  const roots: SessionTreeNode[] = [];

  for (const node of nodes.values()) {
    const parentID = node.session.parentID;
    const parent = parentID ? nodes.get(parentID) : undefined;
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortTree = (items: SessionTreeNode[]): SessionTreeNode[] => {
    for (const item of items) item.children = sortTree(item.children);
    return items.sort(sortByUpdatedAtDesc);
  };

  return sortTree(roots);
}
