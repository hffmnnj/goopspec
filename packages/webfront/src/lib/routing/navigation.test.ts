import { describe, expect, it } from 'bun:test';
import { projectRoute, sessionRoute, needsNavigation } from './navigation.js';

describe('route navigation helpers', () => {
  it('builds project routes from encoded worktrees', () => {
    expect(projectRoute({ worktree: '/home/james/Documents/goopspec' })).toBe(
      '/L2hvbWUvamFtZXMvRG9jdW1lbnRzL2dvb3BzcGVj'
    );
  });

  it('builds session routes with an encoded session segment', () => {
    expect(sessionRoute({ worktree: '/repo' }, 'ses_123/abc')).toBe('/L3JlcG8/session/ses_123%2Fabc');
  });

  it('guards no-op navigations', () => {
    expect(needsNavigation('/repo', '/repo')).toBe(false);
    expect(needsNavigation('/repo', '/other')).toBe(true);
  });
});
