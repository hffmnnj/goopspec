<script lang="ts">
  import { HugeiconsIcon } from '@hugeicons/svelte';
  import { KeyboardIcon, Cancel01Icon, CommandIcon } from '@hugeicons/core-free-icons';
  import { ui } from '$lib/stores/ui.svelte.js';
  import { formatCombo, type Shortcut } from '$lib/keyboard/registry.js';
  import { defaultShortcuts } from '$lib/keyboard/shortcuts.js';
  import { isMac } from '$lib/keyboard/platform.js';

  interface ShortcutHelpProps {
    /** Override the shortcut list (tests). */
    shortcuts?: Shortcut[];
  }

  let { shortcuts = defaultShortcuts }: ShortcutHelpProps = $props();

  let dialogEl = $state<HTMLDivElement | null>(null);
  let previouslyFocused = $state<HTMLElement | null>(null);
  const mac = $derived(isMac());

  const grouped = $derived(() => {
    const map = new Map<string, Shortcut[]>();
    for (const shortcut of shortcuts) {
      const list = map.get(shortcut.category) ?? [];
      list.push(shortcut);
      map.set(shortcut.category, list);
    }
    return map;
  });

  function requestClose(): void {
    ui.helpOpen = false;
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      requestClose();
      return;
    }
    if (event.key === 'Tab') trapFocus(event);
  }

  function focusableElements(): HTMLElement[] {
    if (!dialogEl) return [];
    const selector =
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    return Array.from(dialogEl.querySelectorAll<HTMLElement>(selector));
  }

  function trapFocus(event: KeyboardEvent): void {
    const focusable = focusableElements();
    if (focusable.length === 0) return;
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

  $effect(() => {
    if (!ui.helpOpen) return;
    if (typeof document !== 'undefined') {
      previouslyFocused = document.activeElement as HTMLElement | null;
    }
    queueMicrotask(() => {
      const focusable = focusableElements();
      (focusable[0] ?? dialogEl)?.focus();
    });
    return () => previouslyFocused?.focus?.();
  });
</script>

{#if ui.helpOpen}
  <div
    class="shortcut-help-overlay"
    role="presentation"
    aria-hidden="false"
    onclick={requestClose}
  >
    <div
      class="shortcut-help-dialog glass-surface glass-surface--floating"
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcut-help-title"
      tabindex={-1}
      bind:this={dialogEl}
      onkeydown={handleKeydown}
      onclick={(event: MouseEvent) => event.stopPropagation()}
    >
      <header class="shortcut-help-header">
        <div class="title-row">
          <HugeiconsIcon icon={KeyboardIcon} size={18} color="currentColor" strokeWidth={1.5} />
          <h2 id="shortcut-help-title" class="shortcut-help-title">Keyboard shortcuts</h2>
        </div>
        <button
          type="button"
          class="icon-btn close-btn"
          aria-label="Close keyboard shortcuts"
          title="Close"
          onclick={requestClose}
        >
          <HugeiconsIcon icon={Cancel01Icon} size={18} color="currentColor" strokeWidth={1.5} />
        </button>
      </header>

      <div class="shortcut-help-body">
        <div class="hint">
          <HugeiconsIcon icon={CommandIcon} size={14} color="currentColor" strokeWidth={1.5} />
          {#if mac}
            <span>⌘ = Command, ⌥ = Option, ⌃ = Control, ⇧ = Shift</span>
          {:else}
            <span>Ctrl / Alt / Shift modifiers work everywhere.</span>
          {/if}
        </div>

        {#each grouped() as [category, items] (category)}
          <section class="category" aria-labelledby="cat-{category}">
            <h3 id="cat-{category}" class="category-title">{category}</h3>
            <ul class="shortcut-list" role="list">
              {#each items as shortcut (shortcut.id)}
                <li class="shortcut-row">
                  <span class="shortcut-description">{shortcut.description}</span>
                  <span class="shortcut-combos">
                    {#each shortcut.keys as combo, index (combo)}
                      {@const formatted = formatCombo(combo, mac)}
                      {#if index > 0}
                        <span class="combo-or" aria-hidden="true">or</span>
                      {/if}
                      <kbd class="shortcut-kbd">{formatted}</kbd>
                    {/each}
                  </span>
                </li>
              {/each}
            </ul>
          </section>
        {/each}
      </div>
    </div>
  </div>
{/if}

<style>
  .shortcut-help-overlay {
    position: fixed;
    inset: 0;
    z-index: 60;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    background: rgba(0, 0, 0, 0.45);
    animation: overlay-in var(--transition-base) var(--ease-out);
  }

  .shortcut-help-dialog {
    width: min(34rem, 100%);
    max-height: min(85vh, 46rem);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    outline: none;
    animation: dialog-in var(--transition-base) var(--ease-out);
  }

  .shortcut-help-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 1rem 1.25rem;
    border-bottom: 1px solid var(--border);
  }

  .title-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .shortcut-help-title {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    padding: 0;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    transition:
      color var(--transition-fast),
      background-color var(--transition-fast);
  }

  .icon-btn:hover {
    color: var(--text-primary);
    background-color: var(--bg-surface);
  }

  .icon-btn:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .shortcut-help-body {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 1rem 1.25rem 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .hint {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    border-radius: var(--radius);
    background-color: var(--bg-base);
    color: var(--text-secondary);
    font-size: 0.8125rem;
  }

  .category {
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
  }

  .category-title {
    margin: 0;
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-secondary);
  }

  .shortcut-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
  }

  .shortcut-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.5rem 0;
    border-bottom: 1px solid var(--border);
  }

  .shortcut-row:last-child {
    border-bottom: none;
  }

  .shortcut-description {
    font-size: 0.875rem;
    color: var(--text-primary);
  }

  .shortcut-combos {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    flex-shrink: 0;
  }

  .combo-or {
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .shortcut-kbd {
    display: inline-flex;
    align-items: center;
    min-width: 1.5rem;
    height: 1.625rem;
    padding: 0 0.375rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background-color: var(--bg-base);
    font-family: var(--font-mono);
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--text-secondary);
    box-shadow: 0 1px 0 var(--border);
  }

  @keyframes overlay-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  @keyframes dialog-in {
    from {
      opacity: 0;
      transform: translateY(8px) scale(0.98);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .shortcut-help-overlay,
    .shortcut-help-dialog {
      animation: none;
    }
  }
</style>
