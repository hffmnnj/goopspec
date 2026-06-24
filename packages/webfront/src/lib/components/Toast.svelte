<script lang="ts">
  import { HugeiconsIcon } from '@hugeicons/svelte';
  import {
    CheckmarkCircle02Icon,
    AlertCircleIcon,
    Alert02Icon,
    InformationCircleIcon,
    Cancel01Icon,
  } from '@hugeicons/core-free-icons';
  import GlassSurface from './GlassSurface.svelte';
  import type { Toast, ToastType } from '$lib/stores/toast.svelte.js';

  interface ToastProps {
    /** The toast to render. */
    toast: Toast;
    /** Called when the toast should be removed (dismiss button or action). */
    ondismiss: (id: string) => void;
  }

  let { toast, ondismiss }: ToastProps = $props();

  const ICON: Record<ToastType, typeof CheckmarkCircle02Icon> = {
    success: CheckmarkCircle02Icon,
    error: AlertCircleIcon,
    warning: Alert02Icon,
    info: InformationCircleIcon,
  };

  function handleAction(): void {
    toast.action?.onClick();
    ondismiss(toast.id);
  }
</script>

<GlassSurface variant="floating" class={`toast toast--${toast.type}`} role="group" aria-label={`${toast.type} notification`}>
  <span class="toast__icon" aria-hidden="true">
    <HugeiconsIcon icon={ICON[toast.type]} size={18} strokeWidth={1.5} color="currentColor" />
  </span>

  <p class="toast__message">{toast.message}</p>

  {#if toast.action}
    <button type="button" class="toast__action" onclick={handleAction}>
      {toast.action.label}
    </button>
  {/if}

  <button
    type="button"
    class="toast__dismiss"
    aria-label="Dismiss notification"
    onclick={() => ondismiss(toast.id)}
  >
    <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={1.5} color="currentColor" />
  </button>
</GlassSurface>

<style>
  :global(.toast) {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    width: min(22rem, calc(100vw - 2rem));
    padding: 0.625rem 0.625rem 0.625rem 0.75rem;
    border-radius: var(--radius);
    box-shadow: var(--shadow-md);
    pointer-events: auto;
  }

  /* Per-type accent stripe via the left border. */
  :global(.toast--success) {
    border-left: 3px solid var(--accent);
  }
  :global(.toast--info) {
    border-left: 3px solid #3b82f6;
  }
  :global(.toast--warning) {
    border-left: 3px solid #f59e0b;
  }
  :global(.toast--error) {
    border-left: 3px solid #ef4444;
  }

  .toast__icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
  }

  :global(.toast--success) .toast__icon {
    color: var(--accent);
  }
  :global(.toast--info) .toast__icon {
    color: #3b82f6;
  }
  :global(.toast--warning) .toast__icon {
    color: #f59e0b;
  }
  :global(.toast--error) .toast__icon {
    color: #ef4444;
  }

  .toast__message {
    flex: 1 1 auto;
    margin: 0;
    font-size: 0.8125rem;
    line-height: 1.4;
    color: var(--text-primary);
    overflow-wrap: anywhere;
  }

  .toast__action {
    flex: 0 0 auto;
    padding: 0.3rem 0.55rem;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--accent);
    background-color: transparent;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition:
      background-color var(--transition-fast),
      border-color var(--transition-fast);
  }

  .toast__action:hover {
    background-color: var(--accent-soft);
    border-color: var(--border-strong);
  }

  .toast__dismiss {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    height: 1.5rem;
    padding: 0;
    color: var(--text-muted);
    background-color: transparent;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition:
      color var(--transition-fast),
      background-color var(--transition-fast);
  }

  .toast__dismiss:hover {
    color: var(--text-primary);
    background-color: var(--bg-surface);
  }

  .toast__action:focus-visible,
  .toast__dismiss:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
</style>
