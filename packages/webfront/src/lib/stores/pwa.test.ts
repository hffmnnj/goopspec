import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import {
  createPwaStore,
  pwa,
  isDismissalActive,
  type BeforeInstallPromptEvent
} from './pwa.svelte';

const STORAGE_KEY = 'goopspec-pwa-install-dismissed';
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** A minimal in-memory localStorage stand-in. */
function makeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    removeItem: (k: string) => map.delete(k),
    setItem: (k: string, v: string) => {
      map.set(k, v);
    }
  } as Storage;
}

/** Build a fake deferred beforeinstallprompt event. */
function makePromptEvent(outcome: 'accepted' | 'dismissed'): BeforeInstallPromptEvent {
  return {
    platforms: ['web'],
    userChoice: Promise.resolve({ outcome, platform: 'web' }),
    prompt: mock(() => Promise.resolve()),
    preventDefault: mock(() => undefined)
  } as unknown as BeforeInstallPromptEvent;
}

describe('isDismissalActive', () => {
  const now = 1_000_000_000_000;

  it('returns false when never dismissed', () => {
    expect(isDismissalActive(null, now)).toBe(false);
  });

  it('returns true within the TTL window', () => {
    expect(isDismissalActive(now - 1000, now)).toBe(true);
  });

  it('returns false after the TTL window elapses', () => {
    expect(isDismissalActive(now - DISMISS_TTL_MS - 1, now)).toBe(false);
  });
});

