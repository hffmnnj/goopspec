import { describe, expect, it, mock } from 'bun:test';
import type { Project, Session } from '$lib/api/types.js';
import { syncSessionRoute } from './route-sync.js';

function project(path = '/repo'): Project {
  return { id: path, worktree: path, time: { created: 1 } };
}

function session(id = 'ses_123'): Session {
  return { id, title: 'Session', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
}

describe('session route synchronization', () => {
  it('opens the deep-linked project and activates the requested session', async () => {
    const ensureProjectPath = mock(() => Promise.resolve(project('/repo')));
    const load = mock(() => Promise.resolve());
    const select = mock(() => undefined);

    const result = await syncSessionRoute({
      projectPath: '/repo',
      sessionId: 'ses_123',
      projectsStore: { ensureProjectPath },
      sessionsStore: { sorted: [session('ses_123')], load },
      activeSessionStore: { activeId: null, select },
    });

    expect(result).toEqual({ status: 'active', sessionId: 'ses_123' });
    expect(ensureProjectPath).toHaveBeenCalledWith('/repo');
    expect(load).toHaveBeenCalled();
    expect(select).toHaveBeenCalledWith('ses_123');
  });

  it('reports session-not-found without mutating the active session', async () => {
    const select = mock(() => undefined);

    const result = await syncSessionRoute({
      projectPath: '/repo',
      sessionId: 'missing',
      projectsStore: { ensureProjectPath: mock(() => Promise.resolve(project('/repo'))) },
      sessionsStore: { sorted: [session('ses_123')], load: mock(() => Promise.resolve()) },
      activeSessionStore: { activeId: null, select },
    });

    expect(result).toEqual({ status: 'session-not-found', sessionId: 'missing' });
    expect(select).not.toHaveBeenCalled();
  });
});
