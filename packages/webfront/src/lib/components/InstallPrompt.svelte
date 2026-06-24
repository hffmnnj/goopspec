<script lang="ts">
  import { onMount } from 'svelte';
  import { HugeiconsIcon } from '@hugeicons/svelte';
  import { Download04Icon, SmartPhone01Icon, Cancel01Icon } from '@hugeicons/core-free-icons';
  import { pwa } from '$lib/stores/pwa.svelte';
  import GlassSurface from './GlassSurface.svelte';

  const ICON_SIZE = 20;
  const STROKE = 1.5;

  let installing = $state(false);

  onMount(() => pwa.init());

  const visible = $derived(pwa.shouldShowBanner);

  async function handleInstall(): Promise<void> {
    if (installing) return;
    installing = true;
    try {
      await pwa.promptInstall();
    } finally {
      installing = false;
    }
  }

  function handleDismiss(): void {
    pwa.dismiss();
  }
</script>

{#if visible}
  <GlassSurface
    element="aside"
    variant="floating"
    class="install-prompt"
    role="dialog"
    aria-labelledby="install-prompt-title"
    aria-describedby="install-prompt-desc"
  >
    <span class="install-prompt__icon" aria-hidden="true">
      <HugeiconsIcon icon={SmartPhone01Icon} size={ICON_SIZE} strokeWidth={STROKE} color="currentColor" />
    </span>

    <div class="install-prompt__body">
      <p id="install-prompt-title" class="install-prompt__title">Install GoopSpec</p>
      <p id="install-prompt-desc" class="install-prompt__desc">
        Add GoopSpec to your home screen for a faster, full-screen, offline-ready workspace.
      </p>
    </div>

    <div class="install-prompt__actions">
      <button
        type="button"
        class="install-prompt__btn install-prompt__btn--primary"
        onclick={handleInstall}
        disabled={installing}
        aria-busy={installing}
      >
        <HugeiconsIcon icon={Download04Icon} size={16} strokeWidth={STROKE} color="currentColor" aria-hidden="true" />
        <span>{installing ? 'Installing…' : 'Install'}</span>
      </button>
      <button
        type="button"
        class="install-prompt__btn install-prompt__btn--ghost"
        onclick={handleDismiss}
      >
        Not now
      </button>
    </div>

    <button
      type="button"
      class="install-prompt__close"
      onclick={handleDismiss}
      aria-label="Dismiss install prompt"
    >
      <HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={STROKE} color="currentColor" aria-hidden="true" />
    </button>
  </GlassSurface>
{/if}

<style>
  :global(.install-prompt) {
    position: relative;
    display: grid;
    grid-template-columns: auto 1fr;
    grid-template-areas:
      'icon body'
      'actions actions';
    gap: 0.5rem 0.875rem;
    width: min(22rem, calc(100vw - 2rem));
    padding: 1rem 1.1rem;
    border-radius: var(--radius-lg) !important;
    box-shadow: var(--shadow-md);
    animation: install-prompt-in var(--transition-base);
  }

  .install-prompt__icon {
    grid-area: icon;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2.25rem;
    height: 2.25rem;
    border-radius: var(--radius);
    background: var(--accent-soft);
    color: var(--accent);
  }

  .install-prompt__body {
    grid-area: body;
    min-width: 0;
  }

  .install-prompt__title {
    margin: 0;
    font-size: 0.9375rem;
    font-weight: 600;
    letter-spacing: -0.01em;
    color: var(--text-primary);
  }

  .install-prompt__desc {
    margin: 0.2rem 0 0;
    font-size: 0.8125rem;
    line-height: 1.4;
    color: var(--text-secondary);
  }

  .install-prompt__actions {
    grid-area: actions;
    display: flex;
    gap: 0.5rem;
    margin-top: 0.25rem;
  }

  .install-prompt__btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.375rem;
    padding: 0.5rem 0.875rem;
    font: inherit;
    font-size: 0.8125rem;
    font-weight: 600;
    line-height: 1;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition:
      background-color var(--transition-fast),
      color var(--transition-fast),
      opacity var(--transition-fast);
  }

  .install-prompt__btn--primary {
    flex: 1;
    background: var(--accent);
    color: var(--accent-foreground);
  }

  .install-prompt__btn--primary:hover {
    background: var(--accent-hover);
  }

  .install-prompt__btn--primary:disabled {
    opacity: 0.65;
    cursor: progress;
  }

  .install-prompt__btn--ghost {
    background: transparent;
    color: var(--text-secondary);
  }

  .install-prompt__btn--ghost:hover {
    color: var(--text-primary);
  }

  .install-prompt__btn:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .install-prompt__close {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.75rem;
    height: 1.75rem;
    padding: 0;
    background: transparent;
    border: none;
    border-radius: var(--radius-full);
    color: var(--text-muted);
    cursor: pointer;
    transition:
      color var(--transition-fast),
      background-color var(--transition-fast);
  }

  .install-prompt__close:hover {
    color: var(--text-primary);
    background: var(--bg-surface);
  }

  .install-prompt__close:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  @keyframes install-prompt-in {
    from {
      opacity: 0;
      transform: translateY(0.75rem) scale(0.98);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    :global(.install-prompt) {
      animation: none;
    }
  }
</style>
