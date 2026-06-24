import { describe, expect, it, mock } from 'bun:test';
import type { SlashCommand, OpenCodeClient } from '../api/types.js';
import { createCommandStore } from './commands.svelte.js';

const COMMANDS: SlashCommand[] = [
  { name: 'help', description: 'Show help' },
  { name: 'commit', description: 'Commit changes' },
];

function createMockClient(impl: () => Promise<SlashCommand[]>): OpenCodeClient {
  return { listCommands: mock(impl) } as unknown as OpenCodeClient;
}

describe('command store', () => {
  it('hydrates commands from listCommands()', async () => {
    const store = createCommandStore(createMockClient(() => Promise.resolve(COMMANDS)));
    await store.refresh();
    expect(store.commands).toEqual(COMMANDS);
    expect(store.loaded).toBe(true);
    expect(store.error).toBeNull();
  });

  it('degrades to an empty list on failure', async () => {
    const store = createCommandStore(createMockClient(() => Promise.reject(new Error('offline'))));
    await store.refresh();
    expect(store.commands).toEqual([]);
    expect(store.error).toBe('offline');
  });

  it('ensureLoaded hydrates only once', async () => {
    const listCommands = mock(() => Promise.resolve(COMMANDS));
    const store = createCommandStore({ listCommands } as unknown as OpenCodeClient);
    await store.ensureLoaded();
    await store.ensureLoaded();
    expect(listCommands).toHaveBeenCalledTimes(1);
  });

  it('reset clears the cached catalog', async () => {
    const store = createCommandStore(createMockClient(() => Promise.resolve(COMMANDS)));
    await store.refresh();
    store.reset();
    expect(store.commands).toEqual([]);
    expect(store.loaded).toBe(false);
  });
});
