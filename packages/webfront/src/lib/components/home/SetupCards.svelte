<script lang="ts">
  import { HugeiconsIcon } from '@hugeicons/svelte';
  import { ArrowRight01Icon, Settings02Icon } from '@hugeicons/core-free-icons';
  import type { SetupCard } from './home.js';

  interface SetupCardsProps {
    /** Cards to render. The section hides itself when this is empty. */
    cards: SetupCard[];
    /** Navigate to a settings sub-route (injected for tests). */
    navigate: (target: string) => void;
  }

  let { cards, navigate }: SetupCardsProps = $props();
</script>

{#if cards.length > 0}
  <section class="setup-cards" aria-labelledby="setup-title">
    <div class="setup-head">
      <span class="setup-icon" aria-hidden="true">
        <HugeiconsIcon icon={Settings02Icon} size={14} strokeWidth={1.5} color="currentColor" />
      </span>
      <h2 id="setup-title" class="setup-title">Setup</h2>
    </div>

    <ul class="setup-list" role="list">
      {#each cards as card (card.id)}
        <li>
          <button
            type="button"
            class="setup-card"
            onclick={() => navigate(card.href)}
            aria-label={`${card.title} — configure in settings`}
          >
            <span class="setup-text">
              <span class="setup-card-title">{card.title}</span>
              <span class="setup-card-desc">{card.description}</span>
            </span>
            <span class="setup-action">
              Configure
              <HugeiconsIcon icon={ArrowRight01Icon} size={15} strokeWidth={1.5} color="currentColor" />
            </span>
          </button>
        </li>
      {/each}
    </ul>
  </section>
{/if}

<style>
  .setup-cards {
    display: flex;
    flex-direction: column;
    gap: 0.875rem;
  }

  .setup-head {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    color: var(--text-secondary);
  }

  .setup-icon {
    display: inline-flex;
    align-items: center;
  }

  .setup-title {
    margin: 0;
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .setup-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
  }

  .setup-card {
    display: flex;
    align-items: center;
    gap: 1rem;
    width: 100%;
    padding: 0.875rem 1rem;
    text-align: left;
    color: var(--text-primary);
    background-color: var(--bg-elevated);
    border: 1px solid var(--border);
    border-left: 3px solid var(--accent);
    border-radius: var(--radius);
    cursor: pointer;
    transition:
      transform var(--transition-base),
      border-color var(--transition-fast),
      box-shadow var(--transition-base);
  }

  .setup-card:hover {
    transform: translateY(-1px);
    border-color: var(--border-strong);
    border-left-color: var(--accent);
    box-shadow: var(--shadow-sm);
  }

  .setup-card:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }

  .setup-text {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    min-width: 0;
    flex: 1 1 auto;
  }

  .setup-card-title {
    font-size: 0.875rem;
    font-weight: 600;
  }

  .setup-card-desc {
    font-size: 0.8125rem;
    color: var(--text-muted);
  }

  .setup-action {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    flex: 0 0 auto;
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--accent-text);
  }

  .setup-card:hover .setup-action {
    color: var(--accent);
  }

  @media (max-width: 639px) {
    .setup-card {
      align-items: flex-start;
      flex-direction: column;
      gap: 0.625rem;
    }

    .setup-action {
      align-self: flex-start;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .setup-card {
      transition: none;
    }

    .setup-card:hover {
      transform: none;
    }
  }
</style>
