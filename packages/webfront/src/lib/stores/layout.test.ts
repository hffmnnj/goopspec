import { describe, afterEach, it, expect } from 'bun:test';
import {
  createLayoutStore,
  deriveMode,
  layout,
  BREAKPOINTS,
  SIDEBAR_WIDTH,
  clampSidebarWidth,
} from './layout.svelte';

function restoreGlobalWindow(): void {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  if (descriptor) {
    Object.defineProperty(globalThis, 'window', descriptor);
  } else {
    delete (globalThis as Record<string, unknown>).window;
  }
}

function installMockStorage(initial: Map<string, string> = new Map()): Map<string, string> {
  const storage = new Map(initial);
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

describe('layout store', () => {
  afterEach(() => {
    restoreGlobalWindow();
  });

  describe('deriveMode', () => {
    it('classifies phone widths', () => {
      expect(deriveMode(360)).toBe('phone');
      expect(deriveMode(BREAKPOINTS.phone - 1)).toBe('phone');
    });

    it('classifies tablet widths', () => {
      expect(deriveMode(BREAKPOINTS.phone)).toBe('tablet');
      expect(deriveMode(768)).toBe('tablet');
      expect(deriveMode(BREAKPOINTS.desktop - 1)).toBe('tablet');
    });

    it('classifies desktop widths', () => {
      expect(deriveMode(BREAKPOINTS.desktop)).toBe('desktop');
      expect(deriveMode(1280)).toBe('desktop');
    });
  });

  describe('mode derivation from width', () => {
    it('derives mode reactively when width changes', () => {
      const store = createLayoutStore(1280);
      expect(store.mode).toBe('desktop');
      expect(store.isDesktop).toBe(true);

      store.setWidth(768);
      expect(store.mode).toBe('tablet');
      expect(store.isTablet).toBe(true);

      store.setWidth(360);
      expect(store.mode).toBe('phone');
      expect(store.isPhone).toBe(true);
    });

    it('defaults to desktop width when none provided', () => {
      const store = createLayoutStore();
      expect(store.mode).toBe('desktop');
    });
  });

  describe('panel toggles', () => {
    it('toggles the sidebar', () => {
      const store = createLayoutStore(1280);
      expect(store.sidebarOpen).toBe(true);
      store.toggleSidebar();
      expect(store.sidebarOpen).toBe(false);
      store.toggleSidebar();
      expect(store.sidebarOpen).toBe(true);
    });

    it('toggles the file panel', () => {
      const store = createLayoutStore(1280);
      expect(store.filePanelOpen).toBe(false);
      store.toggleFilePanel();
      expect(store.filePanelOpen).toBe(true);
    });

    it('sets panel open state explicitly', () => {
      const store = createLayoutStore(1280);
      store.setSidebar(false);
      expect(store.sidebarOpen).toBe(false);
      store.setFilePanel(true);
      expect(store.filePanelOpen).toBe(true);
    });
  });

  describe('mobile view switching', () => {
    it('defaults to the chat view', () => {
      const store = createLayoutStore(360);
      expect(store.mobileView).toBe('chat');
    });

    it('switches between views', () => {
      const store = createLayoutStore(360);
      store.setMobileView('sessions');
      expect(store.mobileView).toBe('sessions');
      store.setMobileView('files');
      expect(store.mobileView).toBe('files');
    });
  });

  describe('closeOverlays', () => {
    it('closes both overlays on phone', () => {
      const store = createLayoutStore(360);
      store.setSidebar(true);
      store.setFilePanel(true);
      store.closeOverlays();
      expect(store.sidebarOpen).toBe(false);
      expect(store.filePanelOpen).toBe(false);
    });

    it('leaves panels untouched on desktop', () => {
      const store = createLayoutStore(1280);
      store.setSidebar(true);
      store.setFilePanel(true);
      store.closeOverlays();
      expect(store.sidebarOpen).toBe(true);
      expect(store.filePanelOpen).toBe(true);
    });
  });

  describe('foldable seam (T9.2)', () => {
    it('exposes foldable state, defaulting off', () => {
      const store = createLayoutStore();
      expect(store.isFoldable).toBe(false);
      store.setFoldable(true);
      expect(store.isFoldable).toBe(true);
    });
  });

  describe('sidebar width', () => {
    it('defaults to the configured default width', () => {
      const store = createLayoutStore(1280);
      expect(store.sidebarWidth).toBe(SIDEBAR_WIDTH.default);
    });

    it('clamps below the minimum', () => {
      expect(clampSidebarWidth(SIDEBAR_WIDTH.min - 100)).toBe(SIDEBAR_WIDTH.min);
      const store = createLayoutStore(1280);
      store.setSidebarWidth(50);
      expect(store.sidebarWidth).toBe(SIDEBAR_WIDTH.min);
    });

    it('clamps above the maximum', () => {
      expect(clampSidebarWidth(SIDEBAR_WIDTH.max + 100)).toBe(SIDEBAR_WIDTH.max);
      const store = createLayoutStore(1280);
      store.setSidebarWidth(9999);
      expect(store.sidebarWidth).toBe(SIDEBAR_WIDTH.max);
    });

    it('rounds and accepts in-range widths', () => {
      const store = createLayoutStore(1280);
      store.setSidebarWidth(312.7);
      expect(store.sidebarWidth).toBe(313);
    });

    it('falls back to the default for non-finite input', () => {
      expect(clampSidebarWidth(Number.NaN)).toBe(SIDEBAR_WIDTH.default);
    });

    it('nudges the width by a delta, staying clamped', () => {
      const store = createLayoutStore(1280);
      store.setSidebarWidth(SIDEBAR_WIDTH.max - 5);
      store.nudgeSidebarWidth(20);
      expect(store.sidebarWidth).toBe(SIDEBAR_WIDTH.max);
      store.setSidebarWidth(SIDEBAR_WIDTH.min + 5);
      store.nudgeSidebarWidth(-20);
      expect(store.sidebarWidth).toBe(SIDEBAR_WIDTH.min);
    });

    it('persists the chosen width to localStorage', () => {
      const storage = installMockStorage();
      const store = createLayoutStore(1280);
      store.setSidebarWidth(320);
      expect(storage.get('goopspec-sidebar-width')).toBe('320');
    });

    it('restores a persisted width on construction', () => {
      installMockStorage(new Map([['goopspec-sidebar-width', '360']]));
      const store = createLayoutStore(1280);
      expect(store.sidebarWidth).toBe(360);
    });

    it('clamps a persisted width that is out of range', () => {
      installMockStorage(new Map([['goopspec-sidebar-width', '9999']]));
      const store = createLayoutStore(1280);
      expect(store.sidebarWidth).toBe(SIDEBAR_WIDTH.max);
    });

    it('ignores a malformed persisted width', () => {
      installMockStorage(new Map([['goopspec-sidebar-width', 'not-a-number']]));
      const store = createLayoutStore(1280);
      expect(store.sidebarWidth).toBe(SIDEBAR_WIDTH.default);
    });
  });

  describe('persistence', () => {
    it('persists panel preferences to localStorage', () => {
      const storage = installMockStorage();
      const store = createLayoutStore(1280);
      store.setSidebar(false);
      store.setFilePanel(true);

      expect(JSON.parse(storage.get('goopspec-layout') ?? '{}')).toEqual({
        sidebarOpen: false,
        filePanelOpen: true,
      });
    });

    it('hydrates panel preferences from localStorage', () => {
      installMockStorage(
        new Map([
          ['goopspec-layout', JSON.stringify({ sidebarOpen: false, filePanelOpen: true })],
        ])
      );
      const store = createLayoutStore(1280);
      expect(store.sidebarOpen).toBe(false);
      expect(store.filePanelOpen).toBe(true);
    });

    it('ignores malformed localStorage entries', () => {
      installMockStorage(new Map([['goopspec-layout', 'not valid json']]));
      const store = createLayoutStore(1280);
      expect(store.sidebarOpen).toBe(true);
      expect(store.filePanelOpen).toBe(false);
    });
  });

  describe('init', () => {
    it('returns a no-op cleanup with no window', () => {
      const store = createLayoutStore();
      const cleanup = store.init();
      expect(typeof cleanup).toBe('function');
      cleanup();
    });
  });

  it('singleton is exported', () => {
    expect(layout).toBeDefined();
    expect(layout.mode).toBe('desktop');
  });
});
