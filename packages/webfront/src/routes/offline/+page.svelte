<script lang="ts">
  import { HugeiconsIcon } from '@hugeicons/svelte';
  import { CloudOffIcon, RefreshIcon, SparklesIcon } from '@hugeicons/core-free-icons';
  import GlassSurface from '$lib/components/GlassSurface.svelte';
  import { pwa } from '$lib/stores/pwa.svelte';

  const STROKE = 1.5;

  // Reflect live connectivity: once the network returns, invite a retry.
  const backOnline = $derived(!pwa.offline);

  function retry(): void {
    if (typeof window !== 'undefined') window.location.reload();
  }
</script>

<svelte:head>
  <title>Offline · GoopSpec</title>
</svelte:head>

<div class="offline">
  <div class="backdrop" aria-hidden="true">
    <span class="blob blob--a"></span>
    <span class="blob blob--b"></span>
  </div>

  <GlassSurface element="section" variant="floating" class="offline-card" role="alert" aria-live="polite">
    <span class="offline-card__brand">
      <HugeiconsIcon icon={SparklesIcon} size={16} strokeWidth={STROKE} color="currentColor" aria-hidden="true" />
      <span>GoopSpec</span>
    </span>

    <span class="offline-card__icon" aria-hidden="true">
      <HugeiconsIcon icon={CloudOffIcon} size={40} strokeWidth={STROKE} color="currentColor" />
    </span>

    <h1 class="offline-card__title">You're offline</h1>
    <p class="offline-card__body">
      {#if backOnline}
        Your connection is back. Reload to pick up where you left off.
      {:else}
        GoopSpec can't reach the network right now. Check your connection — your
        workspace will be here when you're back.
      {/if}
    </p>

    <button type="button" class="offline-card__retry" onclick={retry}>
      <HugeiconsIcon icon={RefreshIcon} size={16} strokeWidth={STROKE} color="currentColor" aria-hidden="true" />
      <span>{backOnline ? 'Reload' : 'Try again'}</span>
    </button>
  </GlassSurface>
</div>

<style>
  .offline {
    position: relative;
    display: grid;
    place-items: center;
    min-height: 100vh;
    padding: 1.5rem;
    overflow: hidden;
  }

  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 0;
    pointer-events: none;
  }

  .blob {
    position: absolute;
    border-radius: var(--radius-full);
    filter: blur(80px);
    opacity: 0.35;
  }

  .blob--a {
    top: -10%;
    left: -8%;
    width: 40vw;
    height: 40vw;
    background: var(--accent);
  }

  .blob--b {
    bottom: -12%;
    right: -10%;
    width: 44vw;
    height: 44vw;
    background: var(--accent-soft);
    opacity: 0.6;
  }

  :global(.offline-card) {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    width: min(26rem, 100%);
    padding: 2.25rem 2rem;
  }

  .offline-card__brand {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    margin-bottom: 1.5rem;
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    color: var(--accent-text);
  }

  .offline-card__icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 4.5rem;
    height: 4.5rem;
    border-radius: var(--radius-full);
    background: var(--accent-soft);
    color: var(--accent-text);
  }

  .offline-card__title {
    margin: 1.25rem 0 0;
    font-size: 1.5rem;
    font-weight: 700;
    letter-spacing: -0.02em;
    color: var(--text-primary);
  }

  .offline-card__body {
    margin: 0.75rem auto 0;
    max-width: 20rem;
    font-size: 0.9375rem;
    line-height: 1.5;
    color: var(--text-secondary);
  }

  .offline-card__retry {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 1.75rem;
    padding: 0.625rem 1.25rem;
    font: inherit;
    font-size: 0.875rem;
    font-weight: 600;
    line-height: 1;
    color: var(--accent-foreground);
    background: var(--accent);
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: background-color var(--transition-fast);
  }

  .offline-card__retry:hover {
    background: var(--accent-hover);
  }

  .offline-card__retry:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }
</style>
