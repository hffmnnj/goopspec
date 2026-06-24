<script lang="ts">
  import { fly, type FlyParams } from 'svelte/transition';
  import { flip } from 'svelte/animate';
  import { toast as defaultToast, type ToastStore } from '$lib/stores/toast.svelte.js';
  import Toast from './Toast.svelte';

  interface ToastContainerProps {
    /** Override the toast store (tests / storybook). Defaults to the singleton. */
    store?: ToastStore;
    /** Stack placement. Defaults to top-right. */
    placement?: 'top-right' | 'top-center' | 'bottom-right' | 'bottom-center';
  }

  let { store = defaultToast, placement = 'top-right' }: ToastContainerProps = $props();

  // Respect the user's reduced-motion preference: skip the fly distance/duration.
  const reduced =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;

  const isTop = $derived(placement.startsWith('top'));

  const flyParams = $derived<FlyParams>(
    reduced
      ? { duration: 0 }
      : { y: isTop ? -16 : 16, duration: 220, opacity: 0 }
  );

  function dismiss(id: string): void {
    store.dismiss(id);
  }
</script>

{#if store.toasts.length > 0}
  <!-- Errors are announced assertively; everything else politely. -->
  <div
    class="toast-container toast-container--{placement}"
    role="status"
    aria-live="polite"
    aria-relevant="additions text"
  >
    {#each store.toasts as item (item.id)}
      <div
        class="toast-container__item"
        animate:flip={{ duration: reduced ? 0 : 220 }}
        in:fly={flyParams}
        out:fly={flyParams}
        aria-live={item.type === 'error' ? 'assertive' : undefined}
      >
        <Toast toast={item} ondismiss={dismiss} />
      </div>
    {/each}
  </div>
{/if}

<style>
  .toast-container {
    position: fixed;
    z-index: 1000;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    /* The container is click-through; individual toasts opt back in. */
    pointer-events: none;
    padding: 0.75rem;
  }

  .toast-container--top-right {
    top: 0;
    right: 0;
    align-items: flex-end;
    padding-top: calc(0.75rem + var(--safe-top, 0px));
    padding-right: calc(0.75rem + var(--safe-right, 0px));
  }

  .toast-container--top-center {
    top: 0;
    left: 50%;
    transform: translateX(-50%);
    align-items: center;
    padding-top: calc(0.75rem + var(--safe-top, 0px));
  }

  .toast-container--bottom-right {
    bottom: 0;
    right: 0;
    align-items: flex-end;
    flex-direction: column-reverse;
    padding-bottom: calc(0.75rem + var(--safe-bottom, 0px));
    padding-right: calc(0.75rem + var(--safe-right, 0px));
  }

  .toast-container--bottom-center {
    bottom: 0;
    left: 50%;
    transform: translateX(-50%);
    align-items: center;
    flex-direction: column-reverse;
    padding-bottom: calc(0.75rem + var(--safe-bottom, 0px));
  }

  .toast-container__item {
    pointer-events: auto;
    width: max-content;
    max-width: 100%;
  }
</style>
