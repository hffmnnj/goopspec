/**
 * Toast store — Svelte 5 runes.
 *
 * Transient, non-blocking feedback notifications. A toast surfaces a short
 * message (with an optional action) and auto-dismisses after a duration.
 *
 * Design principles:
 *   - Transient feedback ONLY — never for persistent/critical errors that need
 *     an inline error state with retry.
 *   - Newest toasts pushed to the front so the stack reads top-to-bottom.
 *   - A bounded stack (`maxStack`) drops the oldest toast when full so a burst
 *     of events can never grow the UI unbounded.
 *   - Optional de-duplication collapses identical back-to-back messages into a
 *     single toast (refreshing its timer) rather than stacking duplicates.
 *
 * SSR-safe singleton: timer scheduling is guarded so prerender / non-DOM test
 * environments never schedule real timers unless one is available.
 */

export const TOAST_TYPES = ['success', 'error', 'info', 'warning'] as const;
export type ToastType = (typeof TOAST_TYPES)[number];

/** An action button rendered inside a toast (e.g. "Retry", "Undo"). */
export interface ToastAction {
  /** Visible button label. */
  label: string;
  /** Invoked when the action button is pressed. */
  onClick: () => void;
}

export interface Toast {
  /** Stable unique id for keyed rendering + dismissal. */
  id: string;
  /** Severity, drives icon + accent. */
  type: ToastType;
  /** Primary message text. */
  message: string;
  /** Optional action button. */
  action?: ToastAction;
  /**
   * Auto-dismiss delay in ms. `0` (or negative) means the toast is sticky and
   * must be dismissed manually / programmatically.
   */
  duration: number;
}

/** Options accepted by `show()`. `type` defaults to `info`. */
export interface ShowToastOptions {
  type?: ToastType;
  message: string;
  action?: ToastAction;
  /**
   * Auto-dismiss delay in ms. Defaults depend on type (errors linger longer).
   * Pass `0` for a sticky toast.
   */
  duration?: number;
}

/** Per-type default auto-dismiss durations (ms). Errors linger longer. */
const DEFAULT_DURATIONS: Record<ToastType, number> = {
  success: 4000,
  info: 5000,
  warning: 6000,
  error: 8000,
};

/** Default maximum number of toasts kept on screen at once. */
const DEFAULT_MAX_STACK = 4;

let counter = 0;
function nextId(): string {
  counter += 1;
  return `toast-${counter}-${Date.now()}`;
}

interface ToastStoreOptions {
  /** Maximum number of toasts retained on screen (oldest dropped when full). */
  maxStack?: number;
  /**
   * Collapse a new toast into an existing one when both `type` and `message`
   * match. The existing toast's timer is refreshed. Defaults to `true`.
   */
  dedupe?: boolean;
}

class ToastStore {
  /** Active toasts, newest first. */
  toasts = $state<Toast[]>([]);

  private readonly maxStack: number;
  private readonly dedupe: boolean;
  private timers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(options: ToastStoreOptions = {}) {
    this.maxStack = Math.max(1, options.maxStack ?? DEFAULT_MAX_STACK);
    this.dedupe = options.dedupe ?? true;
  }

  /**
   * Show a toast. Returns its id so callers can dismiss it programmatically
   * (e.g. swap a "Connection lost" toast for "Reconnected").
   */
  show(options: ShowToastOptions): string {
    const type = options.type ?? 'info';
    const duration = options.duration ?? DEFAULT_DURATIONS[type];
    const message = options.message;

    // De-dupe: if an identical toast is already showing, refresh its timer
    // instead of stacking a duplicate.
    if (this.dedupe) {
      const existing = this.toasts.find((t) => t.type === type && t.message === message);
      if (existing) {
        existing.action = options.action ?? existing.action;
        existing.duration = duration;
        this.scheduleDismiss(existing.id, duration);
        return existing.id;
      }
    }

    const toast: Toast = {
      id: nextId(),
      type,
      message,
      action: options.action,
      duration,
    };

    // Newest first.
    this.toasts = [toast, ...this.toasts];

    // Enforce the bounded stack by evicting the oldest toasts.
    while (this.toasts.length > this.maxStack) {
      const oldest = this.toasts[this.toasts.length - 1];
      if (!oldest) break;
      this.clearTimer(oldest.id);
      this.toasts = this.toasts.slice(0, -1);
    }

    this.scheduleDismiss(toast.id, duration);
    return toast.id;
  }

  /** Convenience helpers per type. */
  success(message: string, options: Omit<ShowToastOptions, 'type' | 'message'> = {}): string {
    return this.show({ ...options, type: 'success', message });
  }

  error(message: string, options: Omit<ShowToastOptions, 'type' | 'message'> = {}): string {
    return this.show({ ...options, type: 'error', message });
  }

  info(message: string, options: Omit<ShowToastOptions, 'type' | 'message'> = {}): string {
    return this.show({ ...options, type: 'info', message });
  }

  warning(message: string, options: Omit<ShowToastOptions, 'type' | 'message'> = {}): string {
    return this.show({ ...options, type: 'warning', message });
  }

  /** Dismiss a toast by id. No-op if it no longer exists. */
  dismiss(id: string): void {
    this.clearTimer(id);
    this.toasts = this.toasts.filter((t) => t.id !== id);
  }

  /** Dismiss every active toast and cancel pending timers. */
  clear(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    this.toasts = [];
  }

  private scheduleDismiss(id: string, duration: number): void {
    this.clearTimer(id);
    // A duration of 0 (or less) makes the toast sticky.
    if (duration <= 0) return;
    if (typeof setTimeout === 'undefined') return;
    const timer = setTimeout(() => {
      this.timers.delete(id);
      this.toasts = this.toasts.filter((t) => t.id !== id);
    }, duration);
    this.timers.set(id, timer);
  }

  private clearTimer(id: string): void {
    const timer = this.timers.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.timers.delete(id);
    }
  }
}

/** Create an isolated toast store (useful for tests). */
export function createToastStore(options?: ToastStoreOptions): ToastStore {
  return new ToastStore(options);
}

/** Shared reactive toast singleton. Read `toast.toasts` in markup. */
export const toast = createToastStore();

export { DEFAULT_DURATIONS, DEFAULT_MAX_STACK };
export type { ToastStore };