describe('PwaStore', () => {
  let originalLocalStorage: Storage | undefined;
  let originalOnLine: PropertyDescriptor | undefined;

  beforeEach(() => {
    originalLocalStorage = globalThis.localStorage;
    Object.defineProperty(globalThis, 'localStorage', {
      value: makeStorage(),
      configurable: true,
      writable: true
    });

    originalOnLine = Object.getOwnPropertyDescriptor(globalThis.navigator, 'onLine');
    Object.defineProperty(globalThis.navigator, 'onLine', {
      value: true,
      configurable: true,
      writable: true
    });
  });

  afterEach(() => {
    if (originalLocalStorage) {
      Object.defineProperty(globalThis, 'localStorage', {
        value: originalLocalStorage,
        configurable: true,
        writable: true
      });
    }
    if (originalOnLine) {
      Object.defineProperty(globalThis.navigator, 'onLine', originalOnLine);
    }
  });

  it('starts not-installable, not-installed, online, not-dismissed', () => {
    const store = createPwaStore();
    expect(store.installable).toBe(false);
    expect(store.installed).toBe(false);
    expect(store.offline).toBe(false);
    expect(store.dismissed).toBe(false);
    expect(store.shouldShowBanner).toBe(false);
  });

  it('reflects an offline navigator at construction', () => {
    Object.defineProperty(globalThis.navigator, 'onLine', {
      value: false,
      configurable: true,
      writable: true
    });
    const store = createPwaStore();
    expect(store.offline).toBe(true);
  });

  it('becomes installable when a deferred prompt is set', () => {
    const store = createPwaStore();
    store.setDeferredPrompt(makePromptEvent('accepted'));
    expect(store.installable).toBe(true);
    expect(store.shouldShowBanner).toBe(true);
  });

  it('does not show the banner when already installed', () => {
    const store = createPwaStore();
    store.installed = true;
    store.setDeferredPrompt(makePromptEvent('accepted'));
    expect(store.installable).toBe(false);
    expect(store.shouldShowBanner).toBe(false);
  });

  it('promptInstall accepts and marks installed', async () => {
    const store = createPwaStore();
    const event = makePromptEvent('accepted');
    store.setDeferredPrompt(event);

    const outcome = await store.promptInstall();

    expect(outcome).toBe('accepted');
    expect(event.prompt).toHaveBeenCalledTimes(1);
    expect(store.installed).toBe(true);
    expect(store.installable).toBe(false);
  });

  it('promptInstall handles a dismissed choice without installing', async () => {
    const store = createPwaStore();
    store.setDeferredPrompt(makePromptEvent('dismissed'));

    const outcome = await store.promptInstall();

    expect(outcome).toBe('dismissed');
    expect(store.installed).toBe(false);
    expect(store.installable).toBe(false);
  });

  it('promptInstall returns null when no deferred prompt exists', async () => {
    const store = createPwaStore();
    expect(await store.promptInstall()).toBeNull();
  });

  it('consumes the deferred prompt so it cannot fire twice', async () => {
    const store = createPwaStore();
    store.setDeferredPrompt(makePromptEvent('accepted'));

    await store.promptInstall();
    const second = await store.promptInstall();

    expect(second).toBeNull();
  });

  it('dismiss hides the banner and persists the dismissal', () => {
    const store = createPwaStore();
    store.setDeferredPrompt(makePromptEvent('accepted'));
    expect(store.shouldShowBanner).toBe(true);

    store.dismiss();

    expect(store.dismissed).toBe(true);
    expect(store.shouldShowBanner).toBe(false);
    expect(globalThis.localStorage.getItem(STORAGE_KEY)).not.toBeNull();
  });

  it('restores an active dismissal from storage on construction', () => {
    globalThis.localStorage.setItem(STORAGE_KEY, String(Date.now()));
    const store = createPwaStore();
    expect(store.dismissed).toBe(true);
  });

  it('ignores a stale (expired) dismissal from storage', () => {
    globalThis.localStorage.setItem(STORAGE_KEY, String(Date.now() - DISMISS_TTL_MS - 1000));
    const store = createPwaStore();
    expect(store.dismissed).toBe(false);
  });

  it('resetDismissal clears the persisted flag', () => {
    const store = createPwaStore();
    store.dismiss();
    expect(store.dismissed).toBe(true);

    store.resetDismissal();

    expect(store.dismissed).toBe(false);
    expect(globalThis.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});

describe('PwaStore init (DOM events)', () => {
  let listeners: Map<string, EventListener[]>;
  let originalWindow: typeof globalThis.window | undefined;

  beforeEach(() => {
    listeners = new Map();
    originalWindow = globalThis.window;

    const fakeWindow = {
      addEventListener: (type: string, fn: EventListener) => {
        const arr = listeners.get(type) ?? [];
        arr.push(fn);
        listeners.set(type, arr);
      },
      removeEventListener: (type: string, fn: EventListener) => {
        const arr = listeners.get(type) ?? [];
        listeners.set(
          type,
          arr.filter((f) => f !== fn)
        );
      },
      matchMedia: (query: string) =>
        ({
          matches: false,
          media: query,
          addEventListener: () => undefined,
          removeEventListener: () => undefined
        }) as unknown as MediaQueryList,
      navigator: { onLine: true }
    };

    Object.defineProperty(globalThis, 'window', {
      value: fakeWindow,
      configurable: true,
      writable: true
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'window', {
      value: originalWindow,
      configurable: true,
      writable: true
    });
  });

  function dispatch(type: string, event: Event): void {
    for (const fn of listeners.get(type) ?? []) fn(event);
  }

  it('captures beforeinstallprompt, prevents default, and becomes installable', () => {
    const store = createPwaStore();
    store.init();

    const evt = makePromptEvent('accepted') as unknown as Event;
    dispatch('beforeinstallprompt', evt);

    expect((evt as unknown as { preventDefault: ReturnType<typeof mock> }).preventDefault).toHaveBeenCalled();
    expect(store.installable).toBe(true);
  });

  it('online/offline events toggle the offline flag', () => {
    const store = createPwaStore();
    store.init();

    dispatch('offline', new Event('offline'));
    expect(store.offline).toBe(true);

    dispatch('online', new Event('online'));
    expect(store.offline).toBe(false);
  });

  it('appinstalled marks installed and clears installable', () => {
    const store = createPwaStore();
    store.init();
    store.setDeferredPrompt(makePromptEvent('accepted'));
    expect(store.installable).toBe(true);

    dispatch('appinstalled', new Event('appinstalled'));

    expect(store.installed).toBe(true);
    expect(store.installable).toBe(false);
  });

  it('cleanup removes the registered listeners', () => {
    const store = createPwaStore();
    const cleanup = store.init();

    const before = (listeners.get('online') ?? []).length;
    expect(before).toBeGreaterThan(0);

    cleanup();

    expect((listeners.get('online') ?? []).length).toBe(0);
  });
});

describe('PWA singleton', () => {
  it('exports a singleton instance', () => {
    expect(pwa).toBeDefined();
    expect(typeof pwa.init).toBe('function');
  });
});
