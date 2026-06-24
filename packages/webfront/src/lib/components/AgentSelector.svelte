<script lang="ts">
  import { HugeiconsIcon } from '@hugeicons/svelte';
  import {
    AiBrain01Icon,
    ArrowDown01Icon,
    Alert02Icon,
    Loading03Icon,
    RefreshIcon,
    Tick02Icon,
  } from '@hugeicons/core-free-icons';
  import { agentDisplayName } from '$lib/agents/agent-display.js';
  import type { Agent, OpenCodeClient } from '$lib/api/types.js';
  import { agent as defaultAgent, createAgentStore } from '$lib/stores/agent.svelte.js';
  import GlassSurface from './GlassSurface.svelte';

  interface AgentSelectorProps {
    client?: OpenCodeClient;
    agentStore?: typeof defaultAgent;
  }

  let { client, agentStore = client ? createAgentStore(client) : defaultAgent }: AgentSelectorProps = $props();

  let open = $state(false);
  let activeDescendant = $state<string | null>(null);
  let popoverEl = $state<HTMLDivElement | null>(null);
  let triggerEl = $state<HTMLButtonElement | null>(null);

  const selectedLabel = $derived(agentDisplayName(agentStore.selectedAgentId ?? 'goop-orchestrator'));
  const optionIds = $derived(agentStore.agents.map((candidate) => `agent-option-${candidate.id}`));

  async function loadAgents(): Promise<void> {
    await agentStore.refresh();
    activeDescendant = optionIds[0] ?? null;
  }

  function openMenu(): void {
    open = true;
    if (agentStore.agents.length === 0) void loadAgents();
    else activeDescendant = optionIds[0] ?? null;
  }

  function closeMenu(): void {
    open = false;
    activeDescendant = null;
    triggerEl?.focus();
  }

  function select(candidate: Agent): void {
    agentStore.select(candidate.id);
    closeMenu();
  }

  function handleTriggerClick(): void {
    if (open) closeMenu();
    else openMenu();
  }

  function handleTriggerKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (!open) openMenu();
    }
  }

  function moveActive(direction: number): void {
    if (optionIds.length === 0) return;
    const current = activeDescendant ? optionIds.indexOf(activeDescendant) : -1;
    activeDescendant = optionIds[Math.max(0, Math.min(optionIds.length - 1, current + direction))];
    document.getElementById(activeDescendant)?.scrollIntoView({ block: 'nearest' });
  }

  function activateCurrent(): void {
    if (!activeDescendant) return;
    document.getElementById(activeDescendant)?.click();
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
    }
  }

  function handleClickOutside(event: MouseEvent): void {
    const target = event.target as Node | null;
    if (!target || !popoverEl || !triggerEl) return;
    if (!popoverEl.contains(target) && !triggerEl.contains(target)) closeMenu();
  }

  $effect(() => {
    void loadAgents();
  });

  $effect(() => {
    if (!open) return;
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  });
</script>

