import { describe, expect, it } from 'bun:test';
import type { Session } from '$lib/api/types.js';
import { buildSessionHierarchy } from './hierarchy.js';

function session(id: string, updatedAt: string, parentID?: string): Session {
  return {
    id,
    title: id,
    createdAt: updatedAt,
    updatedAt,
    parentID,
  };
}

describe('buildSessionHierarchy', () => {
  it('nests child sessions under their parent', () => {
    const tree = buildSessionHierarchy([
      session('child-a', '2026-01-01T00:02:00.000Z', 'parent'),
      session('parent', '2026-01-01T00:01:00.000Z'),
      session('child-b', '2026-01-01T00:03:00.000Z', 'parent'),
    ]);

    expect(tree.map((node) => node.session.id)).toEqual(['parent']);
    expect(tree[0].children.map((node) => node.session.id)).toEqual(['child-b', 'child-a']);
  });

  it('renders orphan children as top-level sessions', () => {
    const tree = buildSessionHierarchy([session('orphan', '2026-01-01T00:01:00.000Z', 'missing')]);

    expect(tree).toHaveLength(1);
    expect(tree[0].session.id).toBe('orphan');
    expect(tree[0].children).toEqual([]);
  });

  it('preserves a flat newest-first list when there are no parents', () => {
    const tree = buildSessionHierarchy([
      session('older', '2026-01-01T00:01:00.000Z'),
      session('newer', '2026-01-01T00:02:00.000Z'),
    ]);

    expect(tree.map((node) => node.session.id)).toEqual(['newer', 'older']);
  });
});
