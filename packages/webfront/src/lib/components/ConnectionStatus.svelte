<script lang="ts">
  import { HugeiconsIcon } from '@hugeicons/svelte';
  import {
    Alert02Icon,
    Loading03Icon,
    WifiConnected03Icon,
    WifiDisconnected03Icon
  } from '@hugeicons/core-free-icons';
  import { connection, type ConnectionStatus } from '$lib/stores/connection.svelte';
  import GlassSurface from './GlassSurface.svelte';

  const ICON_SIZE = 16;
  const STROKE = 1.5;

  const LABELS: Record<ConnectionStatus, string> = {
    disconnected: 'Disconnected',
    connecting: 'Connecting…',
    connected: 'Connected',
    error: 'Error'
  };

  const statusColor: Record<ConnectionStatus, string> = {
    disconnected: 'var(--text-muted)',
    connecting: 'var(--accent)',
    connected: 'var(--accent)',
    error: '#ef4444'
  };

  function handleClick(): void {
    if (connection.current.status === 'connected') return;
    void connection.connect();
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    handleClick();
  }

  const status = $derived(connection.current.status);
  const error = $derived(connection.current.error);
  const isError = $derived(status === 'error');
  const isConnecting = $derived(status === 'connecting');
  const titleText = $derived(isError && error ? `Connection error: ${error}` : LABELS[status]);
</script>

<GlassSurface variant="floating">
  {#if status !== 'connected'}
    <button
      class="connection-status"
      class:connecting={isConnecting}
      type="button"
      aria-live="polite"
      aria-label={titleText}
      title={titleText}
      onclick={handleClick}
      onkeydown={handleKeydown}
    >
      <span class="dot" style:background-color={statusColor[status]}></span>
      <span class="icon" aria-hidden="true">
        {#if isConnecting}
          <HugeiconsIcon icon={Loading03Icon} size={ICON_SIZE} strokeWidth={STROKE} color="currentColor" />
        {:else if isError}
          <HugeiconsIcon icon={Alert02Icon} size={ICON_SIZE} strokeWidth={STROKE} color="currentColor" />
        {:else}
          <HugeiconsIcon icon={WifiDisconnected03Icon} size={ICON_SIZE} strokeWidth={STROKE} color="currentColor" />
        {/if}
      </span>
      <span class="label">{LABELS[status]}</span>
    </button>
  {:else}
    <span
      class="connection-status"
      role="status"
      aria-live="polite"
      aria-label={titleText}
      title={titleText}
    >
      <span class="dot" style:background-color={statusColor[status]}></span>
      <span class="icon" aria-hidden="true">
        <HugeiconsIcon icon={WifiConnected03Icon} size={ICON_SIZE} strokeWidth={STROKE} color="currentColor" />
      </span>
      <span class="label">{LABELS[status]}</span>
    </span>
  {/if}
</GlassSurface>

<style>
  .connection-status {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.375rem 0.625rem;
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--text-secondary);
    border-radius: var(--radius-full);
    user-select: none;
  }

  button.connection-status {
    background: transparent;
    border: none;
    cursor: pointer;
    font: inherit;
    color: var(--text-secondary);
  }

  button.connection-status:hover {
    color: var(--text-primary);
  }

  .connection-status:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .dot {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: var(--radius-full);
    transition: background-color var(--transition-fast);
  }

  .connecting .dot {
    animation: pulse 1.4s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  }

  .icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .label {
    line-height: 1;
  }

  @keyframes pulse {
    0%, 100% {
      opacity: 1;
      transform: scale(1);
    }
    50% {
      opacity: 0.55;
      transform: scale(1.15);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .connecting .dot {
      animation: none;
      opacity: 0.75;
    }
  }
</style>