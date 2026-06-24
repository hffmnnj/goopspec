/**
 * Connection store — Svelte 5 runes.
 *
 * Manages the OpenCode server connection lifecycle:
 *   disconnected → connecting → connected | error
 *
 * SSR-safe: every browser API access is guarded.
 */

import { createClient } from '$lib/api/client.js';
import { getServerUrl } from '$lib/api/config.js';
import type { GlobalEvent, OpenCodeClient } from '$lib/api/types.js';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

interface ConnectionState {
  status: ConnectionStatus;
  error: string | null;
  serverUrl: string;
  retryCount: number;
}

const isBrowser = typeof window !== 'undefined';

function getChannel(): BroadcastChannel | null {
  if (!isBrowser || typeof BroadcastChannel === 'undefined') return null;
  try {
    return new BroadcastChannel('goopspec-connection');
  } catch {
    return null;
  }
}

class ConnectionStore {
  private client: OpenCodeClient;
  private channel: BroadcastChannel | null;
  private abortController: AbortController | null = null;
  private globalEventsSubscription: { close(): void } | null = null;

  current = $state<ConnectionState>({
    status: 'disconnected',
    error: null,
    serverUrl: getServerUrl(),
    retryCount: 0
  });

  constructor(client?: OpenCodeClient) {
    this.client = client ?? createClient();
    this.channel = getChannel();
    this.channel?.addEventListener('message', (event: MessageEvent) => {
      const data = event.data as { type?: string; error?: string } | undefined;
      if (!data || typeof data !== 'object') return;

      if (data.type === 'app.ready') {
        this.setConnected();
      } else if (data.type === 'app.error' && typeof data.error === 'string') {
        this.setError(data.error);
      }
    });
  }

  private setStatus(status: ConnectionStatus, error: string | null = null): void {
    this.current.status = status;
    this.current.error = error;
  }

  private setConnected(): void {
    this.current.status = 'connected';
    this.current.error = null;
    this.current.retryCount = 0;
    this.abortController = null;
    this.startGlobalEventsSubscription();
  }

  private setError(error: string): void {
    this.current.status = 'error';
    this.current.error = error;
    this.abortController = null;
    this.stopGlobalEventsSubscription();
  }

  private async attemptOnce(signal: AbortSignal): Promise<void> {
    await this.client.getConfig();
    if (signal.aborted) return;
    this.setConnected();
  }

  private startGlobalEventsSubscription(): void {
    this.stopGlobalEventsSubscription();
    this.globalEventsSubscription = this.client.subscribeGlobalEvents(this.handleGlobalEvent);
  }

  private stopGlobalEventsSubscription(): void {
    this.globalEventsSubscription?.close();
    this.globalEventsSubscription = null;
  }

  private handleGlobalEvent = (event: GlobalEvent): void => {
    if (event.type === 'server.connected') {
      this.current.status = 'connected';
      this.current.error = null;
      this.current.retryCount = 0;
      return;
    }

    if (this.isDisconnectEvent(event)) {
      this.handleConnectionDrop('Server connection closed');
    }
  };

  private isDisconnectEvent(event: GlobalEvent): boolean {
    const type = event.type.toLowerCase();
    return type.includes('disconnect') || type === 'close' || type === 'closed' || type.endsWith('.close') || type.endsWith('.closed');
  }

  private handleConnectionDrop(message: string): void {
    if (this.current.status === 'connecting') return;

    this.abortController?.abort();
    this.abortController = null;
    this.stopGlobalEventsSubscription();
    this.setStatus('disconnected', message);
    void this.connectWithRetry();
  }

  /**
   * Try to connect. Transitions from any state into `connecting`, then either
   * `connected` or `error`. A previous in-flight attempt is aborted.
   */
  async connect(): Promise<void> {
    this.abortController?.abort();
    this.stopGlobalEventsSubscription();
    const controller = new AbortController();
    this.abortController = controller;

    this.current.serverUrl = getServerUrl();
    this.current.retryCount = 0;
    this.setStatus('connecting');

    try {
      await this.attemptOnce(controller.signal);
    } catch (err) {
      if (controller.signal.aborted) return;
      this.setError(err instanceof Error ? err.message : 'Connection failed');
    }
  }

  /**
   * Retry connection with exponential backoff. Stops when the connection
   * succeeds, the attempt count is exhausted, or the store is reset.
   */
  async connectWithRetry(maxRetries = 5): Promise<void> {
    this.abortController?.abort();
    this.stopGlobalEventsSubscription();
    this.current.serverUrl = getServerUrl();
    this.current.retryCount = 0;
    this.setStatus('connecting');

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      this.abortController = controller;
      this.current.retryCount = attempt;

      try {
        await this.attemptOnce(controller.signal);
        return;
      } catch (err) {
        if (controller.signal.aborted) return;
        const isLast = attempt === maxRetries;
        const message = err instanceof Error ? err.message : 'Connection failed';

        if (isLast) {
          this.setError(message);
          return;
        }

        this.setStatus('connecting', `${message} — retrying…`);
        this.current.retryCount = attempt;
        await this.delay(2 ** attempt * 250);
      }
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /** Reset to disconnected and cancel any in-flight attempt. */
  disconnect(): void {
    this.abortController?.abort();
    this.abortController = null;
    this.stopGlobalEventsSubscription();
    this.setStatus('disconnected');
    this.current.error = null;
    this.current.retryCount = 0;
  }

  /** Notify other tabs that the app is ready or errored. */
  postAppEvent(type: 'app.ready' | 'app.error', error?: string): void {
    this.channel?.postMessage({ type, error });
  }
}

/** Create a connection store bound to a specific client (useful for tests). */
export function createConnectionStore(client?: OpenCodeClient): ConnectionStore {
  return new ConnectionStore(client);
}

/** Reactive connection singleton backed by the configured OpenCode client. */
export const connection = createConnectionStore();

export function getConnectionState(): ConnectionState {
  return connection.current;
}
