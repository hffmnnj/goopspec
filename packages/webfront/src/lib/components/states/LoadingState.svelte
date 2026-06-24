<script lang="ts">
  import Skeleton from './Skeleton.svelte';
  import Spinner from './Spinner.svelte';

  interface LoadingStateProps {
    /**
     * Skeleton preset to render, or `spinner` for a small centered spinner when
     * a skeleton shape doesn't fit the surface.
     */
    variant?: 'text' | 'card' | 'list' | 'spinner';
    /** Row count for `list` / `text` skeletons. */
    count?: number;
    /** Accessible label for the busy region. */
    label?: string;
    /** Additional classes. */
    class?: string;
  }

  let {
    variant = 'list',
    count = 4,
    label = 'Loading…',
    class: className = '',
  }: LoadingStateProps = $props();
</script>

<div class={`loading-state ${className}`.trim()} role="status" aria-busy="true" aria-label={label}>
  {#if variant === 'spinner'}
    <Spinner size={22} />
    <span class="loading-state__label">{label}</span>
  {:else if variant === 'list'}
    <Skeleton variant="list" lines={count} />
  {:else if variant === 'card'}
    <Skeleton variant="card" />
  {:else}
    <Skeleton variant="text" lines={count} />
  {/if}
</div>

<style>
  .loading-state {
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
    padding: 0.75rem;
    width: 100%;
  }

  .loading-state__label {
    font-size: 0.8125rem;
    color: var(--text-muted);
  }

  /* Spinner variant centers its contents. */
  .loading-state:has(.loading-state__label) {
    align-items: center;
    justify-content: center;
    padding: 2rem 1rem;
  }
</style>
