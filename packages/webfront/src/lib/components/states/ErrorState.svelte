<script lang="ts">
  import { HugeiconsIcon } from '@hugeicons/svelte';
  import { Alert02Icon, RefreshIcon } from '@hugeicons/core-free-icons';

  interface ErrorStateProps {
    /** Heading describing what failed. */
    title?: string;
    /** Detailed error message. */
    message?: string;
    /** Retry handler. When provided, a retry button is shown. */
    retry?: () => void;
    /** Retry button label. */
    retryLabel?: string;
    /** Compact inline layout (icon + message on one row) vs. centered block. */
    inline?: boolean;
    /** Additional classes. */
    class?: string;
  }

  let {
    title = 'Something went wrong',
    message,
    retry,
    retryLabel = 'Retry',
    inline = false,
    class: className = '',
  }: ErrorStateProps = $props();
</script>

<div class={`error-state ${inline ? 'error-state--inline' : ''} ${className}`.trim()} role="alert">
  <span class="error-state__icon" aria-hidden="true">
    <HugeiconsIcon icon={Alert02Icon} size={inline ? 18 : 22} strokeWidth={1.5} color="currentColor" />
  </span>

  <div class="error-state__body">
    <p class="error-state__title">{title}</p>
    {#if message}
      <p class="error-state__message">{message}</p>
    {/if}
  </div>

  {#if retry}
    <button type="button" class="error-state__retry" onclick={retry}>
      <HugeiconsIcon icon={RefreshIcon} size={14} strokeWidth={1.5} color="currentColor" aria-hidden="true" />
      {retryLabel}
    </button>
  {/if}
</div>

<style>
  .error-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 0.5rem;
    padding: 2rem 1rem;
    color: var(--text-secondary);
  }

  .error-state--inline {
    flex-direction: row;
    align-items: center;
    text-align: left;
    gap: 0.625rem;
    padding: 0.625rem 0.75rem;
    border: 1px solid rgba(239, 68, 68, 0.25);
    background-color: rgba(239, 68, 68, 0.08);
    border-radius: var(--radius);
  }

  .error-state__icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    color: #ef4444;
  }

  .error-state:not(.error-state--inline) .error-state__icon {
    width: 3rem;
    height: 3rem;
    margin-bottom: 0.25rem;
    border-radius: var(--radius-full);
    background-color: rgba(239, 68, 68, 0.1);
  }

  .error-state__body {
    flex: 1 1 auto;
    min-width: 0;
  }

  .error-state__title {
    margin: 0;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .error-state--inline .error-state__title {
    font-size: 0.8125rem;
  }

  .error-state__message {
    margin: 0.125rem 0 0;
    font-size: 0.8125rem;
    line-height: 1.45;
    color: var(--text-muted);
    max-width: 22rem;
    overflow-wrap: anywhere;
  }

  .error-state__retry {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    flex: 0 0 auto;
    margin-top: 0.5rem;
    padding: 0.4rem 0.75rem;
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--text-primary);
    background-color: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition:
      background-color var(--transition-fast),
      border-color var(--transition-fast),
      transform var(--transition-fast);
  }

  .error-state--inline .error-state__retry {
    margin-top: 0;
  }

  .error-state__retry:hover {
    background-color: var(--bg-surface);
    border-color: var(--border-strong);
  }

  .error-state__retry:active {
    transform: scale(0.97);
  }

  .error-state__retry:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .error-state__retry {
      transition: none;
    }
    .error-state__retry:active {
      transform: none;
    }
  }
</style>
