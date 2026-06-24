import { describe, expect, it } from 'bun:test';
import type { Project } from '$lib/api/types.js';
import {
  AVATAR_PALETTE,
  PROJECT_AVATAR_COLORS,
  projectColor,
  projectName,
  projectInitial,
  projectLabel,
  isActiveProject,
  avatarClass,
  avatarAriaCurrent,
} from './project-rail.js';

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: 'p1',
    worktree: '/repo/my-app',
    time: { created: 1 },
    ...overrides,
  };
}

describe('AVATAR_PALETTE', () => {
  it('contains at least 50 colors', () => {
    expect(AVATAR_PALETTE.length).toBeGreaterThanOrEqual(50);
  });

  it('contains only distinct colors', () => {
    expect(new Set(AVATAR_PALETTE).size).toBe(AVATAR_PALETTE.length);
  });

  it('aliases the legacy PROJECT_AVATAR_COLORS export', () => {
    expect(PROJECT_AVATAR_COLORS).toBe(AVATAR_PALETTE);
  });

  it('produces no duplicate colors for N opened projects (N <= palette size)', () => {
    const n = Math.min(AVATAR_PALETTE.length, 50);
    const colors = Array.from({ length: n }, (_, i) => projectColor(`id-${i}`, i));
    expect(new Set(colors).size).toBe(n);
  });
});

describe('projectColor', () => {
  it('uses the explicit palette index when provided', () => {
    expect(projectColor('anything', 0)).toBe(AVATAR_PALETTE[0]);
    expect(projectColor('anything', 7)).toBe(AVATAR_PALETTE[7]);
  });

  it('wraps an out-of-range index into the palette', () => {
    expect(projectColor('x', AVATAR_PALETTE.length)).toBe(AVATAR_PALETTE[0]);
  });

  it('falls back to a deterministic id hash when no index is given', () => {
    for (const id of ['a', 'p1', 'long-project-id', '/repo/two']) {
      expect(AVATAR_PALETTE).toContain(projectColor(id));
    }
    expect(projectColor('p1')).toBe(projectColor('p1'));
  });

  it('falls back to the first palette color for an empty id and no index', () => {
    expect(projectColor('')).toBe(AVATAR_PALETTE[0]);
  });

  it('ignores a negative index and uses the hash fallback', () => {
    expect(projectColor('p1', -1)).toBe(projectColor('p1'));
  });
});

describe('projectName', () => {
  it('uses the last path segment of the worktree', () => {
    expect(projectName('/home/me/projects/my-app')).toBe('my-app');
    expect(projectName('/repo/two/')).toBe('two');
  });

  it('returns empty for root or missing worktree', () => {
    expect(projectName('/')).toBe('');
    expect(projectName('')).toBe('');
    expect(projectName(null)).toBe('');
    expect(projectName(undefined)).toBe('');
  });
});

describe('projectInitial', () => {
  it('shows the uppercase first letter of the last segment', () => {
    expect(projectInitial('/repo/my-app')).toBe('M');
    expect(projectInitial('/repo/zeta')).toBe('Z');
  });

  it('falls back to "?" when no name is derivable', () => {
    expect(projectInitial('/')).toBe('?');
    expect(projectInitial('')).toBe('?');
    expect(projectInitial(null)).toBe('?');
  });
});

describe('projectLabel', () => {
  it('uses the worktree path as the tooltip/label', () => {
    expect(projectLabel(project({ worktree: '/repo/my-app' }))).toBe('/repo/my-app');
  });

  it('falls back for an unnamed worktree', () => {
    expect(projectLabel(project({ worktree: '' }))).toBe('Untitled project');
  });
});

describe('isActiveProject', () => {
  it('matches by id', () => {
    const p = project({ id: 'p2' });
    expect(isActiveProject(p, 'p2')).toBe(true);
    expect(isActiveProject(p, 'p1')).toBe(false);
  });

  it('is false when no active id is set', () => {
    expect(isActiveProject(project(), null)).toBe(false);
    expect(isActiveProject(project(), undefined)).toBe(false);
  });
});

describe('avatar active-state helpers', () => {
  it('avatarClass adds the active modifier only when active', () => {
    expect(avatarClass(false)).toBe('rail-avatar');
    expect(avatarClass(true)).toBe('rail-avatar rail-avatar--active');
  });

  it('avatarAriaCurrent is "true" when active, undefined otherwise', () => {
    expect(avatarAriaCurrent(true)).toBe('true');
    expect(avatarAriaCurrent(false)).toBeUndefined();
  });
});
