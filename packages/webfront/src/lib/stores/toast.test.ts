import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { createToastStore, toast, DEFAULT_DURATIONS } from './toast.svelte';

/**
 * Deterministic fake timer harness. We swap the global setTimeout/clearTimeout
 * with controllable stand-ins so auto-dismiss timing can be advanced manually.
 */
function installFakeTimers() {
  const original = {
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
  };

  let nextHandle = 1;
  const pending = new Map<number, { fn: () => void; due: number }>();
  let now = 0;

  globalThis.setTimeout = ((fn: () => void, delay = 0) => {
    const handle = nextHandle++;
    pending.set(handle, { fn, due: now + delay });
    return handle as unknown as ReturnType<typeof setTimeout>;
  }) as typeof setTimeout;

  globalThis.clearTimeout = ((handle: number) => {
    pending.delete(handle);
  }) as typeof clearTimeout;

  return {
    advance(ms: number) {
      now += ms;
      for (const [handle, entry] of [...pending.entries()]) {
        if (entry.due <= now) {
          pending.delete(handle);
          entry.fn();
        }
      }
    },
    pendingCount() {
      return pending.size;
    },
    restore() {
      globalThis.setTimeout = original.setTimeout;
      globalThis.clearTimeout = original.clearTimeout;
    },
  };
}

describe('ToastStore', () => {
  let timers: ReturnType<typeof installFakeTimers>;

  beforeEach(() => {
    timers = installFakeTimers();
  });

  afterEach(() => {
    timers.restore();
  });

  it('starts empty', () => {
    const store = createToastStore();
    expect(store.toasts).toEqual([]);
  });

  it('show() adds a toast with defaults (info, default duration)', () => {
    const store = createToastStore();
    const id = store.show({ message: 'Saved' });

    expect(store.toasts.length).toBe(1);
    const t = store.toasts[0];
    expect(t.id).toBe(id);
    expect(t.type).toBe('info');
    expect(t.message).toBe('Saved');
    expect(t.duration).toBe(DEFAULT_DURATIONS.info);
  });

  it('pushes newest toasts to the front', () => {
    const store = createToastStore({ dedupe: false });
    store.show({ message: 'first' });
    store.show({ message: 'second' });

    expect(store.toasts.map((t) => t.message)).toEqual(['second', 'first']);
  });

  it('type helpers set the correct type', () => {
    const store = createToastStore();
    store.success('ok');
    store.error('bad');
    store.warning('careful');

    const byType = Object.fromEntries(store.toasts.map((t) => [t.message, t.type]));
    expect(byType.ok).toBe('success');
    expect(byType.bad).toBe('error');
    expect(byType.careful).toBe('warning');
  });

  it('auto-dismisses after the duration elapses', () => {
    const store = createToastStore();
    store.show({ message: 'transient', duration: 1000 });
    expect(store.toasts.length).toBe(1);

    timers.advance(999);
    expect(store.toasts.length).toBe(1);

    timers.advance(1);
    expect(store.toasts.length).toBe(0);
  });

  it('errors linger longer than success by default', () => {
    const store = createToastStore({ dedupe: false });
    store.success('ok');
    store.error('boom');

    // After the success duration, the success is gone but the error remains.
    timers.advance(DEFAULT_DURATIONS.success);
    expect(store.toasts.map((t) => t.message)).toEqual(['boom']);

    timers.advance(DEFAULT_DURATIONS.error - DEFAULT_DURATIONS.success);
    expect(store.toasts.length).toBe(0);
  });

  it('a duration of 0 makes the toast sticky', () => {
    const store = createToastStore();
    store.show({ message: 'sticky', duration: 0 });

    timers.advance(60_000);
    expect(store.toasts.length).toBe(1);
    expect(timers.pendingCount()).toBe(0);
  });

  it('dismiss() removes a toast by id and cancels its timer', () => {
    const store = createToastStore();
    const id = store.show({ message: 'bye', duration: 5000 });

    store.dismiss(id);
    expect(store.toasts.length).toBe(0);
    expect(timers.pendingCount()).toBe(0);
  });

  it('dismiss() is a no-op for an unknown id', () => {
    const store = createToastStore();
    store.show({ message: 'keep' });
    store.dismiss('does-not-exist');
    expect(store.toasts.length).toBe(1);
  });

  it('clear() removes all toasts and pending timers', () => {
    const store = createToastStore({ dedupe: false });
    store.show({ message: 'a' });
    store.show({ message: 'b' });
    store.clear();

    expect(store.toasts.length).toBe(0);
    expect(timers.pendingCount()).toBe(0);
  });

  it('enforces the max stack by evicting the oldest toast', () => {
    const store = createToastStore({ maxStack: 2, dedupe: false });
    store.show({ message: '1' });
    store.show({ message: '2' });
    store.show({ message: '3' });

    expect(store.toasts.length).toBe(2);
    // Newest-first; oldest ('1') was evicted.
    expect(store.toasts.map((t) => t.message)).toEqual(['3', '2']);
  });

  it('de-dupes identical type+message and refreshes the timer', () => {
    const store = createToastStore({ dedupe: true });
    const first = store.show({ type: 'error', message: 'Connection lost', duration: 1000 });

    timers.advance(900);
    // Same toast again should refresh, not stack.
    const second = store.show({ type: 'error', message: 'Connection lost', duration: 1000 });

    expect(first).toBe(second);
    expect(store.toasts.length).toBe(1);

    // The timer was refreshed at t=900, so at t=1900 (original + ~900) it's still alive.
    timers.advance(900);
    expect(store.toasts.length).toBe(1);

    timers.advance(100);
    expect(store.toasts.length).toBe(0);
  });

  it('does not de-dupe across different types', () => {
    const store = createToastStore({ dedupe: true });
    store.show({ type: 'info', message: 'same' });
    store.show({ type: 'error', message: 'same' });
    expect(store.toasts.length).toBe(2);
  });

  it('show() returns an id usable for programmatic swap', () => {
    const store = createToastStore();
    const id = store.show({ type: 'warning', message: 'Reconnecting…', duration: 0 });
    expect(typeof id).toBe('string');

    store.dismiss(id);
    store.success('Reconnected');
    expect(store.toasts.map((t) => t.message)).toEqual(['Reconnected']);
  });

  it('preserves an action callback on the toast', () => {
    const store = createToastStore();
    let ran = false;
    store.show({
      message: 'Undo?',
      duration: 0,
      action: { label: 'Undo', onClick: () => { ran = true; } },
    });
    store.toasts[0].action?.onClick();
    expect(ran).toBe(true);
  });
});

describe('toast singleton', () => {
  it('exports a singleton instance', () => {
    expect(toast).toBeDefined();
    expect(typeof toast.show).toBe('function');
    expect(typeof toast.dismiss).toBe('function');
  });
});
