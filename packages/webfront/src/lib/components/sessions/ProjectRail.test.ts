import { describe, expect, it } from 'bun:test';
import type { Project } from '$lib/api/types.js';
import {
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

describe('projectColor', () => {
  it('returns a color from the fixed palette', () => {
    for (const id of ['a', 'p1', 'long-project-id', '/repo/two']) {
      expect(PROJECT_AVATAR_COLORS).toContain(projectColor(id) as (typeof PROJECT_AVATAR_COLORS)[number]);
    }
  });

  it('is deterministic for the same id', () => {
    expect(projectColor('p1')).toBe(projectColor('p1'));
    expect(projectColor('repo-two')).toBe(projectColor('repo-two'));
  });

  it('falls back to the first palette color for an empty id', () => {
    expect(projectColor('')).toBe(PROJECT_AVATAR_COLORS[0]);
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
