<script lang="ts">
  import { HugeiconsIcon } from '@hugeicons/svelte';
  import { Sun03Icon, Moon02Icon } from '@hugeicons/core-free-icons';
  import { theme, toggleTheme } from '$lib/stores/theme.svelte';

  let isDark = $derived(theme.current === 'dark');
  let label = $derived(
    isDark ? 'Switch to light theme' : 'Switch to dark theme'
  );
</script>

<button
  type="button"
  class="theme-toggle"
  onclick={toggleTheme}
  aria-label={label}
  title={label}
>
  <span class="icon" aria-hidden="true">
    {#if isDark}
      <span class="swap">
        <HugeiconsIcon icon={Moon02Icon} size={18} color="currentColor" strokeWidth={1.5} />
      </span>
    {:else}
      <span class="swap">
        <HugeiconsIcon icon={Sun03Icon} size={18} color="currentColor" strokeWidth={1.5} />
      </span>
    {/if}
  </span>
</button>

<style>
  .theme-toggle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2.25rem;
    height: 2.25rem;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: var(--radius-full);
    background-color: var(--bg-elevated);
    color: var(--text-secondary);
    cursor: pointer;
    transition:
      background-color var(--transition-fast),
      border-color var(--transition-fast),
      color var(--transition-fast),
      transform var(--transition-fast);
  }

  .theme-toggle:hover {
    color: var(--text-primary);
    border-color: var(--border-strong);
    background-color: var(--bg-surface);
  }

  .theme-toggle:active {
    transform: scale(0.94);
  }

  .icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    /* Establish a stacking context so the swap animation reads cleanly. */
    position: relative;
    width: 18px;
    height: 18px;
  }

  /* Soft scale+fade swap when the icon changes between sun and moon. */
  .swap {
    display: inline-flex;
    animation: icon-swap var(--transition-base) var(--ease-out);
  }

  @keyframes icon-swap {
    from {
      opacity: 0;
      transform: rotate(-90deg) scale(0.6);
    }
    to {
      opacity: 1;
      transform: rotate(0deg) scale(1);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .swap {
      animation: none;
    }
    .theme-toggle:active {
      transform: none;
    }
  }
</style>
