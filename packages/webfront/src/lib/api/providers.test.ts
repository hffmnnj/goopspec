import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import type { OpenCodeClient, Provider } from './types.js';
import {
  countModels,
  fetchProviders,
  findModel,
  findModelInProvider,
  flattenModels,
  formatContext,
  groupModelsByProvider,
} from './providers.js';

function createMockClient(providers: Provider[] = []): OpenCodeClient {
  return {
    listSessions: mock(() => Promise.resolve([])),
    createSession: mock(() => Promise.resolve({} as never)),
    deleteSession: mock(() => Promise.resolve()),
    renameSession: mock(() => Promise.resolve({} as never)),
    getMessages: mock(() => Promise.resolve([])),
    sendMessage: mock(() => Promise.resolve({} as never)),
    subscribeEvents: () => () => undefined,
    listProviders: mock(() => Promise.resolve(providers)),
    getConfig: mock(() => Promise.resolve({})),
    updateConfig: mock(() => Promise.resolve({})),
    readFile: mock(() => Promise.resolve('')),
  } as unknown as OpenCodeClient;
}

const PROVIDERS: Provider[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o', context: 128_000 },
      { id: 'gpt-4o-mini', name: 'GPT-4o mini', context: 128_000 },
    ],
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    models: [{ id: 'claude-opus', name: 'Claude Opus', context: 200_000 }],
  },
];

describe('fetchProviders', () => {
  it('calls listProviders and sorts alphabetically by name', async () => {
    const client = createMockClient(PROVIDERS);

    const result = await fetchProviders(client);

    expect(client.listProviders).toHaveBeenCalled();
    expect(result.map((p) => p.id)).toEqual(['anthropic', 'openai']);
  });

  it('returns an empty array when no providers are configured', async () => {
    const client = createMockClient([]);
    expect(await fetchProviders(client)).toEqual([]);
  });
});

describe('flattenModels', () => {
  it('flattens models with provider context, preserving order', () => {
    const flat = flattenModels(PROVIDERS);

    expect(flat).toHaveLength(3);
    expect(flat[0]).toEqual({
      providerId: 'openai',
      providerName: 'OpenAI',
      model: { id: 'gpt-4o', name: 'GPT-4o', context: 128_000 },
    });
    expect(flat.map((m) => m.model.id)).toEqual(['gpt-4o', 'gpt-4o-mini', 'claude-opus']);
  });

  it('returns an empty list for no providers', () => {
    expect(flattenModels([])).toEqual([]);
  });
});

describe('findModel', () => {
  it('locates a model by id across providers with provider context', () => {
    expect(findModel(PROVIDERS, 'claude-opus')).toEqual({
      providerId: 'anthropic',
      providerName: 'Anthropic',
      model: { id: 'claude-opus', name: 'Claude Opus', context: 200_000 },
    });
  });

  it('returns undefined for an unknown model id', () => {
    expect(findModel(PROVIDERS, 'nope')).toBeUndefined();
  });
});

describe('findModelInProvider', () => {
  it('finds a model scoped to one provider', () => {
    expect(findModelInProvider(PROVIDERS, 'openai', 'gpt-4o-mini')).toEqual({
      id: 'gpt-4o-mini',
      name: 'GPT-4o mini',
      context: 128_000,
    });
  });

  it('returns undefined when the provider or model is missing', () => {
    expect(findModelInProvider(PROVIDERS, 'openai', 'claude-opus')).toBeUndefined();
    expect(findModelInProvider(PROVIDERS, 'ghost', 'gpt-4o')).toBeUndefined();
  });
});

describe('groupModelsByProvider', () => {
  it('groups models keyed by provider id', () => {
    const grouped = groupModelsByProvider(PROVIDERS);

    expect([...grouped.keys()]).toEqual(['openai', 'anthropic']);
    expect(grouped.get('openai')?.map((m) => m.id)).toEqual(['gpt-4o', 'gpt-4o-mini']);
    expect(grouped.get('anthropic')?.map((m) => m.id)).toEqual(['claude-opus']);
  });
});

describe('countModels', () => {
  it('counts models across providers', () => {
    expect(countModels(PROVIDERS)).toBe(3);
    expect(countModels([])).toBe(0);
  });
});

describe('formatContext', () => {
  it('formats millions, thousands, and raw counts', () => {
    expect(formatContext(2_000_000)).toBe('2M tokens');
    expect(formatContext(1_500_000)).toBe('1.5M tokens');
    expect(formatContext(128_000)).toBe('128K tokens');
    expect(formatContext(8_000)).toBe('8K tokens');
    expect(formatContext(512)).toBe('512 tokens');
  });

  it('returns undefined for missing or invalid context', () => {
    expect(formatContext(undefined)).toBeUndefined();
    expect(formatContext(0)).toBeUndefined();
    expect(formatContext(-1)).toBeUndefined();
    expect(formatContext(Number.NaN)).toBeUndefined();
  });
});

// --- Settings store persistence -------------------------------------------

import {
  createSettingsStore,
  parseSettings,
  resolveReducedMotion,
} from '../stores/settings.svelte.js';

describe('parseSettings', () => {
  it('fills defaults for missing or invalid fields', () => {
    expect(parseSettings(null)).toEqual({ motion: 'system', density: 'comfortable' });
    expect(parseSettings({ motion: 'bogus', density: 'compact' })).toEqual({
      motion: 'system',
      density: 'compact',
    });
    expect(parseSettings({ motion: 'reduced', density: 42 })).toEqual({
      motion: 'reduced',
      density: 'comfortable',
    });
  });
});

describe('resolveReducedMotion', () => {
  it('honours an explicit override and otherwise follows the system', () => {
    expect(resolveReducedMotion('reduced', false)).toBe(true);
    expect(resolveReducedMotion('full', true)).toBe(false);
    expect(resolveReducedMotion('system', true)).toBe(true);
    expect(resolveReducedMotion('system', false)).toBe(false);
  });
});

describe('settings store persistence', () => {
  const storage = new Map<string, string>();
  let windowDescriptor: PropertyDescriptor | undefined;
  let documentDescriptor: PropertyDescriptor | undefined;

  beforeEach(() => {
    storage.clear();
    const mockStorage = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
      clear: () => storage.clear(),
    };

    // defineProperty works even when the global is a read-only Bun binding.
    windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
    documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      writable: true,
      value: { localStorage: mockStorage },
    });
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      writable: true,
      value: { documentElement: { setAttribute: () => undefined } },
    });
  });

  afterEach(() => {
    restoreGlobal('window', windowDescriptor);
    restoreGlobal('document', documentDescriptor);
  });

  function restoreGlobal(key: string, descriptor: PropertyDescriptor | undefined): void {
    if (descriptor) {
      Object.defineProperty(globalThis, key, descriptor);
    } else {
      delete (globalThis as Record<string, unknown>)[key];
    }
  }

  it('persists motion and density changes to localStorage', () => {
    const store = createSettingsStore();

    store.setMotion('reduced');
    store.setDensity('compact');

    const persisted = JSON.parse(storage.get('goopspec-settings') ?? '{}');
    expect(persisted).toEqual({ motion: 'reduced', density: 'compact' });
    expect(store.current.motion).toBe('reduced');
    expect(store.current.density).toBe('compact');
  });

  it('reset returns settings to defaults and persists them', () => {
    const store = createSettingsStore();
    store.setMotion('full');

    store.reset();

    expect(store.current).toEqual({ motion: 'system', density: 'comfortable' });
    expect(JSON.parse(storage.get('goopspec-settings') ?? '{}')).toEqual({
      motion: 'system',
      density: 'comfortable',
    });
  });
});
