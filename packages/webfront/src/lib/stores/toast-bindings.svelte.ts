/**
 * Toast bindings — surface transient feedback for connection + PWA changes.
 * Persistent failures still render inline error states; these toasts are
 * transient. Call `initToastBindings()` once from the app shell `onMount`.
 */

import { connection, type ConnectionStatus } from './connection.svelte.js';
import { pwa } from './pwa.svelte.js';
import { toast as toastStore, type ToastStore } from './toast.svelte.js';

interface BindingDeps {
  connectionStore?: { current: { status: ConnectionStatus; error: string | null } };
  pwaStore?: { offline: boolean };
  toast?: ToastStore;
}

/** Browser-only (uses `$effect.root`); returns a no-op teardown under SSR. */
export function initToastBindings(deps: BindingDeps = {}): () => void {
  const conn = deps.connectionStore ?? connection;
  const pwaState = deps.pwaStore ?? pwa;
  const toast = deps.toast ?? toastStore;

  if (typeof window === 'undefined') return () => {};

  return $effect.root(() => {
    // Toast only on transitions, never on first read.
    let prevStatus: ConnectionStatus | null = null;
    let prevOffline: boolean | null = null;

    $effect(() => {
      const status = conn.current.status;
      if (prevStatus !== null && status !== prevStatus) {
        if (status === 'connected' && (prevStatus === 'error' || prevStatus === 'connecting')) {
          toast.success('Reconnected to server');
        } else if (status === 'error') {
          toast.error(conn.current.error ?? 'Lost connection to server', {
            action: { label: 'Retry', onClick: () => void connection.connect() },
          });
        }
      }
      prevStatus = status;
    });

    $effect(() => {
      const offline = pwaState.offline;
      if (prevOffline !== null && offline !== prevOffline) {
        if (offline) {
          toast.warning('You are offline');
        } else {
          toast.info('Back online');
        }
      }
      prevOffline = offline;
    });
  });
}