<div class="agent-selector">
  <button
    bind:this={triggerEl}
    type="button"
    class="trigger"
    aria-haspopup="listbox"
    aria-expanded={open}
    aria-controls={open ? 'agent-listbox' : undefined}
    aria-label={`Selected agent: ${selectedLabel}`}
    title={`Selected agent: ${selectedLabel}`}
    onclick={handleTriggerClick}
    onkeydown={handleTriggerKeydown}
  >
    <span class="trigger-icon" aria-hidden="true">
      <HugeiconsIcon icon={AiBrain01Icon} size={16} strokeWidth={1.5} color="currentColor" />
    </span>
    <span class="trigger-label">{selectedLabel}</span>
    <span class="trigger-chevron" class:open aria-hidden="true">
      <HugeiconsIcon icon={ArrowDown01Icon} size={14} strokeWidth={1.5} color="currentColor" />
    </span>
  </button>

  {#if open}
    <div
      class="popover"
      id="agent-listbox"
      role="listbox"
      tabindex={-1}
      aria-label="Agents"
      aria-activedescendant={activeDescendant ?? undefined}
      bind:this={popoverEl}
      onkeydown={handlePopoverKeydown}
    >
      <GlassSurface variant="floating" class="popover-surface">
        {#if agentStore.loading}
          <div class="state loading" aria-busy="true">
            <span class="spin"><HugeiconsIcon icon={Loading03Icon} size={18} strokeWidth={1.5} color="currentColor" /></span>
            Loading agents…
          </div>
        {:else if agentStore.error}
          <div class="state error" role="alert">
            <HugeiconsIcon icon={Alert02Icon} size={18} strokeWidth={1.5} color="currentColor" />
            <span>{agentStore.error}</span>
            <button type="button" class="retry-btn" onclick={() => void loadAgents()}>
              <HugeiconsIcon icon={RefreshIcon} size={14} strokeWidth={1.5} color="currentColor" />
              Retry
            </button>
          </div>
        {:else if agentStore.agents.length === 0}
          <div class="state empty" role="status">No agents available.</div>
        {:else}
          <ul class="options" role="presentation">
            {#each agentStore.agents as candidate (candidate.id)}
              {@const optionId = `agent-option-${candidate.id}`}
              {@const isSelected = agentStore.selectedAgentId === candidate.id}
              <li role="presentation">
                <button
                  id={optionId}
                  type="button"
                  class="option"
                  class:selected={isSelected}
                  class:active={activeDescendant === optionId}
                  role="option"
                  aria-selected={isSelected}
                  onclick={() => select(candidate)}
                  onmouseenter={() => (activeDescendant = optionId)}
                >
                  <span class="option-copy">
                    <span class="option-name">{agentDisplayName(candidate.id)}</span>
                    {#if candidate.description}
                      <span class="option-description">{candidate.description}</span>
                    {/if}
                  </span>
                  {#if isSelected}
                    <span class="option-check" aria-hidden="true">
                      <HugeiconsIcon icon={Tick02Icon} size={14} strokeWidth={2} color="currentColor" />
                    </span>
                  {/if}
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </GlassSurface>
    </div>
  {/if}
</div>

<style>
  .agent-selector {
    position: relative;
    display: inline-flex;
  }

  .trigger {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    max-width: 13rem;
    padding: 0.375rem 0.625rem 0.375rem 0.5rem;
    font: inherit;
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--text-secondary);
    background-color: transparent;
    border: 1px solid var(--border);
    border-radius: var(--radius-full);
    cursor: pointer;
    transition: border-color var(--transition-fast), background-color var(--transition-fast), color var(--transition-fast);
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
    width: 19rem;
    max-height: min(24rem, 60vh);
    border-radius: var(--radius-lg);
  }

  :global(.popover-surface) {
    display: flex;
    flex-direction: column;
    max-height: inherit;
    padding: 0.5rem;
  }

  .options {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .option {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.625rem;
    border: 1px solid transparent;
    border-radius: var(--radius);
    background: transparent;
    color: var(--text-secondary);
    text-align: left;
    cursor: pointer;
  }

  .option:hover,
  .option.active {
    color: var(--text-primary);
    background: var(--bg-surface);
    border-color: var(--border);
  }

  .option.selected {
    color: var(--accent-text);
  }

  .option-copy {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.1875rem;
  }

  .option-name {
    font-size: 0.8125rem;
    font-weight: 600;
  }

  .option-description {
    font-size: 0.75rem;
    color: var(--text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .option-check {
    display: inline-flex;
    flex-shrink: 0;
  }

  .state {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem;
    color: var(--text-muted);
    font-size: 0.8125rem;
  }

  .state.error {
    color: var(--danger);
    align-items: flex-start;
  }

  .retry-btn {
    margin-left: auto;
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.25rem 0.5rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: transparent;
    color: currentColor;
    cursor: pointer;
  }

  .spin {
    display: inline-flex;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (max-width: 520px) {
    .trigger {
      max-width: 8.5rem;
    }
    .popover {
      right: auto;
      left: 0;
      width: min(19rem, calc(100vw - 2rem));
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .trigger,
    .trigger-chevron,
    .spin {
      transition: none;
      animation: none;
    }
  }
</style>
