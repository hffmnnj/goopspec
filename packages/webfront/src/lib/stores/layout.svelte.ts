/**
 * Layout store — Svelte 5 runes.
 *
 * Single source of truth for the responsive app-shell layout: which panels are
 * open, which view is focused on phone, and the current breakpoint derived from
 * the viewport width. Panel open/closed preferences persist to localStorage so
 * a returning user gets the layout they left.
 *
 * SSR-safe: every browser API access is guarded so static prerender and tests
 * (no `window`) construct the store without throwing. Width derivation is wired
 * by `init()` (call from `onMount`), which returns a cleanup function.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ T9.2 SEAM — FOLDABLE                                                       │
 * │ The shell's grid is driven by `mode` (a LayoutMode union). T9.2 adds a    │
 * │ foldable two-pane mode by:                                                 │
 * │   1. extending `LayoutMode` with `'foldable'`,                            │
 * │   2. having a `fold` store (T9.2) report segment state, and               │
 * │   3. calling `setFoldable(active)` below so `mode` resolves to            │
 * │      'foldable' when the device is unfolded into two segments.            │
 * │ The width-based derivation already lives in `deriveMode()`; foldable      │
 * │ detection layers on top without rewriting the shell.                       │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/** Standardized breakpoints (px). Mirrored in `responsive.css`. */
export const BREAKPOINTS = {
  phone: 640,
  desktop: 1024,
} as const;

export type LayoutMode = 'phone' | 'tablet' | 'desktop';

/** The focused column on phone, where only one panel is visible at a time. */
export type MobileView = 'sessions' | 'chat' | 'files';

const STORAGE_KEY = 'goopspec-layout';

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

/** Derive the layout mode from a viewport width in CSS pixels. */
export function deriveMode(width: number): LayoutMode {
  if (width >= BREAKPOINTS.desktop) return 'desktop';
  if (width >= BREAKPOINTS.phone) return 'tablet';
  return 'phone';
}

interface StoredLayout {
  sidebarOpen: boolean;
  filePanelOpen: boolean;
}

function readStored(): Partial<StoredLayout> | null {
  if (!isBrowser()) return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return null;
    const record = parsed as Record<string, unknown>;
    const result: Partial<StoredLayout> = {};
    if (typeof record.sidebarOpen === 'boolean') result.sidebarOpen = record.sidebarOpen;
    if (typeof record.filePanelOpen === 'boolean') result.filePanelOpen = record.filePanelOpen;
    return result;
  } catch {
    return null;
  }
}

function writeStored(state: StoredLayout): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Persistence is best-effort (private mode / disabled storage).
  }
}

class LayoutStore {
  /** Left session sidebar open (desktop/tablet collapse; phone overlay). */
  sidebarOpen = $state(true);
  /** Right file panel open (desktop collapse; tablet/phone overlay). */
  filePanelOpen = $state(false);
  /** Focused column on phone. Chat is the default view. */
  mobileView = $state<MobileView>('chat');

  /** Raw viewport width in CSS px; updated by the resize listener. */
  private width = $state<number>(BREAKPOINTS.desktop);

  /**
   * T9.2 SEAM: when a foldable device reports two horizontal segments, T9.2
   * flips this on via `setFoldable(true)`. The base shell ignores it; the
   * foldable layout (T9.2) reads `mode === 'foldable'` after extending the
   * union. Kept private + width-independent so width derivation is unaffected.
   */
  private foldable = $state(false);

  /** Current layout mode, derived from width (+ foldable seam). */
  readonly mode = $derived<LayoutMode>(deriveMode(this.width));

  /** Convenience flags for templates. */
  readonly isPhone = $derived(this.mode === 'phone');
  readonly isTablet = $derived(this.mode === 'tablet');
  readonly isDesktop = $derived(this.mode === 'desktop');
  /** Exposed for T9.2 to read the seam without widening private state. */
  readonly isFoldable = $derived(this.foldable);

  constructor(initialWidth?: number) {
    if (typeof initialWidth === 'number') this.width = initialWidth;
    const stored = readStored();
    if (stored?.sidebarOpen !== undefined) this.sidebarOpen = stored.sidebarOpen;
    if (stored?.filePanelOpen !== undefined) this.filePanelOpen = stored.filePanelOpen;
  }

  /**
   * Wire the width source. Reads the current viewport and subscribes to resize.
   * Returns a cleanup function; call from `onMount`. No-op (but safe) on server.
   */
  init(): () => void {
    if (!isBrowser() || typeof window.addEventListener !== 'function') return () => {};
    this.setWidth(window.innerWidth);
    const onResize = () => this.setWidth(window.innerWidth);
    window.addEventListener('resize', onResize, { passive: true });
    return () => window.removeEventListener('resize', onResize);
  }

  /** Update the tracked width (also used by tests to simulate breakpoints). */
  setWidth(width: number): void {
    this.width = width;
  }

  /** T9.2 SEAM: toggle foldable detection. */
  setFoldable(active: boolean): void {
    this.foldable = active;
  }

  toggleSidebar(): void {
    this.sidebarOpen = !this.sidebarOpen;
    this.persist();
  }

  toggleFilePanel(): void {
    this.filePanelOpen = !this.filePanelOpen;
    this.persist();
  }

  setSidebar(open: boolean): void {
    this.sidebarOpen = open;
    this.persist();
  }

  setFilePanel(open: boolean): void {
    this.filePanelOpen = open;
    this.persist();
  }

  /** Switch the focused phone column. */
  setMobileView(view: MobileView): void {
    this.mobileView = view;
  }

  /** Close any phone overlays (sidebar/files), returning focus to chat. */
  closeOverlays(): void {
    if (this.isPhone) {
      this.sidebarOpen = false;
      this.filePanelOpen = false;
    }
  }

  /** Reset to defaults (tests). */
  reset(): void {
    this.sidebarOpen = true;
    this.filePanelOpen = false;
    this.mobileView = 'chat';
    this.width = BREAKPOINTS.desktop;
    this.foldable = false;
  }

  private persist(): void {
    writeStored({ sidebarOpen: this.sidebarOpen, filePanelOpen: this.filePanelOpen });
  }
}

/** Create an isolated layout store for tests. */
export function createLayoutStore(initialWidth?: number): LayoutStore {
  return new LayoutStore(initialWidth);
}

/** Shared reactive layout singleton. */
export const layout = createLayoutStore();

/** Public type alias for the layout store. */
export type { LayoutStore };
