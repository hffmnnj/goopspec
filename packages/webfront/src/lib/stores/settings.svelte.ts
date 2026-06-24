/**
 * Settings store — Svelte 5 runes.
 *
 * Holds client-side appearance preferences (reduced-motion override, compact
 * density) and re-exports the server URL through the existing config API.
 * Theme remains owned by the theme store; this store only coordinates the
 * appearance toggles that live alongside it in the settings panel.
 *
 * SSR-safe: all browser API access is guarded for static prerender.
 */

const STORAGE_KEY = 'goopspec-settings';

/** Evaluated lazily so SSR→hydration and tests that inject a window both work. */
function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

/** Reduced-motion preference: follow the OS, or force on/off. */
export type MotionPreference = 'system' | 'reduced' | 'full';

/** Layout density. */
export type Density = 'comfortable' | 'compact';

export interface AppearanceSettings {
  motion: MotionPreference;
  density: Density;
}

const DEFAULTS: AppearanceSettings = {
  motion: 'system',
  density: 'comfortable',
};

function isMotion(value: unknown): value is MotionPreference {
  return value === 'system' || value === 'reduced' || value === 'full';
}

function isDensity(value: unknown): value is Density {
  return value === 'comfortable' || value === 'compact';
}

/** Parse a persisted blob into a fully-populated settings object. */
export function parseSettings(raw: unknown): AppearanceSettings {
  const record = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  return {
    motion: isMotion(record.motion) ? record.motion : DEFAULTS.motion,
    density: isDensity(record.density) ? record.density : DEFAULTS.density,
  };
}

function readStored(): AppearanceSettings {
  if (!isBrowser()) return { ...DEFAULTS };
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored ? parseSettings(JSON.parse(stored)) : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}

function writeStored(value: AppearanceSettings): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Persistence is best-effort (private mode / disabled storage).
  }
}

/**
 * Resolve whether motion should be reduced given the stored preference and the
 * current OS setting. Exposed for the layout/effects layer and unit tests.
 */
export function resolveReducedMotion(
  pref: MotionPreference,
  systemPrefersReduced: boolean
): boolean {
  if (pref === 'reduced') return true;
  if (pref === 'full') return false;
  return systemPrefersReduced;
}

class SettingsStore {
  current = $state<AppearanceSettings>(readStored());

  setMotion(motion: MotionPreference): void {
    this.current.motion = motion;
    writeStored(this.current);
    this.applyDom();
  }

  setDensity(density: Density): void {
    this.current.density = density;
    writeStored(this.current);
    this.applyDom();
  }

  reset(): void {
    this.current = { ...DEFAULTS };
    writeStored(this.current);
    this.applyDom();
  }

  /** Reflect appearance preferences onto the document root. */
  applyDom(): void {
    if (!isBrowser()) return;
    const root = document.documentElement;
    root.setAttribute('data-density', this.current.density);
    root.setAttribute('data-motion', this.current.motion);
  }
}

/** Create an isolated settings store (useful for tests). */
export function createSettingsStore(): SettingsStore {
  return new SettingsStore();
}

/** Shared reactive settings singleton. */
export const settings = createSettingsStore();
