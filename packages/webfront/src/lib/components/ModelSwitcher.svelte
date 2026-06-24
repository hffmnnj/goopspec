<script lang="ts">
  import { HugeiconsIcon } from '@hugeicons/svelte';
  import {
    AiBrain01Icon,
    ArrowDown01Icon,
    Loading03Icon,
    Alert02Icon,
    Tick02Icon,
    Search01Icon,
    RefreshIcon
  } from '@hugeicons/core-free-icons';
  import { fetchProviders, groupModelsByProvider, formatContext, findModelInProvider } from '$lib/api/providers.js';
  import type { Model, OpenCodeClient, Provider } from '$lib/api/types.js';
  import { model as defaultModel } from '$lib/stores/model.svelte.js';
  import GlassSurface from './GlassSurface.svelte';

  interface ModelSwitcherProps {
    /** Override the OpenCode client (tests). */
    client?: OpenCodeClient;
    /** Override the selection store (tests). */
    modelStore?: typeof defaultModel;
  }

  let { client, modelStore = defaultModel }: ModelSwitcherProps = $props();

  const resolvedClient = $derived(client ?? null);

  let open = $state(false);
  let providers = $state<Provider[]>([]);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let query = $state('');
  let activeDescendant = $state<string | null>(null);
  let popoverEl = $state<HTMLDivElement | null>(null);
  let triggerEl = $state<HTMLButtonElement | null>(null);
  let searchEl = $state<HTMLInputElement | null>(null);

  const grouped = $derived(groupModelsByProvider(providers));
  const hasSelection = $derived(modelStore.selectedProviderId && modelStore.selectedModelId);

  const selectedModel = $derived(
    hasSelection && modelStore.selectedProviderId && modelStore.selectedModelId
      ? findModelInProvider(providers, modelStore.selectedProviderId, modelStore.selectedModelId) ?? null
      : null
  );

  const currentProvider = $derived(
    hasSelection
      ? providers.find((provider) => provider.id === modelStore.selectedProviderId) ?? null
      : null
  );

  const filtered = $derived(() => {
    const q = query.trim().toLowerCase();
    if (!q) return grouped;
    const result = new Map<string, Model[]>();
    for (const [providerId, models] of grouped.entries()) {
      const provider = providers.find((p) => p.id === providerId);
      const matches = models.filter(
        (modelItem) =>
          modelItem.name.toLowerCase().includes(q) ||
          provider?.name.toLowerCase().includes(q) ||
          false
      );
      if (matches.length > 0) {
        result.set(providerId, matches);
      }
    }
    return result;
  });

  const optionIds = $derived(() => {
    const ids: string[] = [];
    for (const [providerId, models] of filtered().entries()) {
      for (const modelItem of models) {
        ids.push(`model-option-${providerId}-${modelItem.id}`);
      }
    }
    return ids;
  });

  async function loadProviders(): Promise<void> {
    if (!resolvedClient) {
      error = 'No OpenCode client available';
      return;
    }
    loading = true;
    error = null;
    try {
      providers = await fetchProviders(resolvedClient);
      modelStore.setProviders(providers);
      if (providers.length > 0 && optionIds().length > 0) {
        activeDescendant = optionIds()[0];
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load providers';
    } finally {
      loading = false;
    }
  }

  function openMenu(): void {
    open = true;
    query = '';
    if (providers.length === 0) {
      void loadProviders();
    }
    queueMicrotask(() => {
      searchEl?.focus();
      scrollActiveIntoView();
    });
  }

  function closeMenu(): void {
    open = false;
    activeDescendant = null;
    triggerEl?.focus();
  }

  function select(providerId: string, modelId: string): void {
    modelStore.select(providerId, modelId);
    closeMenu();
  }

  function handleTriggerClick(): void {
    if (open) {
      closeMenu();
    } else {
      openMenu();
    }
  }

  function handleTriggerKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (!open) openMenu();
    }
  }

  function moveActive(direction: number): void {
    const ids = optionIds();
    if (ids.length === 0) return;
    const current = activeDescendant ? ids.indexOf(activeDescendant) : -1;
    const next = Math.max(0, Math.min(ids.length - 1, current + direction));
    activeDescendant = ids[next];
    scrollActiveIntoView();
  }

  function activateCurrent(): void {
    if (!activeDescendant) return;
    const option = document.getElementById(activeDescendant);
    option?.click();
  }

  function scrollActiveIntoView(): void {
    if (!activeDescendant) return;
    const option = document.getElementById(activeDescendant);
    option?.scrollIntoView({ block: 'nearest' });
  }

  function handlePopoverKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeMenu();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveActive(1);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveActive(-1);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      activateCurrent();
      return;
    }
    if (event.key === 'Tab') {
      // Keep focus inside the popover while it is open.
      const focusable = popoverEl?.querySelectorAll<HTMLElement>(
        'button, input, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }

  function handleClickOutside(event: MouseEvent): void {
    const target = event.target as Node | null;
    if (!popoverEl || !triggerEl || !target) return;
    if (!popoverEl.contains(target) && !triggerEl.contains(target)) {
      closeMenu();
    }
  }

  $effect(() => {
    if (!open) return;
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  });
</script>

<div class="model-switcher">
  <button
    bind:this={triggerEl}
    type="button"
    class="trigger"
    aria-haspopup="listbox"
    aria-expanded={open}
    aria-controls={open ? 'model-listbox' : undefined}
    aria-label={selectedModel ? `Selected model: ${selectedModel.name}` : 'Select a model'}
    title={selectedModel ? `${selectedModel.name} · ${currentProvider?.name ?? ''}` : 'Select a model'}
    onclick={handleTriggerClick}
    onkeydown={handleTriggerKeydown}
  >
    <span class="trigger-icon" aria-hidden="true">
      <HugeiconsIcon icon={AiBrain01Icon} size={16} strokeWidth={1.5} color="currentColor" />
    </span>
    <span class="trigger-label">
      {#if selectedModel}
        {selectedModel.name}
      {:else}
        Model
      {/if}
    </span>
    {#if currentProvider}
      <span class="trigger-provider">{currentProvider.name}</span>
    {/if}
    <span class="trigger-chevron" class:open aria-hidden="true">
      <HugeiconsIcon icon={ArrowDown01Icon} size={14} strokeWidth={1.5} color="currentColor" />
    </span>
  </button>

  {#if open}
    <div
      class="popover"
      id="model-listbox"
      role="listbox"
      tabindex={-1}
      aria-label="Models"
      aria-activedescendant={activeDescendant ?? undefined}
      bind:this={popoverEl}
      onkeydown={handlePopoverKeydown}
    >
      <GlassSurface variant="floating" class="popover-surface">
        <div class="search-row">
          <span class="search-icon" aria-hidden="true">
            <HugeiconsIcon icon={Search01Icon} size={14} strokeWidth={1.5} color="currentColor" />
          </span>
          <input
            bind:this={searchEl}
            type="text"
            class="search-input"
            placeholder="Search models…"
            aria-label="Search models"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
            bind:value={query}
          />
        </div>

        {#if loading}
          <div class="state loading" aria-busy="true">
            <span class="spin">
              <HugeiconsIcon icon={Loading03Icon} size={18} strokeWidth={1.5} color="currentColor" />
            </span>
            <span>Loading providers…</span>
          </div>
        {:else if error}
          <div class="state error" role="alert">
            <HugeiconsIcon icon={Alert02Icon} size={18} strokeWidth={1.5} color="currentColor" />
            <span>{error}</span>
            <button type="button" class="retry-btn" onclick={() => void loadProviders()}>
              <HugeiconsIcon icon={RefreshIcon} size={14} strokeWidth={1.5} color="currentColor" />
              Retry
            </button>
          </div>
        {:else if filtered().size === 0}
          <div class="state empty" role="status">
            {#if providers.length === 0}
              No providers configured.
            {:else}
              No models match your search.
            {/if}
          </div>
        {:else}
          <div class="options" role="presentation">
            {#each Array.from(filtered().entries()) as [providerId, models] (providerId)}
              {@const provider = providers.find((p) => p.id === providerId)}
              {#if provider}
                <div class="provider-group" role="presentation">
                  <div class="provider-heading" role="presentation">{provider.name}</div>
                  <ul class="provider-options" role="presentation">
                    {#each models as modelItem (modelItem.id)}
                      {@const optionId = `model-option-${providerId}-${modelItem.id}`}
                      {@const isSelected =
                        modelStore.selectedProviderId === providerId &&
                        modelStore.selectedModelId === modelItem.id}
                      <li role="presentation">
                        <button
                          id={optionId}
                          type="button"
                          class="option"
                          class:selected={isSelected}
                          class:active={activeDescendant === optionId}
                          role="option"
                          aria-selected={isSelected}
                          onclick={() => select(providerId, modelItem.id)}
                          onmouseenter={() => (activeDescendant = optionId)}
                        >
                          <span class="option-name">{modelItem.name}</span>
                          {#if formatContext(modelItem.context)}
                            <span class="option-context">{formatContext(modelItem.context)}</span>
                          {/if}
                          {#if isSelected}
                            <span class="option-check" aria-hidden="true">
                              <HugeiconsIcon
                                icon={Tick02Icon}
                                size={14}
                                strokeWidth={2}
                                color="currentColor"
                              />
                            </span>
                          {/if}
                        </button>
                      </li>
                    {/each}
                  </ul>
                </div>
              {/if}
            {/each}
          </div>
        {/if}
      </GlassSurface>
    </div>
  {/if}
</div>

<style>
  .model-switcher {
    position: relative;
    display: inline-flex;
  }

  .trigger {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    max-width: 18rem;
    padding: 0.375rem 0.625rem 0.375rem 0.5rem;
    font: inherit;
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--text-secondary);
    background-color: transparent;
    border: 1px solid var(--border);
    border-radius: var(--radius-full);
    cursor: pointer;
    transition:
      border-color var(--transition-fast),
      background-color var(--transition-fast),
      color var(--transition-fast);
  }

  .trigger:hover {
    color: var(--text-primary);
    background-color: var(--bg-surface);
    border-color: var(--border-strong);
  }

  .trigger:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }

  .trigger-icon {
    display: inline-flex;
    color: var(--accent-text);
  }

  .trigger-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .trigger-provider {
    padding-left: 0.375rem;
    border-left: 1px solid var(--border);
    color: var(--text-muted);
    font-weight: 400;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .trigger-chevron {
    display: inline-flex;
    color: var(--text-muted);
    transition: transform var(--transition-fast);
  }

  .trigger-chevron.open {
    transform: rotate(180deg);
  }

  .popover {
    position: absolute;
    top: calc(100% + 0.375rem);
    right: 0;
    z-index: 40;
    width: 20rem;
    max-height: min(28rem, 60vh);
    border-radius: var(--radius-lg);
  }

  :global(.popover-surface) {
    display: flex;
    flex-direction: column;
    max-height: inherit;
    padding: 0.5rem;
  }

  .search-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.625rem;
    margin-bottom: 0.25rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background-color: var(--bg-base);
  }

  .search-icon {
    display: inline-flex;
    color: var(--text-muted);
  }

  .search-input {
    flex: 1;
    min-width: 0;
    padding: 0;
    font: inherit;
    font-size: 0.8125rem;
    color: var(--text-primary);
    background: transparent;
    border: none;
    outline: none;
  }

  .search-input::placeholder {
    color: var(--text-muted);
  }

  .options {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .provider-group {
    padding: 0.375rem 0;
  }

  .provider-heading {
    padding: 0.25rem 0.625rem;
    font-size: 0.6875rem;
    font-weight: 600;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    color: var(--text-muted);
  }

  .provider-options {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .option {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.5rem 0.625rem;
    font: inherit;
    font-size: 0.8125rem;
    color: var(--text-secondary);
    text-align: left;
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition:
      background-color var(--transition-fast),
      color var(--transition-fast);
  }

  .option:hover,
  .option.active {
    background-color: var(--bg-surface);
    color: var(--text-primary);
  }

  .option.selected {
    color: var(--accent-text);
  }

  .option:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: -2px;
  }

  .option-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .option-context {
    flex-shrink: 0;
    font-size: 0.6875rem;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
  }

  .option-check {
    display: inline-flex;
    flex-shrink: 0;
    color: var(--accent-text);
  }

  .state {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 1.25rem 1rem;
    font-size: 0.8125rem;
    text-align: center;
    color: var(--text-muted);
  }

  .state.loading {
    color: var(--text-secondary);
  }

  .state.error {
    flex-direction: column;
    color: var(--danger-text);
  }

  .retry-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    margin-top: 0.25rem;
    padding: 0.375rem 0.625rem;
    font: inherit;
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--text-primary);
    background-color: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    cursor: pointer;
  }

  .retry-btn:hover {
    background-color: var(--bg-surface);
  }

  .spin {
    display: inline-flex;
    animation: spin 0.9s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .trigger-chevron {
      transition: none;
    }

    .spin {
      animation: none;
    }
  }
</style>
