import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import type { Agent, OpenCodeClient } from '../api/types.js';
import { createAgentStore } from './agent.svelte.js';

const AGENTS: Agent[] = [
  { id: 'build', name: 'build', description: 'Build things' },
  { id: 'goop-orchestrator', name: 'goop-orchestrator', description: 'Coordinate work' },
  { id: 'goop-executor-high', name: 'goop-executor-high' },
];

function createMockClient(agents: Agent[] = AGENTS): OpenCodeClient {
  return {
    listAgents: mock(() => Promise.resolve(agents)),
  } as unknown as OpenCodeClient;
}

function installStorage(initial: [string, string][] = []): Map<string, string> {
  const storage = new Map<string, string>(initial);
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    writable: true,
    value: {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
        clear: () => storage.clear(),
      },
    },
  });
  return storage;
}

function restoreGlobal(key: string, descriptor: PropertyDescriptor | undefined): void {
  if (descriptor) Object.defineProperty(globalThis, key, descriptor);
  else delete (globalThis as Record<string, unknown>)[key];
}

describe('agent store', () => {
  let windowDescriptor: PropertyDescriptor | undefined;

  beforeEach(() => {
    windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  });

  afterEach(() => {
    restoreGlobal('window', windowDescriptor);
  });

  it('defaults to goop-orchestrator when available', async () => {
    const storage = installStorage();
    const store = createAgentStore(createMockClient());

    await store.refresh();

    expect(store.selectedAgentId).toBe('goop-orchestrator');
    expect(storage.get('goopspec-selected-agent')).toBe('goop-orchestrator');
  });

  it('exposes only selectable agents and defaults to visible orchestrator', async () => {
    const storage = installStorage([['goopspec-selected-agent', 'code-reviewer']]);
    const store = createAgentStore(
      createMockClient([
        { id: 'build', name: 'build', mode: 'primary' },
        { id: 'code-reviewer', name: 'Code Reviewer', mode: 'subagent' },
        { id: 'goop-orchestrator', name: 'goop-orchestrator', mode: 'primary' },
        { id: 'doc-writer', name: 'Doc Writer', mode: 'subagent' },
        { id: 'compaction', name: 'Compaction', mode: 'primary', hidden: true },
        { id: 'plan', name: 'Plan', mode: 'all' },
        { id: 'legacy-agent', name: 'Legacy Agent' },
      ]),
    );

    await store.refresh();

    expect(store.allAgents.map((candidate) => candidate.id)).toEqual([
      'build',
      'code-reviewer',
      'goop-orchestrator',
      'doc-writer',
      'compaction',
      'plan',
      'legacy-agent',
    ]);
    expect(store.agents.map((candidate) => candidate.id)).toEqual([
      'build',
      'goop-orchestrator',
      'plan',
      'legacy-agent',
    ]);
    expect(store.selectedAgentId).toBe('goop-orchestrator');
    expect(storage.get('goopspec-selected-agent')).toBe('goop-orchestrator');
  });

  it('restores a persisted selection when available', async () => {
    installStorage([['goopspec-selected-agent', 'goop-executor-high']]);
    const store = createAgentStore(createMockClient());

    await store.refresh();

    expect(store.selectedAgentId).toBe('goop-executor-high');
    expect(store.selectedAgent?.id).toBe('goop-executor-high');
  });

  it('falls back to the first agent when orchestrator is absent', async () => {
    installStorage();
    const store = createAgentStore(createMockClient([{ id: 'build', name: 'build' }]));

    await store.refresh();

    expect(store.selectedAgentId).toBe('build');
  });

  it('select persists valid agent ids and ignores unknown ids', async () => {
    const storage = installStorage();
    const store = createAgentStore(createMockClient());
    await store.refresh();

    store.select('goop-executor-high');
    store.select('missing');

    expect(store.selectedAgentId).toBe('goop-executor-high');
    expect(storage.get('goopspec-selected-agent')).toBe('goop-executor-high');
  });
});
