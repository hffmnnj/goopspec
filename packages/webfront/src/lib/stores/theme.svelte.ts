/**
 * Theme store — Svelte 5 runes. Keeps the active theme, the DOM
 * `data-theme` attribute, and localStorage in sync.
 *
 * Resolution on first load: persisted preference → system preference → 'dark'.
 * SSR-safe: every browser API access is guarded for static prerender.
 */

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'goopspec-theme';
const DEFAULT_THEME: Theme = 'dark';

const isBrowser = typeof window !== 'undefined';

function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark';
}

function readStored(): Theme | null {
  if (!isBrowser) return null;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isTheme(stored) ? stored : null;
  } catch {
    return null;
  }
}

function readSystem(): Theme {
  if (!isBrowser || typeof window.matchMedia !== 'function') {
    return DEFAULT_THEME;
  }
  return window.matchMedia('(prefers-color-scheme: light)').matches
    ? 'light'
    : 'dark';
}

function writeStored(value: Theme): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Persistence is best-effort (private mode / disabled storage).
  }
}

// `current` is exposed via the `theme` handle so the rune stays reactive
// across module boundaries.
class ThemeState {
  current = $state<Theme>(DEFAULT_THEME);
}

const state = new ThemeState();

/** Reactive theme handle. Read `theme.current` in markup/effects. */
export const theme = state;

/**
 * Resolve and apply the theme on app start, then follow OS changes until the
 * user picks a theme explicitly. Returns a cleanup function; call from `onMount`.
 */
export function initTheme(): () => void {
  if (!isBrowser) return () => {};

  setTheme(readStored() ?? readSystem(), { persist: false });

  if (typeof window.matchMedia !== 'function') return () => {};
  const media = window.matchMedia('(prefers-color-scheme: light)');
  const onChange = (event: MediaQueryListEvent) => {
    if (readStored() !== null) return; // user override wins
    setTheme(event.matches ? 'light' : 'dark', { persist: false });
  };
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

/**
 * Apply a theme. When `persist` is false the choice syncs to the DOM without
 * writing localStorage — used to follow live system changes without locking in.
 */
export function setTheme(value: Theme, opts: { persist?: boolean } = {}): void {
  const { persist = true } = opts;
  state.current = value;
  if (!isBrowser) return;
  document.documentElement.setAttribute('data-theme', value);
  if (persist) writeStored(value);
}

/** Toggle between light and dark, persisting the explicit choice. */
export function toggleTheme(): void {
  setTheme(state.current === 'dark' ? 'light' : 'dark');
}
