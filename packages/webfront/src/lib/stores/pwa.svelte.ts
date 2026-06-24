/**
 * PWA store — Svelte 5 runes.
 *
 * Centralizes Progressive Web App state shared by the install prompt and any
 * offline indicators:
 *   - `installable` — a `beforeinstallprompt` event was captured and deferred
 *   - `installed`   — the app runs as an installed PWA (standalone) or just got installed
 *   - `offline`     — the browser reports no network connectivity
 *   - `dismissed`   — the user dismissed the custom install banner (persisted)
 *
 * SSR-safe singleton: every browser API access is guarded so static prerender
 * and tests in a non-DOM environment never throw.
 */

/**
 * The `beforeinstallprompt` event is non-standard and not in the default DOM
 * lib types, so we model the shape we depend on.
 */
export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

const STORAGE_KEY = 'goopspec-pwa-install-dismissed';
/** How long a dismissal silences the banner before it may re-appear (7 days). */
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Evaluated lazily so tests can install a `window`/`localStorage` after import. */
function hasWindow(): boolean {
  return typeof window !== 'undefined';
}

function getStorage(): Storage | null {
  try {
    return typeof globalThis.localStorage !== 'undefined' ? globalThis.localStorage : null;
  } catch {
    return null;
  }
}

function readDismissedAt(): number | null {
  const storage = getStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    const ts = Number.parseInt(raw, 10);
    return Number.isFinite(ts) ? ts : null;
  } catch {
    return null;
  }
}

function writeDismissedAt(ts: number): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, String(ts));
  } catch {
    // Best-effort persistence (private mode / disabled storage).
  }
}

function clearDismissed(): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    // Best-effort.
  }
}

/** True when the app is running in an installed/standalone display mode. */
function detectStandalone(): boolean {
  if (!hasWindow()) return false;
  if (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches) {
    return true;
  }
  // iOS Safari exposes a non-standard `standalone` flag on `navigator`.
  const nav = window.navigator as (Navigator & { standalone?: boolean }) | undefined;
  return nav?.standalone === true;
}

function detectOffline(): boolean {
  if (typeof navigator === 'undefined') return false;
  return navigator.onLine === false;
}

/**
 * Returns whether a dismissal recorded at `dismissedAt` is still within its
 * TTL window (and so the banner should stay hidden). A null timestamp means
 * the banner was never dismissed.
 */
function isDismissalActive(dismissedAt: number | null, now: number = Date.now()): boolean {
  if (dismissedAt === null) return false;
  return now - dismissedAt < DISMISS_TTL_MS;
}

class PwaStore {
  /** A deferred `beforeinstallprompt` event is available to trigger. */
  installable = $state(false);
  /** App is installed (standalone) or was just installed this session. */
  installed = $state(false);
  /** Browser reports no network connectivity. */
  offline = $state(false);
  /** User dismissed the install banner within the TTL window. */
  dismissed = $state(false);

  private deferredPrompt: BeforeInstallPromptEvent | null = null;
  private cleanups: Array<() => void> = [];

  constructor() {
    this.installed = detectStandalone();
    this.offline = detectOffline();
    this.dismissed = isDismissalActive(readDismissedAt());
  }

  /**
   * Whether the custom install banner should be shown: we have a deferred
   * prompt, the app is not already installed, and the user has not recently
   * dismissed it.
   */
  get shouldShowBanner(): boolean {
    return this.installable && !this.installed && !this.dismissed;
  }

  /**
   * Attach window listeners for install + connectivity events.
   * Returns a cleanup function; call from `onMount`. Idempotent-safe: calling
   * `init` again replaces the previous listeners.
   */
  init(): () => void {
    if (!hasWindow()) return () => {};
    this.teardown();

    const onBeforeInstallPrompt = (event: Event): void => {
      // Suppress the browser's mini-infobar so we can present our own UI.
      event.preventDefault();
      this.deferredPrompt = event as BeforeInstallPromptEvent;
      this.installable = true;
    };

    const onAppInstalled = (): void => {
      this.installed = true;
      this.installable = false;
      this.deferredPrompt = null;
      clearDismissed();
      this.dismissed = false;
    };

    const onOnline = (): void => {
      this.offline = false;
    };
    const onOffline = (): void => {
      this.offline = true;
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    // Re-sync in case state changed before listeners attached.
    this.offline = detectOffline();
    this.installed = detectStandalone();

    let mediaCleanup = () => {};
    if (typeof window.matchMedia === 'function') {
      const media = window.matchMedia('(display-mode: standalone)');
      const onDisplayModeChange = (e: MediaQueryListEvent): void => {
        if (e.matches) {
          this.installed = true;
          this.installable = false;
        }
      };
      media.addEventListener('change', onDisplayModeChange);
      mediaCleanup = () => media.removeEventListener('change', onDisplayModeChange);
    }

    this.cleanups = [
      () => window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt),
      () => window.removeEventListener('appinstalled', onAppInstalled),
      () => window.removeEventListener('online', onOnline),
      () => window.removeEventListener('offline', onOffline),
      mediaCleanup
    ];

    return () => this.teardown();
  }

  private teardown(): void {
    for (const cleanup of this.cleanups) cleanup();
    this.cleanups = [];
  }

  /**
   * Trigger the native install prompt. Resolves with the user's choice, or
   * `null` if no deferred prompt is available. On acceptance the deferred
   * prompt is consumed (it can only be used once).
   */
  async promptInstall(): Promise<'accepted' | 'dismissed' | null> {
    const prompt = this.deferredPrompt;
    if (!prompt) return null;

    try {
      await prompt.prompt();
      const { outcome } = await prompt.userChoice;
      // A deferred prompt is single-use regardless of outcome.
      this.deferredPrompt = null;
      this.installable = false;
      if (outcome === 'accepted') {
        this.installed = true;
        clearDismissed();
        this.dismissed = false;
      }
      return outcome;
    } catch {
      this.deferredPrompt = null;
      this.installable = false;
      return null;
    }
  }

  /** Hide the install banner and remember the dismissal for the TTL window. */
  dismiss(): void {
    this.dismissed = true;
    writeDismissedAt(Date.now());
  }

  /** Clear a stored dismissal (e.g. from settings "show install prompt again"). */
  resetDismissal(): void {
    this.dismissed = false;
    clearDismissed();
  }

  /**
   * Test/SSR seam: inject a deferred prompt without a real browser event.
   */
  setDeferredPrompt(prompt: BeforeInstallPromptEvent | null): void {
    this.deferredPrompt = prompt;
    this.installable = prompt !== null && !this.installed;
  }
}

/** Create an isolated PWA store (useful for tests). */
export function createPwaStore(): PwaStore {
  return new PwaStore();
}

/** Reactive PWA singleton. Read `pwa.installable` / `pwa.offline` in markup. */
export const pwa = createPwaStore();

export { isDismissalActive };
export type { PwaStore };
