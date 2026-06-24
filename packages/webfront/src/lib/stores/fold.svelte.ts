/**
 * Fold store — Svelte 5 runes.
 *
 * Detects foldable / dual-screen devices via the Viewport Segments API and
 * keeps the layout store's foldable seam in sync. When a device is unfolded
 * into two *horizontal* segments (Galaxy Fold open, Surface Duo side-by-side),
 * the shell switches to a two-pane layout that respects the hinge.
 *
 * Detection uses CSS media queries exposed through `matchMedia`:
 *   - `(horizontal-viewport-segments: 2)` → side-by-side panes
 *   - `(vertical-viewport-segments: 2)`   → stacked panes
 * The matching `env(viewport-segment-*)` values are read for the hinge gap so
 * CSS can avoid placing content under the fold (see `foldable.css`).
 *
 * SSR-safe singleton: every browser API access is guarded so static prerender
 * and non-DOM tests construct the store without throwing.
 */

import { layout, type LayoutStore } from './layout.svelte.js';

/** Which axis a two-segment fold runs along. `none` = single segment. */
export type FoldOrientation = 'none' | 'horizontal' | 'vertical';

const HORIZONTAL_QUERY = '(horizontal-viewport-segments: 2)';
const VERTICAL_QUERY = '(vertical-viewport-segments: 2)';

/** A `matchMedia`-like shape; modeled so tests can supply a fake. */
interface MediaQuery {
  matches: boolean;
  addEventListener?: (type: 'change', cb: (e: MediaQueryListEvent) => void) => void;
  removeEventListener?: (type: 'change', cb: (e: MediaQueryListEvent) => void) => void;
  /** Deprecated fallback for older engines. */
  addListener?: (cb: (e: MediaQueryListEvent) => void) => void;
  removeListener?: (cb: (e: MediaQueryListEvent) => void) => void;
}

function hasMatchMedia(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function';
}

/**
 * Read the hinge gap (CSS px) between two horizontal segments from the
 * `env(viewport-segment-*)` variables, when the engine exposes them. Returns
 * `null` if unavailable. We surface a CSS variable rather than parsing here so
 * the value is purely informational for JS; layout sizing stays in CSS.
 */
function readHingeGap(orientation: FoldOrientation): number | null {
  if (orientation === 'none' || typeof window === 'undefined') return null;
  if (typeof document === 'undefined' || typeof getComputedStyle !== 'function') return null;
  try {
    const probe = document.createElement('div');
    // The bridge: CSS resolves env() into a concrete pixel width we can measure.
    probe.style.cssText =
      orientation === 'horizontal'
        ? 'position:absolute;width:calc(env(viewport-segment-left 1 0, 0px) - env(viewport-segment-right 0 0, 0px));visibility:hidden;pointer-events:none;'
        : 'position:absolute;height:calc(env(viewport-segment-top 0 1, 0px) - env(viewport-segment-bottom 0 0, 0px));visibility:hidden;pointer-events:none;';
    document.body.appendChild(probe);
    const measured =
      orientation === 'horizontal'
        ? probe.getBoundingClientRect().width
        : probe.getBoundingClientRect().height;
    probe.remove();
    return Number.isFinite(measured) && measured > 0 ? measured : null;
  } catch {
    return null;
  }
}

function subscribe(mq: MediaQuery, cb: (e: MediaQueryListEvent) => void): () => void {
  if (typeof mq.addEventListener === 'function') {
    mq.addEventListener('change', cb);
    return () => mq.removeEventListener?.('change', cb);
  }
  // Safari < 14 / legacy engines.
  if (typeof mq.addListener === 'function') {
    mq.addListener(cb);
    return () => mq.removeListener?.(cb);
  }
  return () => {};
}

class FoldStore {
  /** Device is folded open into two segments along some axis. */
  isFolded = $state(false);
  /** Number of viewport segments along the active fold axis (1 or 2). */
  segments = $state(1);
  /** Axis of the fold, or `none` for a conventional single-segment screen. */
  orientation = $state<FoldOrientation>('none');
  /** Measured hinge gap in CSS px, when the engine exposes segment env vars. */
  hingeGap = $state<number | null>(null);

  private readonly layoutStore: LayoutStore;
  private cleanups: Array<() => void> = [];

  constructor(layoutStore: LayoutStore = layout) {
    this.layoutStore = layoutStore;
  }

  /**
   * Wire fold detection: evaluate the segment queries now and subscribe to
   * changes. Returns a cleanup function; call from `onMount`. No-op (but safe)
   * on the server or where `matchMedia` is unavailable.
   */
  init(): () => void {
    if (!hasMatchMedia()) return () => {};
    this.teardown();

    const horizontal = window.matchMedia(HORIZONTAL_QUERY) as MediaQuery;
    const vertical = window.matchMedia(VERTICAL_QUERY) as MediaQuery;

    const evaluate = (): void => this.evaluate(horizontal.matches, vertical.matches);

    this.cleanups = [
      subscribe(horizontal, evaluate),
      subscribe(vertical, evaluate),
    ];

    evaluate();
    return () => this.teardown();
  }

  /**
   * Apply a detected segment state. Only a *horizontal* two-segment fold drives
   * the shell's two-pane layout (`layout.setFoldable(true)`); a vertical fold is
   * tracked but falls back to the single-column phone layout, which already
   * stacks sensibly.
   */
  evaluate(horizontal: boolean, vertical: boolean): void {
    const orientation: FoldOrientation = horizontal
      ? 'horizontal'
      : vertical
        ? 'vertical'
        : 'none';

    this.orientation = orientation;
    this.isFolded = orientation !== 'none';
    this.segments = orientation === 'none' ? 1 : 2;
    this.hingeGap = readHingeGap(orientation);

    // Two-pane layout is meaningful only for a horizontal split.
    this.layoutStore.setFoldable(orientation === 'horizontal');
  }

  private teardown(): void {
    for (const cleanup of this.cleanups) cleanup();
    this.cleanups = [];
  }

  /** Reset to an unfolded single-segment state (tests). */
  reset(): void {
    this.teardown();
    this.isFolded = false;
    this.segments = 1;
    this.orientation = 'none';
    this.hingeGap = null;
    this.layoutStore.setFoldable(false);
  }
}

/** Create an isolated fold store bound to a specific layout store (tests). */
export function createFoldStore(layoutStore?: LayoutStore): FoldStore {
  return new FoldStore(layoutStore);
}

/** Reactive fold singleton. Read `fold.isFolded` / `fold.orientation` in markup. */
export const fold = createFoldStore();

export type { FoldStore };
