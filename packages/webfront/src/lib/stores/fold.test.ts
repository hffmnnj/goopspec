import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { createFoldStore, fold, type FoldOrientation } from './fold.svelte';
import { createLayoutStore } from './layout.svelte';

/** A controllable matchMedia stand-in keyed by query string. */
interface FakeMedia {
  matches: boolean;
  listeners: Array<(e: MediaQueryListEvent) => void>;
  addEventListener: (type: 'change', cb: (e: MediaQueryListEvent) => void) => void;
  removeEventListener: (type: 'change', cb: (e: MediaQueryListEvent) => void) => void;
}

const HORIZONTAL_QUERY = '(horizontal-viewport-segments: 2)';
const VERTICAL_QUERY = '(vertical-viewport-segments: 2)';

function makeMedia(matches: boolean): FakeMedia {
  const media: FakeMedia = {
    matches,
    listeners: [],
    addEventListener: (_type, cb) => media.listeners.push(cb),
    removeEventListener: (_type, cb) => {
      media.listeners = media.listeners.filter((fn) => fn !== cb);
    },
  };
  return media;
}

describe('fold store', () => {
  let originalWindow: typeof globalThis.window | undefined;
  let registry: Map<string, FakeMedia>;

  function installMatchMedia(opts: { horizontal?: boolean; vertical?: boolean } = {}): void {
    registry = new Map([
      [HORIZONTAL_QUERY, makeMedia(opts.horizontal ?? false)],
      [VERTICAL_QUERY, makeMedia(opts.vertical ?? false)],
    ]);
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      writable: true,
      value: {
        matchMedia: (query: string) =>
          registry.get(query) ?? makeMedia(false),
      },
    });
  }

  /** Flip a query's match state and notify its subscribers. */
  function setMatch(query: string, matches: boolean): void {
    const media = registry.get(query);
    if (!media) return;
    media.matches = matches;
    for (const fn of media.listeners) {
      fn({ matches } as MediaQueryListEvent);
    }
  }

  beforeEach(() => {
    originalWindow = globalThis.window;
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      writable: true,
      value: originalWindow,
    });
  });

  describe('evaluate (pure state mapping)', () => {
    it('defaults to an unfolded single-segment state', () => {
      const store = createFoldStore(createLayoutStore());
      expect(store.isFolded).toBe(false);
      expect(store.segments).toBe(1);
      expect(store.orientation).toBe('none');
    });

    it('maps a horizontal fold to two side-by-side segments', () => {
      const layoutStore = createLayoutStore();
      const store = createFoldStore(layoutStore);

      store.evaluate(true, false);

      expect(store.orientation).toBe<FoldOrientation>('horizontal');
      expect(store.isFolded).toBe(true);
      expect(store.segments).toBe(2);
      expect(layoutStore.isFoldable).toBe(true);
      expect(layoutStore.mode).toBe('foldable');
    });

    it('tracks a vertical fold but does not enable the two-pane layout', () => {
      const layoutStore = createLayoutStore();
      const store = createFoldStore(layoutStore);

      store.evaluate(false, true);

      expect(store.orientation).toBe<FoldOrientation>('vertical');
      expect(store.isFolded).toBe(true);
      // Vertical fold falls back to single-column → not foldable mode.
      expect(layoutStore.isFoldable).toBe(false);
    });

    it('prefers horizontal when both axes report two segments', () => {
      const layoutStore = createLayoutStore();
      const store = createFoldStore(layoutStore);

      store.evaluate(true, true);

      expect(store.orientation).toBe<FoldOrientation>('horizontal');
      expect(layoutStore.isFoldable).toBe(true);
    });

    it('clears foldable state when the device folds back to one segment', () => {
      const layoutStore = createLayoutStore();
      const store = createFoldStore(layoutStore);

      store.evaluate(true, false);
      expect(layoutStore.isFoldable).toBe(true);

      store.evaluate(false, false);
      expect(store.isFolded).toBe(false);
      expect(store.orientation).toBe('none');
      expect(layoutStore.isFoldable).toBe(false);
    });
  });

  describe('init (matchMedia wiring)', () => {
    it('returns a no-op cleanup when matchMedia is unavailable', () => {
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        writable: true,
        value: undefined,
      });
      const store = createFoldStore(createLayoutStore());
      const cleanup = store.init();
      expect(typeof cleanup).toBe('function');
      cleanup();
      expect(store.isFolded).toBe(false);
    });

    it('detects a horizontal fold present at init time', () => {
      installMatchMedia({ horizontal: true });
      const layoutStore = createLayoutStore();
      const store = createFoldStore(layoutStore);

      store.init();

      expect(store.orientation).toBe('horizontal');
      expect(layoutStore.isFoldable).toBe(true);
    });

    it('reacts to a fold opening after init', () => {
      installMatchMedia({ horizontal: false });
      const layoutStore = createLayoutStore();
      const store = createFoldStore(layoutStore);

      store.init();
      expect(layoutStore.isFoldable).toBe(false);

      setMatch(HORIZONTAL_QUERY, true);

      expect(store.orientation).toBe('horizontal');
      expect(layoutStore.isFoldable).toBe(true);
    });

    it('reacts to a fold closing after init', () => {
      installMatchMedia({ horizontal: true });
      const layoutStore = createLayoutStore();
      const store = createFoldStore(layoutStore);

      store.init();
      expect(layoutStore.isFoldable).toBe(true);

      setMatch(HORIZONTAL_QUERY, false);

      expect(layoutStore.isFoldable).toBe(false);
      expect(store.orientation).toBe('none');
    });

    it('cleanup removes the matchMedia change listeners', () => {
      installMatchMedia({ horizontal: false });
      const store = createFoldStore(createLayoutStore());

      const cleanup = store.init();
      const horizontal = registry.get(HORIZONTAL_QUERY);
      const vertical = registry.get(VERTICAL_QUERY);
      expect(horizontal?.listeners.length).toBeGreaterThan(0);
      expect(vertical?.listeners.length).toBeGreaterThan(0);

      cleanup();

      expect(horizontal?.listeners.length).toBe(0);
      expect(vertical?.listeners.length).toBe(0);
    });
  });

  describe('reset', () => {
    it('returns to an unfolded state and clears the layout seam', () => {
      const layoutStore = createLayoutStore();
      const store = createFoldStore(layoutStore);
      store.evaluate(true, false);

      store.reset();

      expect(store.isFolded).toBe(false);
      expect(store.segments).toBe(1);
      expect(store.orientation).toBe('none');
      expect(layoutStore.isFoldable).toBe(false);
    });
  });

  it('exports a singleton', () => {
    expect(fold).toBeDefined();
    expect(typeof fold.init).toBe('function');
  });
});
