import { describe, expect, it, mock } from 'bun:test';
import type { GlobalEvent, OpenCodeClient, VcsInfo } from '$lib/api/types.js';
import { createVcsStore } from '$lib/stores/vcs.svelte.js';
import { hasBranch, branchLabel, isDirty, ariaLabel, isVcsRefreshEvent } from './vcs-badge.js';

function vcsInfo(overrides: Partial<NonNullable<VcsInfo>> = {}): VcsInfo {
  return { branch: 'main', dirty: false, ahead: 0, behind: 0, ...overrides };
}

function clientWith(getVcsInfo: OpenCodeClient['getVcsInfo']): OpenCodeClient {
  return { getVcsInfo } as unknown as OpenCodeClient;
}

describe('hasBranch', () => {
  it('is true only when a non-empty branch is present', () => {
    expect(hasBranch(vcsInfo({ branch: 'feat/x' }))).toBe(true);
    expect(hasBranch(vcsInfo({ branch: '' }))).toBe(false);
    expect(hasBranch(null)).toBe(false);
  });
});

describe('branchLabel', () => {
  it('returns the branch name when present', () => {
    expect(branchLabel(vcsInfo({ branch: 'develop' }))).toBe('develop');
  });

  it('returns empty when no branch is available', () => {
    expect(branchLabel(null)).toBe('');
    expect(branchLabel(vcsInfo({ branch: '' }))).toBe('');
  });
});

describe('isDirty', () => {
  it('reflects the dirty flag', () => {
    expect(isDirty(vcsInfo({ dirty: true }))).toBe(true);
    expect(isDirty(vcsInfo({ dirty: false }))).toBe(false);
    expect(isDirty(null)).toBe(false);
  });
});

describe('ariaLabel', () => {
  it('describes branch and clean state', () => {
    expect(ariaLabel(vcsInfo({ branch: 'main', dirty: false }))).toBe('Branch main');
  });

  it('describes uncommitted changes when dirty', () => {
    expect(ariaLabel(vcsInfo({ branch: 'main', dirty: true }))).toBe(
      'Branch main, uncommitted changes'
    );
  });

  it('reports no version control when empty', () => {
    expect(ariaLabel(null)).toBe('No version control');
  });
});

describe('isVcsRefreshEvent', () => {
  it('matches vcs.* and branch events', () => {
    expect(isVcsRefreshEvent({ type: 'vcs.branch.updated' })).toBe(true);
    expect(isVcsRefreshEvent({ type: 'vcs.status.changed' })).toBe(true);
    expect(isVcsRefreshEvent({ type: 'git.branch.checkout' })).toBe(true);
  });

  it('ignores unrelated events', () => {
    expect(isVcsRefreshEvent({ type: 'session.created' })).toBe(false);
    expect(isVcsRefreshEvent({ type: 'message.completed' })).toBe(false);
    expect(isVcsRefreshEvent({} as GlobalEvent)).toBe(false);
  });
});

describe('vcs store (badge data source)', () => {
  it('loads branch info from the adapter', async () => {
    const store = createVcsStore(clientWith(mock(() => Promise.resolve(vcsInfo({ branch: 'feat/y' })))));
    await store.refresh();
    expect(branchLabel(store.info)).toBe('feat/y');
  });

  it('renders nothing (null info) when the adapter returns null', async () => {
    const store = createVcsStore(clientWith(mock(() => Promise.resolve(null))));
    await store.refresh();
    expect(store.info).toBeNull();
    expect(hasBranch(store.info)).toBe(false);
  });

  it('degrades gracefully and does not throw when the adapter call fails', async () => {
    const store = createVcsStore(clientWith(mock(() => Promise.reject(new Error('boom')))));
    await expect(store.refresh()).resolves.toBeUndefined();
    expect(store.info).toBeNull();
  });
});
