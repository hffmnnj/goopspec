import { describe, expect, it } from 'bun:test';
import type { Session } from '$lib/api/types.js';
import { buildSessionHierarchy } from './hierarchy.js';
import {
  expandActiveParent,
  hasChildren,
  isNodeExpanded,
  parentIdOf,
  toggleExpanded,
} from './session-disclosure.js';

function session(id: string, parentID?: string): Session {
  const t = '2026-01-01T00:00:00.000Z';
  return { id, title: id, createdAt: t, updatedAt: t, parentID };
}

describe('session-disclosure', () => {
  it('treats an empty set as fully collapsed (children hidden by default)', () => {
    const expanded = new Set<string>();
    expect(isNodeExpanded(expanded, 'parent')).toBe(false);
  });

  it('expands a parent on toggle and collapses it again', () => {
    let expanded: Set<string> = new Set();

    expanded = toggleExpanded(expanded, 'parent');
    expect(isNodeExpanded(expanded, 'parent')).toBe(true);

    expanded = toggleExpanded(expanded, 'parent');
    expect(isNodeExpanded(expanded, 'parent')).toBe(false);
  });

  it('toggle is immutable — does not mutate the source set', () => {
    const original = new Set<string>();
    const next = toggleExpanded(original, 'parent');
    expect(original.has('parent')).toBe(false);
    expect(next.has('parent')).toBe(true);
    expect(next).not.toBe(original);
  });

  it('resolves a child session parent id, ignoring missing parents', () => {
    const sessions = [session('parent'), session('child', 'parent')];
    expect(parentIdOf(sessions, 'child')).toBe('parent');
    expect(parentIdOf(sessions, 'parent')).toBeNull();
    expect(parentIdOf([session('orphan', 'gone')], 'orphan')).toBeNull();
  });

  it('auto-expands the parent of an active child session', () => {
    const sessions = [session('parent'), session('child', 'parent')];
    const next = expandActiveParent(new Set<string>(), sessions, 'child');
    expect(next.has('parent')).toBe(true);
  });

  it('leaves the set untouched when the active session is top-level', () => {
    const sessions = [session('parent'), session('child', 'parent')];
    const start = new Set<string>();
    expect(expandActiveParent(start, sessions, 'parent')).toBe(start);
    expect(expandActiveParent(start, sessions, null)).toBe(start);
  });

  it('does not re-expand a parent that is already expanded', () => {
    const sessions = [session('parent'), session('child', 'parent')];
    const start = new Set(['parent']);
    expect(expandActiveParent(start, sessions, 'child')).toBe(start);
  });

  it('reports whether a built tree node has collapsible children', () => {
    const tree = buildSessionHierarchy([
      session('parent'),
      session('child', 'parent'),
      session('solo'),
    ]);
    const parent = tree.find((n) => n.session.id === 'parent');
    const solo = tree.find((n) => n.session.id === 'solo');
    expect(parent && hasChildren(parent)).toBe(true);
    expect(solo && hasChildren(solo)).toBe(false);
  });
});
